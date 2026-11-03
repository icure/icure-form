import { newQuickJSWASMModuleFromVariant, QuickJSContext, QuickJSDeferredPromise, QuickJSHandle, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten-core'
// The WebAssembly ships as a separate emscripten-module.wasm file. The variant loads its JS glue with a
// dynamic import() on first use, and the browser glue fetches the .wasm through
// `new URL('emscripten-module.wasm', import.meta.url)`, which webpack 5, rspack and Vite emit as an asset.
// Under Node (Jest) the CommonJS entry reads the file from disk.
import variant from '@jitl/quickjs-wasmfile-release-sync'

/**
 * Formula interpreter running `computedProperties` bodies inside QuickJS compiled to WebAssembly,
 * instead of `new Function` + `with` in the page's own realm.
 *
 * The contract is the one the eval-based interpreter had, so callers do not change:
 *  - `sandbox` is any object (typically a Proxy) answering bare identifiers. Each identifier a
 *    formula reads that is not a JavaScript builtin is asked of `sandbox` lazily, when the formula
 *    reads it — BridgedFormValuesContainer.compute relies on that to record dependencies.
 *  - The body may return a value or a Promise; either way the interpreter resolves to the value.
 *  - A body that does not compile, throws, rejects or times out logs and resolves to `undefined`.
 *
 * Values cross the boundary as JSON with a few tagged shapes (Date, undefined, non-finite numbers,
 * functions, the `self` scope), so `instanceof Date` holds on both sides and host functions
 * (`parseContent`, `services`, `ageText`…) stay callable from a formula. A host function returning a
 * Promise hands the formula a QuickJS promise that is settled when the host one is; pending QuickJS
 * jobs are run after every such settlement, which is what moves async formulas forward.
 */

/** Budget for one synchronous stretch of formula code (a call, or a batch of promise jobs). */
const SYNC_BUDGET_MS = 2_000
/** Budget for an async formula to settle, host lookups included. */
const ASYNC_BUDGET_MS = 30_000
const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024
const MAX_STACK_BYTES = 1024 * 1024

/** Marks a tagged value in the JSON that crosses the boundary; cannot clash with a real key. */
const TAG = '\u0000'

/**
 * Runs once per context. Receives the host callbacks, keeps them in its closure (so formulas do
 * not see them as globals) and returns the entry points the host calls.
 */
const PRELUDE = `(function (hostGet, hostCall) {
	'use strict'
	const T = ${JSON.stringify(TAG)}
	const scopes = new Map()
	const vmFns = new Map()
	let vmFnSeq = 0

	const toJson = (evalId, value) => {
		const scope = scopes.get(evalId)
		const replacer = function (key, val) {
			const raw = this[key]
			if (raw === undefined) return { [T]: 'u' }
			if (scope !== undefined && raw === scope) return { [T]: 'self' }
			if (raw instanceof Date) return { [T]: 'date', v: raw.getTime() }
			if (typeof raw === 'function') {
				const id = ++vmFnSeq
				vmFns.set(id, { fn: raw, evalId })
				return { [T]: 'fn', v: id }
			}
			if ((typeof raw === 'number' && !isFinite(raw)) || typeof raw === 'bigint') return { [T]: 'num', v: String(raw) }
			return val
		}
		try {
			return JSON.stringify({ r: value }, replacer)
		} catch (e) {
			return JSON.stringify({ r: { [T]: 'u' } })
		}
	}

	const unwrap = (evalId, r) => (typeof r === 'string' ? fromJson(evalId, r) : r)

	// A reviver returning undefined deletes the key; this marker is swapped for undefined afterwards
	// so that { a: undefined } keeps its key, as it would have without the boundary.
	const UNDEF = {}
	const restore = (v) => {
		if (v === UNDEF) return undefined
		if (v !== null && typeof v === 'object' && !(v instanceof Date) && !scopesHas(v)) Object.keys(v).forEach((k) => (v[k] = restore(v[k])))
		return v
	}
	const scopesHas = (v) => { for (const s of scopes.values()) if (s === v) return true; return false }

	const fromJson = (evalId, json) => {
		let marked = false
		const parsed = JSON.parse(json, function (key, val) {
			if (val !== null && typeof val === 'object' && T in val) {
				switch (val[T]) {
					case 'u': marked = true; return UNDEF
					case 'date': return new Date(val.v)
					case 'num': return Number(val.v)
					case 'self': return scopes.get(evalId)
					case 'fn': {
						const id = val.v
						return function () {
							return unwrap(evalId, hostCall(evalId, id, toJson(evalId, Array.prototype.slice.call(arguments))))
						}
					}
				}
			}
			return val
		}).r
		return marked ? restore(parsed) : parsed
	}

	const makeScope = (evalId) => {
		const values = new Map()
		const scope = new Proxy(Object.create(null), {
			// Builtins (Math, Date, JSON, Promise…) resolve to QuickJS's own; every other name is the host's.
			has: (target, key) => typeof key === 'string' && (key === 'self' || !(key in globalThis)),
			get: (target, key) => {
				if (typeof key !== 'string') return undefined
				if (key === 'self') return scope
				// JSON.stringify probes toJSON when a formula hands \`self\` to a host function.
				if (key === 'toJSON') return undefined
				if (values.has(key)) return values.get(key)
				const value = unwrap(evalId, hostGet(evalId, key))
				values.set(key, value)
				return value
			},
			set: (target, key, value) => {
				values.set(key, value)
				return true
			},
		})
		scopes.set(evalId, scope)
		return scope
	}

	return {
		invoke: (evalId, fn) => {
			const scope = makeScope(evalId)
			const result = fn(scope)
			if (result !== scope && result !== null && (typeof result === 'object' || typeof result === 'function') && typeof result.then === 'function') {
				return Promise.resolve(result)
			}
			return toJson(evalId, result)
		},
		exportValue: (evalId, value) => toJson(evalId, value),
		importValue: (evalId, json) => fromJson(evalId, json),
		callVm: (id, json) => {
			const entry = vmFns.get(id)
			if (!entry) throw new Error('This function belonged to a formula that has finished')
			return toJson(entry.evalId, entry.fn.apply(undefined, fromJson(entry.evalId, json)))
		},
		release: (evalId) => {
			scopes.delete(evalId)
			vmFns.forEach((entry, id) => entry.evalId === evalId && vmFns.delete(id))
		},
	}
})`

type EvalState = {
	sandbox: any
	hostFns: Map<number, (...args: unknown[]) => unknown>
	deferreds: Set<QuickJSDeferredPromise>
	released: boolean
}

type Engine = {
	runtime: QuickJSRuntime
	vm: QuickJSContext
	invoke: QuickJSHandle
	exportValue: QuickJSHandle
	importValue: QuickJSHandle
	callVm: QuickJSHandle
	release: QuickJSHandle
	compiled: Map<string, QuickJSHandle>
	states: Map<number, EvalState>
	/** Runs `fn` as one synchronous stretch, with the interrupt deadline armed at the outermost level. */
	inBudget: <T>(fn: () => T) => T
	disposed: boolean
}

let modulePromise: Promise<QuickJSWASMModule> | undefined
const loadModule = () => (modulePromise = modulePromise ?? newQuickJSWASMModuleFromVariant(variant))

const isThenable = (value: unknown): value is PromiseLike<unknown> => value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as any).then === 'function'

