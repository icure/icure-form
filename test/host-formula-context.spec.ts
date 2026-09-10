import { CodeStub, DecryptedContact, DecryptedContent, DecryptedPatient, DecryptedService, Gender } from '@icure/cardinal-sdk'
import { makeFormulaHostContext, HostService } from '../app/formula-host'
import { parsePrimitive } from '../src/utils/primitive'

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
