import { makeInterpreter } from '../src/utils/interpreter'

// The QuickJS interpreter's contract, independently of any form. quickjs-parity.spec.ts checks
// it against the eval-based interpreter it replaced on every formula of the demo forms.

const interpreter = makeInterpreter()
afterAll(() => interpreter.dispose())

const sandboxOf = (entries: { [key: string]: unknown }, read: string[] = []) =>
	new Proxy({} as { [key: string]: unknown }, {
		has: () => true,
		get: (_target, key: string | symbol) => {
			read.push(key.toString())
			return key in entries ? entries[key as string] : []
		},
	})

const weight = [{ content: { '*': { type: 'number', value: 70 } } }]
const parseContent = (content?: any) => content?.['*']?.value

describe('QuickJS formula interpreter', () => {
	test('reads host values lazily and records what it read', async () => {
		const read: string[] = []
		expect(await interpreter('return parseContent(weight[0]?.content) * 2', sandboxOf({ parseContent, weight }, read))).toBe(140)
		expect(read).toEqual(['parseContent', 'weight'])
	})

	test('builtins are QuickJS’s own and are never asked of the host', async () => {
		const read: string[] = []
		expect(await interpreter('return Math.max(1, 2) + JSON.parse("3") + (isNaN(NaN) ? 1 : 0)', sandboxOf({}, read))).toBe(6)
		expect(read).toEqual([])
	})

	test('self is the scope, and passing it to a host function hands the host its own sandbox', async () => {
		const sandbox = sandboxOf({ weight, count: (self: any, label: string) => self[label].length })
		expect(await interpreter('return self["weight"].length + count(self, "weight")', sandbox)).toBe(2)
	})

	test('unknown names read as the host answers them', async () => {
		expect(await interpreter('return nothingHere.length', sandboxOf({}))).toBe(0)
	})

	test('Dates cross the boundary as Dates, both ways', async () => {
		const sandbox = sandboxOf({ consultDate: new Date(1000), ageOf: (d: Date) => (d instanceof Date ? d.getUTCFullYear() : -1) })
		expect(await interpreter('return consultDate instanceof Date ? consultDate.getTime() : -1', sandbox)).toBe(1000)
		expect(await interpreter('return ageOf(new Date(Date.UTC(1990, 5, 1)))', sandbox)).toBe(1990)
		expect(await interpreter('return new Date(Date.UTC(2000, 0, 1))', sandbox)).toEqual(new Date(Date.UTC(2000, 0, 1)))
	})

	test('keys holding undefined survive the boundary', async () => {
		expect(await interpreter('return { a: undefined, b: 1 }', sandboxOf({}))).toEqual({ a: undefined, b: 1 })
		expect(Object.keys((await interpreter('return { a: undefined }', sandboxOf({}))) as object)).toEqual(['a'])
	})

	test('a host Promise becomes a QuickJS promise the formula can await', async () => {
		const services = jest.fn(async (filter: any) => [{ label: filter.label, on: new Date(5) }])
		const result = await interpreter('return new Promise(async (resolve) => { const [s] = await services({ label: "note" }); resolve([s.label, s.on instanceof Date]) })', sandboxOf({ services }))
		expect(result).toEqual(['note', true])
		expect(services).toHaveBeenCalledWith({ label: 'note' })
	})

	test('a host Promise that settles later still drives the formula', async () => {
		const delay = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(ms), ms))
		expect(await interpreter('return delay(20).then((ms) => ms * 2)', sandboxOf({ delay }))).toBe(40)
	})

	test('a rejected host Promise resolves to undefined', async () => {
		const failing = () => Promise.reject(new Error('offline'))
		expect(await interpreter('return failing().then(() => 1)', sandboxOf({ failing }))).toBeUndefined()
	})

	test('a VM callback handed to a host function runs in the VM', async () => {
		const mapAll = (items: number[], fn: (n: number) => number) => items.map(fn)
		expect(await interpreter('return mapAll([1, 2, 3], (n) => n * 10)', sandboxOf({ mapAll }))).toEqual([10, 20, 30])
	})

	test('errors, syntax errors and runaway code resolve to undefined', async () => {
		const sandbox = sandboxOf({})
		expect(await interpreter('throw new Error("boom")', sandbox)).toBeUndefined()
		expect(await interpreter('return {', sandbox)).toBeUndefined()
		expect(await interpreter('while (true) {}', sandbox)).toBeUndefined()
		expect(await interpreter('const loop = () => Promise.resolve().then(loop); loop(); return 1', sandbox)).toBe(1)
		// The interpreter is still usable afterwards
		expect(await interpreter('return 2 + 2', sandbox)).toBe(4)
	}, 20_000)

	test('a trailing line comment does not swallow the body', async () => {
		expect(await interpreter('return 1 // done', sandboxOf({}))).toBe(1)
	})
})