let hostFnSeq = 0

const hostToJson = (state: EvalState, value: unknown): string => {
	const replacer = function (this: any, key: string, val: unknown) {
		const raw = this[key]
		if (raw === undefined) return { [TAG]: 'u' }
		if (raw === state.sandbox) return { [TAG]: 'self' }
		if (raw instanceof Date) return { [TAG]: 'date', v: raw.getTime() }
		if (typeof raw === 'function') {
			const id = ++hostFnSeq
			state.hostFns.set(id, raw)
			return { [TAG]: 'fn', v: id }
		}
		if ((typeof raw === 'number' && !isFinite(raw)) || typeof raw === 'bigint') return { [TAG]: 'num', v: String(raw) }
		return val
	}
	try {
		return JSON.stringify({ r: value }, replacer)
	} catch (e) {
		// A cyclic host object: drop repeated references rather than the whole value.
		const seen = new WeakSet()
		return JSON.stringify({ r: value }, function (this: any, key: string, val: unknown) {
			const replaced = replacer.call(this, key, val)
			if (replaced !== null && typeof replaced === 'object') {
				if (seen.has(replaced)) return { [TAG]: 'u' }
				seen.add(replaced)
			}
			return replaced
		})
	}
}

/** Stands for undefined while reviving: a reviver returning undefined would delete the key. */
const UNDEFINED = Symbol('undefined')
const restoreUndefined = (state: EvalState, value: unknown): unknown => {
	if (value === UNDEFINED) return undefined
	if (value !== null && typeof value === 'object' && !(value instanceof Date) && value !== state.sandbox) {
		Object.keys(value).forEach((key) => ((value as any)[key] = restoreUndefined(state, (value as any)[key])))
	}
	return value
}

