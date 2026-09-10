import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CodeStub, DecryptedContact, DecryptedContent, DecryptedPatient, DecryptedService, Gender } from '@icure/cardinal-sdk'
import { makeFormulaHostContext, HostService } from '../app/formula-host'
import { parsePrimitive } from '../src/utils/primitive'
import { makeInterpreter } from '../src/utils/interpreter'
import { PrimitiveType } from '../src/components/model'

// The demo app exposes these three entries through <icure-form>'s interpreterContext,
// so a formula can reach data that is not a field of its own form. They are the demo's
// stand-in for what a real host would answer out of the SDK, so what matters here is the
// filtering, the ordering and the shape the formulas see.

const service = (id: string, label: string, options: { valueDate?: number; codes?: string[]; tags?: string[]; value?: string; date?: number } = {}) =>
	new DecryptedService({
		id,
		label,
		valueDate: options.valueDate,
		codes: options.codes?.map((code) => new CodeStub({ id: code })),
		tags: options.tags?.map((tag) => new CodeStub({ id: tag })),
		content: { fr: new DecryptedContent(options.date ? { fuzzyDateValue: options.date } : { stringValue: options.value ?? label }) },
	})

const lastYear = new DecryptedContact({
	id: 'older',
	created: Date.UTC(2023, 0, 10),
	services: [
		service('s-ddr-old', 'Date des dernières règles', { valueDate: 20230110, codes: ['CD-GYNECOLOGY|duedate|1'], date: 20221220 }),
		service('s-colonoscopy', 'Colonoscopie', { valueDate: 20230110, date: 20230108 }),
	],
})

const thisYear = new DecryptedContact({
	id: 'current',
	created: Date.UTC(2024, 5, 1),
	services: [
		service('s-ddr', 'Date des dernières règles', { valueDate: 20240601, codes: ['CD-GYNECOLOGY|duedate|1'], date: 20240501 }),
		service('s-ovulation', 'Date ovulation', { valueDate: 20240601, codes: ['CD-GYNECOLOGY|duedate|1'], date: 20240515 }),
		service('s-flu', 'Vaccin grippe', { valueDate: 20240301, tags: ['CD-VACCINEINDICATION|seasonalinfluenza|1'], date: 20240301 }),
	],
})

// No valueDate at all: it has to fall back to the contact's created date rather than sort last.
const undated = new DecryptedContact({
	id: 'undated',
	created: Date.UTC(2025, 0, 1),
	services: [service('s-weight', 'Poids avant grossesse', { codes: ['CD-GYNECOLOGY|weightbeforepregnancy|1'], value: '62' })],
})

const patient = new DecryptedPatient({ id: 'p1', dateOfBirth: 19850723, gender: Gender.Female })

const context = () => makeFormulaHostContext({ patient, contacts: [lastYear, thisYear, undated], currentContact: thisYear })

const servicesOf = (ctx: ReturnType<typeof makeFormulaHostContext>) => ctx.services() as (filter?: unknown) => Promise<HostService[]>

