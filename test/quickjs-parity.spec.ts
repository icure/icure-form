import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import YAML from 'yaml'
import { makeInterpreter } from '../src/utils/interpreter'
import { parsePrimitive } from '../src/utils/primitive'
import { PrimitiveType } from '../src/components/model'

// Differential test for the switch from the eval-based formula interpreter to QuickJS.
// Every formula of every demo form (the numbered samples, the curated specialty forms and
// the legacy ones) runs on both engines, against a sandbox that mirrors
// BridgedFormValuesContainer.compute, once with every field empty and once with every field
// holding a value of its type. Both the result and the identifiers the formula asked the host
// for (its dependencies) must match.

const SAMPLES = resolve(__dirname, '../app/samples')

/** The pre-QuickJS interpreter, verbatim apart from the name: the reference this test compares against. */
const makeEvalInterpreter = () => {
	const sb = new Map()
	const cs: Map<string, any> = new Map()
	return async <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S): Promise<T | undefined> => {
		function compileCode(src: string) {
			if (cs.has(src)) return cs.get(src)
			src = 'with (sandbox) {' + src + '}'
			const code = new Function('sandbox', src)
			const wrapper = function (sandbox: S) {
				if (!sb.has(sandbox)) sb.set(sandbox, new Proxy<S>(sandbox, { has: () => true, get: (target, key) => (key === Symbol.unscopables ? undefined : target[key]) }))
				return code(sb.get(sandbox))
			}
			cs.set(src, wrapper)
			return wrapper
		}
		let compiledCode: any
		try {
			compiledCode = compileCode(formula)
		} catch (e) {
			return undefined
		}
		try {
			return compiledCode(sandbox)
		} catch (e) {
			return undefined
		}
	}
}

type FieldValue = { content: { [language: string]: PrimitiveType }; codes?: { id: string }[] }
type FieldDef = { field: string; type?: string; options?: { [key: string]: unknown } }
type Formula = { file: string; where: string; body: string }

const filesUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) return filesUnder(path)
		return /\.(ya?ml|json)$/.test(entry) && entry !== 'index.json' && entry !== 'package.json' ? [path] : []
	})