const hostFromJson = (engine: Engine, state: EvalState, evalId: number, json: string): unknown => {
	let marked = false
	const parsed = JSON.parse(json, function (key, val) {
		if (val !== null && typeof val === 'object' && TAG in val) {
			switch (val[TAG]) {
				case 'u':
					marked = true
					return UNDEFINED
				case 'date':
					return new Date(val.v)
				case 'num':
					return Number(val.v)
				case 'self':
					return state.sandbox
				case 'fn': {
					const id = val.v
					return (...args: unknown[]) => callVm(engine, state, evalId, id, args)
				}
			}
		}
		return val
	}).r
	return marked ? restoreUndefined(state, parsed) : parsed
}

const callVm = (engine: Engine, state: EvalState, evalId: number, id: number, args: unknown[]): unknown => {
	const { vm } = engine
	const idH = vm.newNumber(id)
	const argsH = vm.newString(hostToJson(state, args))
	try {
		const result = engine.inBudget(() => vm.callFunction(engine.callVm, vm.undefined, idH, argsH))
		const resultH = vm.unwrapResult(result)
		const json = vm.getString(resultH)
		resultH.dispose()
		return hostFromJson(engine, state, evalId, json)
	} finally {
		idH.dispose()
		argsH.dispose()
	}
}

const runPendingJobs = (engine: Engine) => {
	if (engine.disposed) return
	engine.inBudget(() => {
		for (;;) {
			const result = engine.runtime.executePendingJobs()
			if (result.error) {
				// A job threw outside any awaited chain (an unhandled rejection); keep draining.
				result.error.dispose()
				continue
			}
			if (result.value === 0) return
		}
	})
}

/** Copies a host value into the VM: a JSON string to import, or a promise handle for a thenable. */
const toVm = (engine: Engine, state: EvalState, evalId: number, value: unknown): QuickJSHandle => {
	const { vm } = engine
	if (isThenable(value)) {
		const deferred = vm.newPromise()
		state.deferreds.add(deferred)
		const settle = (fulfilled: boolean, outcome: unknown) => {
			if (state.released || engine.disposed || !deferred.alive) return
			state.deferreds.delete(deferred)
			if (fulfilled) {
				const json = vm.newString(hostToJson(state, outcome))
				const evalIdH = vm.newNumber(evalId)
				const imported = engine.inBudget(() => vm.callFunction(engine.importValue, vm.undefined, evalIdH, json))
				json.dispose()
				evalIdH.dispose()
				if (imported.error) {
					deferred.reject(imported.error)
					imported.error.dispose()
				} else {
					deferred.resolve(imported.value)
					imported.value.dispose()
				}
			} else {
				const error = outcome instanceof Error ? vm.newError({ name: outcome.name, message: outcome.message }) : vm.newError(String(outcome))
				deferred.reject(error)
				error.dispose()
			}
			deferred.dispose()
			runPendingJobs(engine)
		}
		Promise.resolve(value).then(
			(v) => settle(true, v),
			(e) => settle(false, e),
		)
		// The library disposes what a host function returns, so hand it a copy.
		return deferred.handle.dup()
	}
	return vm.newString(hostToJson(state, value))
}