describe('services()', () => {
	it('selects by label, newest first', async () => {
		const found = await servicesOf(context())({ label: 'Date des dernières règles' })
		expect(found.map((s) => s.id)).toEqual(['s-ddr', 's-ddr-old'])
	})

	it('selects by code type and code', async () => {
		const found = await servicesOf(context())({ codeType: 'CD-GYNECOLOGY', code: 'duedate' })
		expect(found.map((s) => s.id)).toEqual(['s-ddr', 's-ovulation', 's-ddr-old'])
	})

	it('selects by tag type and tag', async () => {
		const found = await servicesOf(context())({ tagType: 'CD-VACCINEINDICATION', tag: 'seasonalinfluenza' })
		expect(found.map((s) => s.id)).toEqual(['s-flu'])
	})

	it('combines selectors, so a code and a label must both match', async () => {
		const found = await servicesOf(context())({ codeType: 'CD-GYNECOLOGY', code: 'duedate', label: 'Date ovulation' })
		expect(found.map((s) => s.id)).toEqual(['s-ovulation'])
	})

	it('falls back to the contact date when a service carries no valueDate', async () => {
		const found = await servicesOf(context())({ codeType: 'CD-GYNECOLOGY' })
		// The undated service belongs to the 2025 contact, so it sorts ahead of everything.
		expect(found[0].id).toEqual('s-weight')
	})

	it('honours limit after ordering, so limit 1 is the most recent', async () => {
		const found = await servicesOf(context())({ label: 'Date des dernières règles', limit: 1 })
		expect(found.map((s) => s.id)).toEqual(['s-ddr'])
	})

	it('orders oldest first on request', async () => {
		const found = await servicesOf(context())({ label: 'Date des dernières règles', order: 'asc' })
		expect(found.map((s) => s.id)).toEqual(['s-ddr-old', 's-ddr'])
	})

	it('narrows to the current care path when asked', async () => {
		const found = await servicesOf(context())({ scope: 'carePath', label: 'Date des dernières règles' })
		expect(found.map((s) => s.id)).toEqual(['s-ddr'])
	})

	it('returns nothing rather than throwing when no service matches', async () => {
		expect(await servicesOf(context())({ label: 'Échographie' })).toEqual([])
		expect(await servicesOf(context())()).not.toHaveLength(0)
	})

	it('hands back content the sandbox helpers already understand', async () => {
		const [ddr] = await servicesOf(context())({ label: 'Date des dernières règles', limit: 1 })
		// parseContent in the compute sandbox is parsePrimitive over this exact shape, so a
		// date service arrives as a Date and needs no second content format to be learnt.
		expect(parsePrimitive(ddr.content['fr'])).toEqual(new Date(2024, 4, 1))
		expect(ddr.codes.map((code) => code.id)).toEqual(['CD-GYNECOLOGY|duedate|1'])
	})

	it('answers a repeated identical query from one lookup', async () => {
		const ctx = context()
		const services = servicesOf(ctx)
		const filter = { codeType: 'CD-GYNECOLOGY', code: 'duedate' }
		const [first, second] = await Promise.all([services(filter), services({ ...filter })])
		// 28 of the legacy formulas ask this same question; each recompute must not refetch.
		expect(second).toBe(first)
		expect(ctx.lookupCount()).toEqual(1)
	})

	it('counts a different query separately', async () => {
		const ctx = context()
		await servicesOf(ctx)({ label: 'Colonoscopie' })
		await servicesOf(ctx)({ label: 'Colonoscopie', limit: 1 })
		expect(ctx.lookupCount()).toEqual(2)
	})
})

describe('patient and consultDate', () => {
	it('exposes the demographics the legacy formulas read, under English names', async () => {
		expect(context().patient()).toEqual({ dateOfBirth: new Date(1985, 6, 23), gender: Gender.Female })
	})

	it('leaves an unknown date of birth undefined rather than guessing an epoch', async () => {
		const ctx = makeFormulaHostContext({ patient: new DecryptedPatient({ id: 'p2' }), contacts: [], currentContact: thisYear })
		// A patient with no recorded gender is Gender.Unknown to the SDK, and that is passed
		// through as it stands: a formula asking about gender should see "unknown", not a
		// blank that reads the same as an absent patient.
		expect(ctx.patient()).toEqual({ dateOfBirth: undefined, gender: Gender.Unknown })
	})

	it('reports the date of the contact being edited', async () => {
		expect(context().consultDate()).toEqual(new Date(Date.UTC(2024, 5, 1)))
	})
})

/**
 * The seam between the two halves of this feature: `ported-formulas.spec.ts` runs
 * the ported bodies against a stub host, and the tests above check this host in
 * isolation, so a disagreement over the filter's key names would pass both and
 * still leave the field blank in the app. This runs a real ported body against the
 * real host.
 */