const forms = filesUnder(SAMPLES).map((path) => {
	const raw = readFileSync(path, 'utf8')
	const doc = path.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw)
	const formulas: Formula[] = []
	const fields: FieldDef[] = []
	const walk = (node: any, where: string) => {
		if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`))
		if (!node || typeof node !== 'object') return
		const name = typeof node.field === 'string' ? node.field : where
		if (typeof node.field === 'string' && node.type) fields.push({ field: node.field, type: node.type, options: node.options })
		Object.entries(node.computedProperties ?? {}).forEach(([key, body]) => typeof body === 'string' && formulas.push({ file: relative(SAMPLES, path), where: `${name}.${key}`, body }))
		;(Array.isArray(node.validators) ? node.validators : []).forEach(
			(v: any, i: number) => typeof v?.validation === 'string' && formulas.push({ file: relative(SAMPLES, path), where: `${name}.validators[${i}]`, body: v.validation }),
		)
		Object.entries(node).forEach(([key, child]) => key !== 'computedProperties' && walk(child, `${where}.${key}`))
	}
	walk(doc, '')
	return { file: relative(SAMPLES, path), formulas, fields }
})

/** A value of the field's type, as the bridge hands it to a formula. */
const sampleValue = (def: FieldDef): FieldValue[] => {
	const firstOption = Object.keys(def.options ?? {})[0]
	switch (def.type) {
		case 'number-field':
			return [{ content: { fr: { type: 'number', value: 42 } } }]
		case 'measure-field':
			return [{ content: { fr: { type: 'measure', value: 42, unit: 'kg' } as PrimitiveType } }]
		case 'date-picker':
		case 'time-picker':
		case 'date-time-picker':
			return [{ content: { fr: { type: 'datetime', value: 20240315103000 } } }]
		case 'radio-button':
		case 'checkbox':
		case 'dropdown':
			return firstOption
				? [{ content: { fr: { type: 'compound', value: { [firstOption]: { type: 'boolean', value: true } } } as PrimitiveType }, codes: [{ id: `${def.field}|${firstOption}|1` }] }]
				: [{ content: { fr: { type: 'string', value: 'x' } } }]
		default:
			return [{ content: { fr: { type: 'string', value: 'Lorem 12' } } }]
	}
}

const FIXED_DATE = new Date(2026, 0, 15)

/** Mirrors BridgedFormValuesContainer.compute's proxy, plus the demo host's interpreterContext. */
const sandboxFor = (values: { [label: string]: FieldValue[] }, deps: Set<string>) => {
	const language = 'fr'
	const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
		if (!content) return undefined
		const primitive = content[language] ?? content['*'] ?? content[Object.keys(content)[0]]
		return primitive && parsePrimitive(primitive, toString)
	}
	const text = (item?: FieldValue | FieldValue[]) =>
		item
			? (Array.isArray(item) ? item : [item])
					.map((it) => parseContent(it.content, true)?.toString())
					.filter((it) => !!it)
					.join(', ')
			: undefined
	const native: { [key: string]: any } = {
		parseInt,
		parseFloat,
		Date,
		Math,
		Number,
		String,
		Boolean,
		Array,
		Object,
		hasOption: (it: FieldValue, option: string) => it && it.codes?.some((c) => c.id === option || c.id?.split('|')?.[1] === option),
		score: (it: FieldValue) => (it ? (it.codes ?? []).reduce((acc, c) => acc + parseInt(c.id?.split('|')?.[1] ?? '0'), 0) : 0),
		parseContent,
		validate: { notBlank: (self: any, label: string) => !!(parseContent(self[label]?.[0]?.content) as any)?.trim()?.length },
		text,
		log: () => undefined,
		Promise,
	}
	const context: { [key: string]: () => unknown } = {
		language: () => language,
		delay: () => () => Promise.resolve(),
		ageText: () => (d: Date | number) => `${d instanceof Date ? d.getFullYear() : d} ans`,
		age: () => (d: Date | number) => d instanceof Date ? 2026 - d.getFullYear() : 0,
		services: () => async () => [{ id: 's1', label: 'note', valueDate: 20240101, content: { fr: { type: 'string', value: 'Une note' } }, codes: [], tags: [] }],
		patient: () => ({ dateOfBirth: new Date(1980, 4, 17), gender: 'female' }),
		consultDate: () => FIXED_DATE,
		summarize: () => async () => 'résumé',
		frax: () => async () => ({ hip: 2.5, majorOsteoporotic: 11 }),
	}
	const proxy: any = new Proxy(
		{},
		{
			has: (target, key) => !!native[key as string] || key === 'self' || !!context[key as string] || !!values[key as string],
			get: (target, key) => {
				if (key === 'undefined') return undefined
				if (native[key as string]) return native[key as string]
				if (key === 'self') return proxy
				deps.add(key.toString())
				return context[key as string] ? context[key as string]() : (values[key as string] ?? []).map((v) => v)
			},
		},
	)
	return proxy
}

/** Dates as ISO strings, functions as a marker, so the two engines' results compare structurally. */
const normalize = (value: unknown): unknown =>
	JSON.parse(
		JSON.stringify(value ?? null, function (this: any, key, val) {
			const raw = this[key]
			if (raw instanceof Date) return { date: isNaN(raw.getTime()) ? 'invalid' : raw.toISOString() }
			if (typeof raw === 'function') return 'function'
			if (typeof raw === 'number' && !isFinite(raw)) return String(raw)
			return val === undefined ? null : val
		}),
	)

/**
 * Names QuickJS resolves itself and so never asks the host for, which the old engine did. Node's
 * global set stands in for QuickJS's. This is where the engines deliberately differ: the old one
 * routed every identifier to the sandbox, so `isNaN`, `JSON` or `Map` read as `[]` and an implicit
 * global (`x = 5`) never read back; QuickJS gets both right. No demo formula relies on either.
 */
const BUILTINS = new Set(Object.getOwnPropertyNames(globalThis))

// Formulas reading the clock: both engines see the same day, but not the same millisecond.
const readsTheClock = (body: string) => /new Date\(\s*\)|Date\.now\(/.test(body)
const maskClock = (value: unknown): unknown =>
	JSON.parse(
		JSON.stringify(value)
			.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<now>')
			.replace(/\b1[78]\d{11}\b/g, '<now-ms>'),
	)

const evalEngine = makeEvalInterpreter()
const quickjs = makeInterpreter()
afterAll(() => quickjs.dispose())

const run = async (engine: (formula: string, sandbox: any) => Promise<unknown>, body: string, values: { [label: string]: FieldValue[] }) => {
	const deps = new Set<string>()
	let value: unknown
	try {
		value = await engine(body, sandboxFor(values, deps))
	} catch (e) {
		value = undefined
	}
	return { value, deps }
}

describe.each(forms.filter((f) => f.formulas.length > 0).map((f) => [f.file, f] as const))('%s', (_file, form) => {
	const filled = Object.fromEntries(form.fields.map((def) => [def.field, sampleValue(def)]))

	test.each(form.formulas.map((f) => [f.where, f] as const))('%s', async (_where, formula) => {
		for (const values of [{}, filled]) {
			const before = await run(evalEngine, formula.body, { ...values })
			const after = await run(quickjs, formula.body, { ...values })
			const oldDeps = [...before.deps].filter((d) => !BUILTINS.has(d)).sort()
			expect([...after.deps].sort()).toEqual(oldDeps)
			const masked = (v: unknown) => (readsTheClock(formula.body) ? maskClock(normalize(v)) : normalize(v))
			expect(masked(after.value)).toEqual(masked(before.value))
		}
	})
})

test('the corpus is not empty', () => {
	const count = forms.reduce((acc, f) => acc + f.formulas.length, 0)
	expect(count).toBeGreaterThan(100)
})