const createEngine = async (): Promise<Engine> => {
	const module = await loadModule()
	const runtime = module.newRuntime()
	runtime.setMemoryLimit(MEMORY_LIMIT_BYTES)
	runtime.setMaxStackSize(MAX_STACK_BYTES)
	let deadline: number | undefined
	let depth = 0
	runtime.setInterruptHandler(() => deadline !== undefined && Date.now() > deadline)
	const vm = runtime.newContext()

	const engine = {
		runtime,
		vm,
		compiled: new Map(),
		states: new Map(),
		disposed: false,
		inBudget: <T>(fn: () => T): T => {
			if (depth++ === 0) deadline = Date.now() + SYNC_BUDGET_MS
			try {
				return fn()
			} finally {
				if (--depth === 0) deadline = undefined
			}
		},
	} as unknown as Engine

	const stateOf = (evalIdH: QuickJSHandle): [EvalState, number] => {
		const evalId = vm.getNumber(evalIdH)
		const state = engine.states.get(evalId)
		if (!state || state.released) throw new Error('This value belonged to a formula that has finished')
		return [state, evalId]
	}

	const hostGet = vm.newFunction('hostGet', (evalIdH, keyH) => {
		const [state, evalId] = stateOf(evalIdH)
		return toVm(engine, state, evalId, state.sandbox[vm.getString(keyH)])
	})
	const hostCall = vm.newFunction('hostCall', (evalIdH, idH, argsH) => {
		const [state, evalId] = stateOf(evalIdH)
		const fn = state.hostFns.get(vm.getNumber(idH))
		if (!fn) throw new Error('Unknown host function')
		const args = hostFromJson(engine, state, evalId, vm.getString(argsH)) as unknown[]
		return toVm(engine, state, evalId, fn(...args))
	})

	const api = vm.unwrapResult(vm.evalCode(PRELUDE, 'prelude.js')).consume((prelude) => vm.unwrapResult(vm.callFunction(prelude, vm.undefined, hostGet, hostCall)))
	hostGet.dispose()
	hostCall.dispose()
	engine.invoke = vm.getProp(api, 'invoke')
	engine.exportValue = vm.getProp(api, 'exportValue')
	engine.importValue = vm.getProp(api, 'importValue')
	engine.callVm = vm.getProp(api, 'callVm')
	engine.release = vm.getProp(api, 'release')
	api.dispose()
	return engine
}

const describeError = (vm: QuickJSContext, error: QuickJSHandle) => {
	try {
		return vm.dump(error)
	} finally {
		error.dispose()
	}
}

export type Interpreter = (<T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S) => Promise<T | undefined>) & {
	/** Frees the QuickJS runtime. The interpreter must not be called afterwards. */
	dispose: () => void
}

export const makeInterpreter = (): Interpreter => {
	let enginePromise: Promise<Engine> | undefined
	let evalSeq = 0

	const compile = (engine: Engine, formula: string): QuickJSHandle | undefined => {
		const cached = engine.compiled.get(formula)
		if (cached) return cached
		// The newline keeps a trailing line comment in the body from swallowing the closing braces.
		const result = engine.inBudget(() => engine.vm.evalCode('(function (__scope__) { with (__scope__) {' + formula + '\n} })', 'formula.js'))
		if (result.error) {
			console.info('Invalid Formula: ' + formula, describeError(engine.vm, result.error))
			return undefined
		}
		engine.compiled.set(formula, result.value)
		return result.value
	}

	const evaluate = async <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S): Promise<T | undefined> => {
		const engine = await (enginePromise = enginePromise ?? createEngine())
		if (engine.disposed) return undefined
		const { vm } = engine
		const compiled = compile(engine, formula)
		if (!compiled) return undefined

		const evalId = ++evalSeq
		const state: EvalState = { sandbox, hostFns: new Map(), deferreds: new Set(), released: false }
		engine.states.set(evalId, state)
		const evalIdH = vm.newNumber(evalId)
		let timer: ReturnType<typeof setTimeout> | undefined
		try {
			const invoked = engine.inBudget(() => vm.callFunction(engine.invoke, vm.undefined, evalIdH, compiled))
			if (invoked.error) {
				console.info('Error while executing formula: ' + formula, describeError(vm, invoked.error))
				return undefined
			}
			let resultH: QuickJSHandle = invoked.value
			if (vm.typeof(resultH) !== 'string') {
				// An async formula: follow its promise, running jobs as host lookups settle.
				const settled = vm.resolvePromise(resultH)
				resultH.dispose()
				runPendingJobs(engine)
				const outcome = await Promise.race([
					settled,
					new Promise<'timeout'>((resolve) => {
						timer = setTimeout(() => resolve('timeout'), ASYNC_BUDGET_MS)
					}),
				])
				if (outcome === 'timeout') {
					console.info('Formula did not settle within ' + ASYNC_BUDGET_MS + ' ms: ' + formula)
					return undefined
				}
				if (outcome.error) {
					console.info('Error while executing formula: ' + formula, describeError(vm, outcome.error))
					return undefined
				}
				const exported = engine.inBudget(() => vm.callFunction(engine.exportValue, vm.undefined, evalIdH, outcome.value))
				outcome.value.dispose()
				if (exported.error) {
					console.info('Error while executing formula: ' + formula, describeError(vm, exported.error))
					return undefined
				}
				resultH = exported.value
			}
			const json = vm.getString(resultH)
			resultH.dispose()
			return hostFromJson(engine, state, evalId, json) as T
		} finally {
			if (timer) clearTimeout(timer)
			state.released = true
			state.deferreds.forEach((d) => d.alive && d.dispose())
			engine.states.delete(evalId)
			if (!engine.disposed) {
				const released = vm.callFunction(engine.release, vm.undefined, evalIdH)
				released.error ? released.error.dispose() : released.value.dispose()
			}
			evalIdH.dispose()
		}
	}

	return Object.assign(evaluate, {
		dispose: () => {
			enginePromise?.then((engine) => {
				if (engine.disposed) return
				engine.disposed = true
				engine.compiled.forEach((h) => h.dispose())
				for (const h of [engine.invoke, engine.exportValue, engine.importValue, engine.callVm, engine.release]) h.dispose()
				engine.vm.dispose()
				engine.runtime.dispose()
			})
		},
	})
}