describe('a ported formula against the real host context', () => {
	const bodyOf = (file: string, field: string): string => {
		let found: string | undefined
		const walk = (node: any): void => {
			if (Array.isArray(node)) return node.forEach(walk)
			if (!node || typeof node !== 'object') return
			if (node.field === field && node.computedProperties?.value) found = node.computedProperties.value
			Object.values(node).forEach(walk)
		}
		walk(JSON.parse(readFileSync(resolve(__dirname, '../app/samples/curated', file), 'utf8')))
		if (!found) throw new Error(`${file} has no computed field '${field}'`)
		return found
	}

	/** The sandbox `BridgedFormValuesContainer.compute` builds, over one host context. */
	const sandboxOf = (ctx: ReturnType<typeof makeFormulaHostContext>, values: { [label: string]: { content: { [language: string]: PrimitiveType } }[] } = {}) => {
		const parseContent = (content?: { [key: string]: PrimitiveType }) => {
			const primitive = content && (content['fr'] ?? content[Object.keys(content)[0]])
			return primitive && parsePrimitive(primitive)
		}
		const natives: { [key: string]: any } = { parseInt, parseFloat, Date, Math, Number, String, Boolean, Array, Object, Promise, parseContent }
		const context: { [key: string]: () => unknown } = { services: ctx.services, consultDate: ctx.consultDate, patient: ctx.patient }
		const proxy: any = new Proxy(
			{},
			{
				has: () => true,
				get: (_target, key: string | symbol) => {
					if (key === 'undefined') return undefined
					if (natives[key as string]) return natives[key as string]
					if (key === 'self') return proxy
					if (context[key as string]) return context[key as string]()
					return values[key as string] ?? []
				},
			},
		)
		return proxy
	}

	// Seen on 1 August 2024, with a last period of 1 January — 213 days, and a term
	// 279 days after the last period, so the 280-day offset gives 214 days.
	const seenOn = new DecryptedContact({
		id: 'today',
		created: Date.UTC(2024, 7, 1),
		services: [service('s-ddr-now', 'Date des dernières règles', { valueDate: 20240801, codes: ['CD-GYNECOLOGY|duedate|1'], date: 20240101 })],
	})

	it('reads the gestational age out of the host, not out of the form', async () => {
		const ctx = makeFormulaHostContext({ patient, contacts: [seenOn], currentContact: seenOn })
		const body = bodyOf('gynecology-fr/suivi-obstetrical-long.json', 'Age gestationnel')
		expect(await makeInterpreter()<unknown, any>(body, sandboxOf(ctx))).toEqual('30 sem. 4 j.')
		// And it asked the host exactly once, through the filter the host understands.
		expect(ctx.lookupCount()).toEqual(1)
	})

	it('leaves the field blank when the patient has no due-date service', async () => {
		const bare = new DecryptedContact({ id: 'bare', created: Date.UTC(2024, 7, 1), services: [] })
		const ctx = makeFormulaHostContext({ patient, contacts: [bare], currentContact: bare })
		// The text field says so in words, as the legacy did; a number field stores nothing.
		expect(await makeInterpreter()<unknown, any>(bodyOf('gynecology-fr/suivi-obstetrical-long.json', 'Age gestationnel'), sandboxOf(ctx))).toEqual('N/A')
		expect(await makeInterpreter()<unknown, any>(bodyOf('gynecology-fr/bb-t2-t3.json', 'jours'), sandboxOf(ctx))).toBeUndefined()
	})

	it('computes a centile from a measurement on the form and an age from the host', async () => {
		const ctx = makeFormulaHostContext({ patient, contacts: [seenOn], currentContact: seenOn })
		const body = bodyOf('gynecology-fr/bb-t2-t3.json', 'Percentile Diamètre bipariétal')
		// 214 days is 30.57 weeks; the chart's 50th centile runs 75.80 at 30 weeks and
		// 78.00 at 31, so a measurement on that line sits just above 50.
		const centile = (await makeInterpreter()<unknown, any>(body, sandboxOf(ctx, { 'Diamètre bipariétal': [{ content: { fr: { type: 'measure', value: 76.6, unit: 'mm' } } }] }))) as number
		expect(centile).toBeGreaterThan(45)
		expect(centile).toBeLessThan(55)
	})

	it('renders nothing at all when the host provides neither name', async () => {
		// What a host without these helpers sees: services resolves to [], calling it
		// throws, the interpreter swallows the throw, and the field stays empty.
		const body = bodyOf('gynecology-fr/suivi-obstetrical-long.json', 'Age gestationnel')
		const bare: any = new Proxy({}, { has: () => true, get: (_t, key) => (key === 'undefined' ? undefined : key === 'Promise' ? Promise : []) })
		expect(await makeInterpreter()<unknown, any>(body, bare)).toBeUndefined()
	})
})
