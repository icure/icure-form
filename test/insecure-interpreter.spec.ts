import { DecryptedContact, DecryptedForm, DecryptedService } from '@icure/cardinal-sdk'
import { BridgedFormValuesContainer, ContactFormValuesContainer } from '../src/icure'
import { InterpreterKind, makeInsecureInterpreter, sharedInterpreter } from '../src/utils/interpreter'
import { getRevisionsFilter } from '../src/utils/fields-values-provider'

// The `insecure` engine: the pre-QuickJS `new Function` + `with` interpreter, with the escapes that
// do not need a separate realm closed. The ones that remain are pinned below so that the doc
// comment on makeInsecureInterpreter stays true.

const interpreter = makeInsecureInterpreter()

/** A sandbox shaped like BridgedFormValuesContainer.compute's: it claims every identifier. */
const sandboxOf = (values: { [key: string]: unknown } = {}) =>
	new Proxy({} as { [key: string | symbol]: unknown }, {
		has: () => true,
		get: (_target, key) => (key === 'undefined' ? undefined : key in values ? values[key as string] : key === 'Array' ? Array : []),
	})

const PAGE_GLOBAL = '__insecureInterpreterProbe__'

beforeAll(() => {
	;(globalThis as any)[PAGE_GLOBAL] = 'reached'
})
afterAll(() => {
	delete (globalThis as any)[PAGE_GLOBAL]
})

describe('insecure interpreter — behaviour', () => {
	test('bare identifiers resolve to the sandbox, not to the page', async () => {
		expect(await interpreter('return weight[0] / 2', sandboxOf({ weight: [84] }))).toEqual(42)
		expect(await interpreter(`return ${PAGE_GLOBAL}`, sandboxOf())).toEqual([])
	})

	test('an async formula is awaited, a rejected one gives undefined', async () => {
		expect(await interpreter('return new Promise((resolve) => setTimeout(() => resolve(7), 5))', sandboxOf({ Promise, setTimeout }))).toEqual(7)
		expect(await interpreter("return Promise.reject(new Error('no'))", sandboxOf({ Promise, Error }))).toBeUndefined()
	})

	test('a formula that throws or does not parse gives undefined', async () => {
		expect(await interpreter("throw new Error('boom')", sandboxOf({ Error }))).toBeUndefined()
		expect(await interpreter('return (', sandboxOf())).toBeUndefined()
	})

	test('a trailing line comment does not swallow the closing brace', async () => {
		expect(await interpreter('return 1 // done', sandboxOf())).toEqual(1)
	})

	test('compiled formulas are reused', async () => {
		const spy = jest.spyOn(globalThis, 'Function')
		const local = makeInsecureInterpreter()
		await local('return 3', sandboxOf())
		await local('return 3', sandboxOf())
		// Two constructions for the first call (the standalone parse, then the `with` wrapper), none for the second.
		expect(spy).toHaveBeenCalledTimes(2)
		spy.mockRestore()
	})
})

describe('insecure interpreter — escapes that are closed', () => {
	test('`this` is the sandbox, not the global object', async () => {
		expect(await interpreter(`return this.${PAGE_GLOBAL}`, sandboxOf())).toEqual([])
	})

	test('a formula cannot close the `with` block and run outside it', async () => {
		expect(await interpreter(`}; return ${PAGE_GLOBAL}; {`, sandboxOf())).toBeUndefined()
		expect(await interpreter(`return 1 }\nreturn ${PAGE_GLOBAL}\n{`, sandboxOf())).toBeUndefined()
	})
})

describe('insecure interpreter — escapes that remain (why it is called insecure)', () => {
	test("a function's constructor is the page's Function", async () => {
		expect(await interpreter(`return [].constructor.constructor('return ${PAGE_GLOBAL}')()`, sandboxOf())).toEqual('reached')
	})

	test("the built-ins handed to formulas are the page's own", async () => {
		try {
			await interpreter("Array.prototype.__proto__.__polluted__ = 'yes'", sandboxOf())
			expect(({} as any).__polluted__).toEqual('yes')
		} finally {
			delete (Object.prototype as any).__polluted__
		}
	})
})

describe('choosing the engine by name', () => {
	test('sharedInterpreter returns one instance per kind', () => {
		expect(sharedInterpreter('insecure')).toBe(sharedInterpreter('insecure'))
		expect(sharedInterpreter('quickjs')).toBe(sharedInterpreter('quickjs'))
		expect(sharedInterpreter('quickjs')).not.toBe(sharedInterpreter('insecure'))
		expect(() => sharedInterpreter('eval' as InterpreterKind)).toThrow(/Unknown interpreter/)
	})

	afterAll(() => sharedInterpreter('quickjs').dispose())

	const computedBy = async (kind: InterpreterKind, formula: string) => {
		const contactFormValuesContainer = new ContactFormValuesContainer(
			new DecryptedForm({ id: 'form-id', formTemplateId: 'tpl', descr: 'Form' }),
			new DecryptedContact({ id: 'c1', created: Date.now(), services: [], subContacts: [] }),
			[],
			(label: string, serviceId?: string) => new DecryptedService({ id: serviceId ?? `s-${label}`, label, created: Date.now(), modified: Date.now(), content: {} }),
			[],
			async () => new DecryptedForm({ id: 'x' }),
			async () => undefined,
			[],
			undefined,
			true,
		)
		const bridged = await new BridgedFormValuesContainer(
			'me',
			contactFormValuesContainer,
			kind,
			undefined,
			() => [],
			() => [{ metadata: { label: 'Result' }, revisionsFilter: getRevisionsFilter({ label: 'Result' } as any), formula }],
			() => [],
			'fr',
			[],
			{},
		).init()
		const values = bridged.getValues((id, history) => (history?.[0]?.value?.label === 'Result' ? [history[0].revision] : []))
		return (Object.values(values)[0]?.[0]?.value as any)?.content
	}

	test.each(['quickjs', 'insecure'] as const)('the bridge accepts %s by name', async (kind) => {
		expect(await computedBy(kind, 'return Math.round(84 / (1.8 * 1.8))')).toEqual({ fr: { type: 'number', value: 26 } })
	})

	test('the two engines differ on the page realm', async () => {
		;(globalThis as any).__bridgeProbe__ = 'page'
		try {
			const formula = "return [].constructor.constructor('return typeof __bridgeProbe__')()"
			expect(await computedBy('insecure', formula)).toEqual({ fr: { type: 'string', value: 'string' } })
			expect(await computedBy('quickjs', formula)).toEqual({ fr: { type: 'string', value: 'undefined' } })
		} finally {
			delete (globalThis as any).__bridgeProbe__
		}
	})
})