/**
 * The formula engines a {@link BridgedFormValuesContainer} can be given by name:
 *  - `quickjs`: formulas run inside QuickJS compiled to WebAssembly, isolated from the page.
 *  - `insecure`: formulas run in the page's own realm, through `new Function` and `with`, as before
 *    QuickJS. Faster to start (no WebAssembly to load) but NOT a security boundary: a formula can
 *    reach the page's globals and modify its built-ins. Only for forms whose formulas are trusted.
 */
export type InterpreterKind = 'quickjs' | 'insecure'

/**
 * The pre-QuickJS interpreter: `with (sandbox) { … }` compiled by `new Function`. The sandbox proxy
 * claims every identifier, so a formula's bare names resolve to the sandbox and not to the page's
 * globals, but the page's realm stays within reach. Kept closed are the escapes that do not need a
 * separate realm:
 *  - the body is parsed on its own first, so it cannot close the `with` block (`}; fetch(…); {`) and
 *    run code outside it;
 *  - `this` is the sandbox, not the global object a sloppy-mode function would get;
 *  - a trailing line comment no longer swallows the closing brace.
 * Not closed, and not closable without another realm: a function's `constructor` is the page's
 * `Function` (`[].constructor.constructor('return window')()`), and the built-ins the sandbox hands out
 * (`Object`, `Array`, …) are the page's own, so their prototypes can be modified. Runaway code
 * (`while (true)`) blocks the page: there is no time limit.
 */
export const makeInsecureInterpreter = (): Interpreter => {
	const proxies = new WeakMap<object, object>()
	const compiled = new Map<string, (sandbox: object) => unknown>()
	const handler: ProxyHandler<any> = {
		has: () => true,
		get: (target, key) => (key === Symbol.unscopables ? undefined : target[key]),
	}

	const compile = (formula: string) => {
		const cached = compiled.get(formula)
		if (cached) return cached
		// Throws unless the formula is a complete function body on its own: balanced braces, no
		// unterminated string or comment. Only such a body cannot break out of the `with` block below.
		new Function(formula)
		const code = new Function('sandbox', 'with (sandbox) {' + formula + '\n}')
		const wrapper = (sandbox: object) => {
			let proxy = proxies.get(sandbox)
			if (!proxy) proxies.set(sandbox, (proxy = new Proxy(sandbox, handler)))
			return code.call(proxy, proxy)
		}
		compiled.set(formula, wrapper)
		return wrapper
	}

	const evaluate = async <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S): Promise<T | undefined> => {
		let code: (sandbox: object) => unknown
		try {
			code = compile(formula)
		} catch (e) {
			console.info('Invalid Formula: ' + formula)
			return undefined
		}
		try {
			return (await code(sandbox)) as T
		} catch (e) {
			console.info('Error while executing formula: ' + formula, e)
			return undefined
		}
	}
	return Object.assign(evaluate, { dispose: () => compiled.clear() })
}

const shared: { [kind in InterpreterKind]?: Interpreter } = {}

/**
 * The page-wide interpreter of the given kind, created on first use. Sharing matters for `quickjs`:
 * each interpreter owns a WebAssembly runtime.
 */
export const sharedInterpreter = (kind: InterpreterKind): Interpreter => {
	switch (kind) {
		case 'quickjs':
			return (shared.quickjs = shared.quickjs ?? makeInterpreter())
		case 'insecure':
			return (shared.insecure = shared.insecure ?? makeInsecureInterpreter())
		default:
			throw new Error(`Unknown interpreter: ${kind}. Expected 'quickjs' or 'insecure'.`)
	}
}
