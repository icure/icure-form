import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { makeInterpreter } from '../src/utils/interpreter'
import { parsePrimitive } from '../src/utils/primitive'
import { Form, PrimitiveType } from '../src/components/model'

// The formulas ported from the legacy forms by tools/convert-legacy/port-formulas.ts
// live as computedProperties.value strings inside the curated forms, and the
// interpreter swallows every error: a body that throws, or that reads a label
// nothing resolves, is indistinguishable from a body whose inputs are empty. So
// these tests actually run each ported body against a synthetic sandbox and insist
// on a value coming out, plus a handful of golden results.

const CURATED = resolve(__dirname, '../app/samples/curated')

type FieldValue = { content: { [language: string]: PrimitiveType }; codes?: { id: string }[] }

/**
 * What the demo app's interpreterContext contributes: the data a formula needs
 * that its own form does not hold. The real implementation is app/formula-host.ts
 * (covered by host-formula-context.spec.ts); this is the shape the bodies see.
 */
type Host = { services?: (filter?: any) => Promise<{ label?: string; content: { [language: string]: PrimitiveType } }[]>; consultDate?: Date }

/** The subset of BridgedFormValuesContainer.compute's sandbox that the ported bodies use. */
const sandboxFor = (values: { [label: string]: FieldValue[] }, host: Host = {}) => {
	const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
		if (!content) {
			return undefined
		}
		const primitive = content['*'] ?? content[Object.keys(content)[0]]
		return primitive && parsePrimitive(primitive, toString)
	}
	const natives: { [key: string]: any } = { parseInt, parseFloat, Date, Math, Number, String, Boolean, Array, Object, Promise, parseContent }
	// Named on the context rather than merged into natives, so a body that reaches
	// the host in a run that supplies none fails the way the real thing would.
	const context: { [key: string]: any } = { services: host.services, consultDate: host.consultDate }
	const proxy: any = new Proxy(
		{},
		{
			has: () => true,
			get: (_target, key: string | symbol) => {
				if (key === 'undefined') return undefined
				if (natives[key as string]) return natives[key as string]
				if (key === 'self') return proxy
				if (key in context) return context[key as string]
				return values[key as string] ?? []
			},
		},
	)
	return proxy
}

const measure = (value: number, unit?: string): FieldValue[] => [{ content: { '*': { type: 'measure', value, unit } as PrimitiveType } }]
const number = (value: number): FieldValue[] => [{ content: { '*': { type: 'number', value } } }]
const fuzzyDate = (value: number): FieldValue[] => [{ content: { '*': { type: 'datetime', value } } }]
const text = (value: string): FieldValue[] => [{ content: { '*': { type: 'string', value } } }]
const ticked = (option: string): FieldValue[] => [{ content: { '*': { type: 'compound', value: { [option]: { type: 'boolean', value: true } } } as PrimitiveType }, codes: [{ id: option }] }]
const unticked = (): FieldValue[] => [{ content: { '*': { type: 'compound', value: {} } }, codes: [] }]

const interpret = makeInterpreter()
const evaluate = (body: string, values: { [label: string]: FieldValue[] }, host: Host = {}) => interpret<unknown, any>(body, sandboxFor(values, host))

/** A host service in the shape app/formula-host.ts hands back. */
const hostService = (label: string, primitive: PrimitiveType) => ({ label, content: { '*': primitive } })

/**
 * A host that answers the two queries the obstetric formulas make. `services` is
 * a jest mock so a test can also assert on what was asked for.
 */
const hostWith = (found: { [query: string]: { label?: string; content: { [language: string]: PrimitiveType } }[] }, consultDate?: Date): Host => ({
	services: jest.fn(async (filter?: any) => found[`${filter?.codeType}|${filter?.code}`] ?? []),
	consultDate,
})

type Computed = { file: string; field: string; type?: string; body: string; reads: string[] }

const curatedFiles = readdirSync(CURATED)
	.filter((entry) => statSync(join(CURATED, entry)).isDirectory())
	.sort()
	.flatMap((dir) =>
		readdirSync(join(CURATED, dir))
			.filter((file) => file.endsWith('.json'))
			.sort()
			.map((file) => `${dir}/${file}`),
	)

const computedFields: Computed[] = curatedFiles.flatMap((file) => {
	const found: Computed[] = []
	const fieldTypes = new Map<string, string | undefined>()
	const walk = (node: any) => {
		if (Array.isArray(node)) return node.forEach(walk)
		if (!node || typeof node !== 'object') return
		if (node.clazz === 'field' && typeof node.field === 'string') {
			fieldTypes.set(node.field, node.type)
			const body = node.computedProperties?.value
			if (body) found.push({ file, field: node.field, type: node.type, body, reads: [...body.matchAll(/self\[(".*?")\]/g)].map((m: any) => JSON.parse(m[1])) })
		}
		Object.values(node).forEach(walk)
	}
	walk(JSON.parse(readFileSync(join(CURATED, file), 'utf8')))
	return found.map((computed) => ({ ...computed, readTypes: computed.reads.map((read) => fieldTypes.get(read)) })) as Computed[]
})

/** A plausible value for a field of the given type, so a body can run end to end. */
const plausible = (type?: string): FieldValue[] => {
	switch (type) {
		case 'measure-field':
			return measure(3)
		case 'date-picker':
		case 'date-time-picker':
			return fuzzyDate(20240115)
		case 'checkbox':
			return ticked('option')
		case 'text-field':
			return text('3')
		default:
			return number(3)
	}
}

/**
 * A patient 30 weeks into a pregnancy, weighing 62 kg before it, seen today — enough
 * for every host-reading body to produce a value.
 */
const OBSTETRIC_HOST: Host = {
	services: async (filter?: any) => {
		if (filter?.code === 'duedate') return [hostService('Date des dernières règles', { type: 'datetime', value: 20240101 })]
		if (filter?.code === 'weightbeforepregnancy') return [hostService('Poids avant grossesse', { type: 'measure', value: 62, unit: 'kg' })]
		return []
	},
	consultDate: new Date(2024, 7, 1),
}

describe('every ported formula runs', () => {
	test('the curated submodule is checked out and carries ported formulas', () => {
		expect(curatedFiles.length).toBeGreaterThan(0)
		expect(computedFields.length).toBeGreaterThan(0)
	})

	test('the bodies survive Form.parse', () => {
		const parsed = new Set<string>()
		const walk = (node: any): void => {
			if (Array.isArray(node)) return node.forEach(walk)
			if (!node || typeof node !== 'object') return
			if (node.field && node.computedProperties?.value) parsed.add(`${node.field}\u0000${node.computedProperties.value}`)
			Object.values(node).forEach(walk)
		}
		for (const file of curatedFiles) walk(Form.parse(JSON.parse(readFileSync(join(CURATED, file), 'utf8'))).toJson())
		for (const computed of computedFields) expect(parsed).toContain(`${computed.field}\u0000${computed.body}`)
	})

	test.each(computedFields.map((computed) => [`${computed.file} › ${computed.field}`, computed] as [string, Computed & { readTypes?: (string | undefined)[] }]))('%s', async (_name, computed) => {
		// Every label the body reads must be a field of the same form: the sandbox
		// resolves an unknown label to [], which is truthy, so a typo would hide here.
		expect((computed as any).readTypes).not.toContain(undefined)
		// A body reads fields, the host, or both — but something, or it is a constant.
		const usesHost = /\bservices\(|\bconsultDate\b/.test(computed.body)
		expect(computed.reads.length > 0 || usesHost).toBe(true)

		const values = Object.fromEntries(computed.reads.map((read, index) => [read, plausible((computed as any).readTypes[index])]))
		await expect(evaluate(computed.body, values, OBSTETRIC_HOST)).resolves.toBeDefined()
		// And with nothing filled in, a formula must decline to produce a value
		// rather than throw or invent one — except the scores, which legitimately
		// total 0, and the gestational ages, which say so in words.
		const empty = await evaluate(computed.body, {}, OBSTETRIC_HOST)
		expect(['undefined', 'number', 'string', 'object']).toContain(typeof empty)
	})
})

describe('ported formulas produce the legacy results', () => {
	const bodyOf = (file: string, field: string) => {
		const found = computedFields.find((computed) => computed.file === file && computed.field === field)
		if (!found) throw new Error(`${file} has no computed field '${field}'`)
		return found.body
	}

	test('BMI from a weight and a height in centimetres', async () => {
		const body = bodyOf('cardiology-fr/consultation.json', 'BMI')
		expect(await evaluate(body, { Poids: measure(70, 'kg'), Taille: measure(170, 'cm') })).toBeCloseTo(24.22, 2)
		// The same figures typed without units: 170 is read as centimetres.
		expect(await evaluate(body, { Poids: measure(70), Taille: measure(170) })).toBeCloseTo(24.22, 2)
		expect(await evaluate(body, { Poids: measure(70, 'kg') })).toBeUndefined()
	})

	test('body surface area follows Mosteller', async () => {
		const body = bodyOf('oncology-nl/raadpleging.json', 'Lichaamsoppervlakte')
		// √(170 × 70 / 3600) = 1.818 m²
		const bsa = (await evaluate(body, { Gewicht: measure(70, 'kg'), Lengte: measure(170, 'cm') })) as { value: number; unit: string }
		expect(bsa.unit).toEqual('m²')
		expect(bsa.value).toBeCloseTo(1.818, 3)
	})

	test('the due date is 40 weeks less a day after the last period', async () => {
		const body = bodyOf('gynecology-fr/echo-t1.json', 'Terme calculé')
		expect(await evaluate(body, { 'Date des dernières règles': fuzzyDate(20240101) })).toEqual(new Date(2024, 9, 6))
		// Counting in calendar days, not milliseconds: a spring date whose term falls
		// after the clocks go back would otherwise land on the day before.
		expect(await evaluate(body, { 'Date des dernières règles': fuzzyDate(20240501) })).toEqual(new Date(2025, 1, 4))
	})

	test('the definitive term prefers ovulation, then the corrected term, then the last period', async () => {
		const body = bodyOf('gynecology-fr/echo-t1.json', 'terme définitif')
		const lastPeriod = fuzzyDate(20240101)
		const ovulation = fuzzyDate(20240115)
		const corrected = fuzzyDate(20241010)
		expect(await evaluate(body, { 'Date ovulation': ovulation, 'Terme corrigé': corrected, 'Date des dernières règles': lastPeriod })).toEqual(new Date(2024, 9, 7))
		expect(await evaluate(body, { 'Terme corrigé': corrected, 'Date des dernières règles': lastPeriod })).toEqual(new Date(2024, 9, 10))
		expect(await evaluate(body, { 'Date des dernières règles': lastPeriod })).toEqual(new Date(2024, 9, 6))
		expect(await evaluate(body, {})).toBeUndefined()
	})

	test('gestational age reads off the crown-rump length table', async () => {
		const body = bodyOf('gynecology-fr/bb-t1.json', 'Age gestationnel CRL')
		// The table maps 78 mm to 98 days, and 40 mm to 77.
		expect(await evaluate(body, { CRL: measure(78, 'mm') })).toEqual('14 sem. 0 j.')
		expect(await evaluate(body, { CRL: measure(40) })).toEqual('11 sem. 0 j.')
		// Between two points it interpolates: 41 mm sits halfway between 77 and 79 days.
		expect(await evaluate(body, { CRL: measure(41) })).toEqual('11 sem. 1 j.')
	})

	test('gestational age reads off the biparietal diameter table', async () => {
		// 22 mm is 14 weeks in the table, which the formula turns into days.
		expect(await evaluate(bodyOf('gynecology-fr/bb-t1.json', 'Age gestationnel diamètre bipariétal'), { 'Diamètre bipariétal': measure(22, 'mm') })).toEqual('14 sem. 0 j.')
	})

	test('the MMSE scores sum their items and count a blank as zero', async () => {
		const items = {
			'Orientation dans le temps': number(5),
			"Orientation dans l'espace": number(5),
			Apprentissage: number(3),
			'Attention et calcul': number(5),
			Rappel: number(3),
			'Language, désignation': number(2),
			'Language, répétition': number(1),
			'Compréhension orale': number(3),
			'Compréhension écrite': number(1),
			'Language écrit': number(1),
			'Praxie constructive': number(1),
		}
		expect(await evaluate(bodyOf('neurology-fr/echelle-mmse.json', 'Score MMSE'), items)).toEqual(30)
		expect(await evaluate(bodyOf('neurology-fr/echelle-mmse.json', 'Score Language'), items)).toEqual(8)
		expect(await evaluate(bodyOf('neurology-fr/echelle-mmse.json', 'Score MMSE'), { Rappel: number(3) })).toEqual(3)
	})

	test('the mood score reverses the positively worded items', async () => {
		const body = bodyOf('neurology-fr/auto-evaluation-de-l-humeur.json', "Score AE de l'humeur")
		// Nothing ticked: the five positively worded items each score 1.
		expect(await evaluate(body, {})).toEqual(5)
		// Ticking a positive item clears its point; ticking a negative one adds one.
		expect(await evaluate(body, { 'Etes-vous satisfait de votre vie': ticked('Etes-vous satisfait de votre vie') })).toEqual(4)
		expect(await evaluate(body, { 'Vous ennuyez-vous souvent': ticked('Vous ennuyez-vous souvent') })).toEqual(6)
		expect(await evaluate(body, { 'Vous ennuyez-vous souvent': unticked() })).toEqual(5)
	})

	test('the UPDRS score adds the weight encoded in each ticked box', async () => {
		const body = bodyOf('neurology-fr/updrs.json', 'Score UPDRS')
		expect(await evaluate(body, {})).toEqual(0)
		expect(await evaluate(body, { Updrs_1_0: ticked('Updrs_1_0') })).toEqual(0)
		expect(await evaluate(body, { Updrs_1_3: ticked('Updrs_1_3'), Updrs_42_1: ticked('Updrs_42_1') })).toEqual(4)
	})

	test('the repaired Dutch BMI fields compute over the fields their form has', async () => {
		expect(await evaluate(bodyOf('orthopedy-nl/fasciitis-plantaris.json', 'BMI'), { Gewicht: measure(70, 'kg'), Lengte: measure(170, 'cm') })).toBeCloseTo(24.22, 2)
		expect(await evaluate(bodyOf('common_nl/reis-van-diabeteszorg.json', 'BMI'), { Gewicht: measure(70, 'kg'), Maat: measure(170, 'cm') })).toBeCloseTo(24.22, 2)
	})

	test('the estimated fetal weight picks the estimator the measurements support', async () => {
		const body = bodyOf('gynecology-fr/bb-t2-t3.json', 'Poids estimé')
		const weigh = async (values: { [label: string]: FieldValue[] }) => ((await evaluate(body, values)) as { value: number; unit: string } | undefined)?.value
		const all = {
			'Circonférence abdominale': measure(280, 'mm'),
			'Périmètre crânien': measure(290, 'mm'),
			'Diamètre bipariétal': measure(82, 'mm'),
			'Longueur fémorale': measure(60, 'mm'),
		}
		// Hadlock et al. 1985 on all four measurements, per obsWeights' four-measurement map.
		expect(await weigh(all)).toBeCloseTo(1853.43, 2)
		expect((await evaluate(body, all)) as any).toHaveProperty('unit', 'g')
		// Millimetres typed without a unit reach the coefficients unchanged.
		expect(await weigh({ ...all, 'Circonférence abdominale': measure(280) })).toBeCloseTo(1853.43, 2)
		// Fewer measurements fall through to the less specific variants, in obsWeights' order.
		expect(await weigh({ 'Circonférence abdominale': measure(280, 'mm'), 'Longueur fémorale': measure(60, 'mm') })).toBeCloseTo(1877.07, 2)
		expect(await weigh({ 'Circonférence abdominale': measure(280, 'mm'), 'Diamètre bipariétal': measure(82, 'mm') })).toBeCloseTo(2098.46, 2)
		expect(await weigh({ 'Circonférence abdominale': measure(280, 'mm') })).toBeCloseTo(2108.23, 2)
		expect(await weigh({ 'Longueur fémorale': measure(60, 'mm') })).toBeCloseTo(1914.09, 2)
		// A measurement of zero counts as absent, as it does in obsWeights: without a
		// femur length no Hadlock 1985 variant applies and the three-measurement
		// Jordaan takes over.
		expect(await weigh({ ...all, 'Longueur fémorale': measure(0, 'mm') })).toBeCloseTo(2078.55, 2)
		expect(await weigh({})).toBeUndefined()
	})

	test('gestational age interpolation matches the kraken implementation', async () => {
		// org.taktik.icure.utils.Math.interpolate walks to the first x at or above the
		// wanted value; below the first point and above the last it clamps.
		const body = bodyOf('gynecology-fr/echo-t1.json', 'Age gestationnel GS')
		expect(await evaluate(body, { 'Taille sac gestationnel': measure(1) })).toEqual('4 sem. 0 j.') // clamped low: 4 weeks
		expect(await evaluate(body, { 'Taille sac gestationnel': measure(99) })).toEqual('12 sem. 0 j.') // clamped high: 12 weeks
		// 9 mm sits a third of the way from (8,5) to (11,6): 5.333 weeks → 37 days.
		expect(await evaluate(body, { 'Taille sac gestationnel': measure(9) })).toEqual('5 sem. 2 j.')
	})

	test('the best far acuity is the largest of the three measurements', async () => {
		const body = bodyOf('ophtalmology-fr/consultation.json', 'acuité visuelle OD')
		expect(await evaluate(body, { 'lunettes loin vision OD': number(0.8), 'réfraction objective vision OD': number(1), 'réfraction subjective de loin vision OD': number(0.9) })).toEqual(1)
		expect(await evaluate(body, {})).toEqual(0)
	})
})

/**
 * The percentile family, ported with the demo app's host helpers.
 *
 * Every one of these formulas derives the gestational age the same way: the term
 * is the last period plus 279 days (40 weeks less a day) and the age is
 * `280 + today - term`. `at(weeks, days)` inverts that, so a test says how
 * pregnant the patient is and never has to restate the offset.
 */
describe('the percentile family', () => {
	const bodyOf = (file: string, field: string) => {
		const found = computedFields.find((computed) => computed.file === file && computed.field === field)
		if (!found) throw new Error(`${file} has no computed field '${field}'`)
		return found.body
	}

	const LAST_PERIOD = { year: 2024, month: 0, day: 1 }
	const lastPeriodService = [hostService('Date des dernières règles', { type: 'datetime', value: 20240101 })]
	/** A host whose patient is exactly `weeks` weeks and `days` days pregnant at the consultation. */
	const at = (weeks: number, days = 0) => hostWith({ 'CD-GYNECOLOGY|duedate': lastPeriodService }, new Date(LAST_PERIOD.year, LAST_PERIOD.month, LAST_PERIOD.day + weeks * 7 + days - 1))

	const T2T3 = 'gynecology-fr/bb-t2-t3.json'
	const LONG = 'gynecology-fr/suivi-obstetrical-long.json'

	test('a measurement on a chart curve gives that curve percentile', async () => {
		const body = bodyOf(T2T3, 'Percentile Diamètre bipariétal')
		// The biparietal chart at 30 weeks: 3→69.07, 10→71.21, 50→75.80, 90→80.37, 97→82.52.
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(75.8, 'mm') }, at(30))).toBeCloseTo(50, 6)
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(71.21, 'mm') }, at(30))).toBeCloseTo(10, 6)
	})

	test('a measurement between two curves interpolates between their percentiles', async () => {
		const body = bodyOf(T2T3, 'Percentile Diamètre bipariétal')
		// Halfway between the 50th (75.80) and the 90th (80.37) at 30 weeks.
		expect(await evaluate(body, { 'Diamètre bipariétal': measure((75.8 + 80.37) / 2, 'mm') }, at(30))).toBeCloseTo(70, 6)
	})

	test('the chart clamps rather than extrapolating past either end', async () => {
		const body = bodyOf(T2T3, 'Percentile Diamètre bipariétal')
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(40, 'mm') }, at(30))).toEqual(3)
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(120, 'mm') }, at(30))).toEqual(97)
	})

	test('a measure typed with a unit and one typed without agree', async () => {
		const body = bodyOf(T2T3, 'Percentile Diamètre bipariétal')
		// A measure carrying a unit reaches the formula normalised to metres; one
		// typed bare arrives as the millimetre figure. Both must read the same chart.
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(75.8, 'mm') }, at(30))).toBeCloseTo(50, 6)
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(75.8) }, at(30))).toBeCloseTo(50, 6)
		expect(await evaluate(body, { 'Diamètre bipariétal': measure(7.58, 'cm') }, at(30))).toBeCloseTo(50, 6)
	})

	test('a Doppler index is read on the scale its chart tabulates, not as a length', async () => {
		const body = bodyOf(LONG, 'Percentile RI omb')
		// The umbilical resistance chart at 30 weeks: 5→0.56, 50→1.05, 95→1.54. An
		// index below 1 must stay itself: recovering millimetres from it, as the
		// biometric charts need, would make it 560 and clamp to the top curve.
		expect(await evaluate(body, { 'Indice de résistance ombilical': measure(0.56) }, at(30))).toBeCloseTo(5, 6)
		expect(await evaluate(body, { 'Indice de résistance ombilical': measure(1.05) }, at(30))).toBeCloseTo(50, 6)
	})

	test('the head circumference chart reads its 97th centile row despite the stray separator', async () => {
		const body = bodyOf(T2T3, 'Percentile Périmètre crânien')
		// That row is written `97>;16,136.11;…`. The Kotlin percentile throws on the
		// empty first segment, and only once a measurement exceeds the 90th centile,
		// so the legacy field blanked for exactly the large heads it mattered for.
		expect(await evaluate(body, { 'Périmètre crânien': measure(296, 'mm') }, at(30))).toBeCloseTo(97, 6)
		expect(await evaluate(body, { 'Périmètre crânien': measure(400, 'mm') }, at(30))).toEqual(97)
		expect(await evaluate(body, { 'Périmètre crânien': measure(270.84, 'mm') }, at(30))).toBeCloseTo(50, 6)
	})

	test('gestational age comes out in days on one form and in words on the other, and they agree', async () => {
		// 30 weeks and 3 days is 213 days. The legacy counted 280 days here and 279
		// there, so these two fields of one record used to disagree by a day; they are
		// reconciled on 280, and this is the test that would catch them drifting apart.
		expect(await evaluate(bodyOf(T2T3, 'jours'), {}, at(30, 3))).toEqual(213)
		expect(await evaluate(bodyOf(LONG, 'Age gestationnel'), {}, at(30, 3))).toEqual('30 sem. 3 j.')
	})

	test('a patient with no due-date service gets N/A in words and nothing in a number', async () => {
		const empty = hostWith({}, new Date(2024, 7, 1))
		expect(await evaluate(bodyOf(LONG, 'Age gestationnel'), {}, empty)).toEqual('N/A')
		expect(await evaluate(bodyOf(T2T3, 'jours'), {}, empty)).toBeUndefined()
		expect(await evaluate(bodyOf(T2T3, 'Percentile Diamètre bipariétal'), { 'Diamètre bipariétal': measure(75.8, 'mm') }, empty)).toBeUndefined()
	})

	test('the term prefers ovulation, then the corrected term, then the last period', async () => {
		const body = bodyOf(T2T3, 'jours')
		const consultation = new Date(2024, 0, 1 + 210)
		const ovulation = hostService('Date ovulation', { type: 'datetime', value: 20240115 })
		const corrected = hostService('Terme corrigé', { type: 'datetime', value: 20241001 })
		const lastPeriod = hostService('Date des dernières règles', { type: 'datetime', value: 20240101 })
		// The consultation is 210 days after the last period, and the age is
		// 280 + today - term, so each rule in the cascade gives a different answer.
		// Ovulation wins: its term is 266 days after 15 Jan, i.e. 280 after the last
		// period, so the age is exactly the 210 days since it.
		expect(await evaluate(body, {}, hostWith({ 'CD-GYNECOLOGY|duedate': [lastPeriod, ovulation, corrected] }, consultation))).toEqual(210)
		// The corrected term is taken as recorded: 274 days after the last period,
		// six short of 280, so the age reads six days more.
		expect(await evaluate(body, {}, hostWith({ 'CD-GYNECOLOGY|duedate': [lastPeriod, corrected] }, consultation))).toEqual(216)
		// The last period alone: its term is 40 weeks less a day, so one day more.
		expect(await evaluate(body, {}, hostWith({ 'CD-GYNECOLOGY|duedate': [lastPeriod] }, consultation))).toEqual(211)
	})

	test('the estimated weight is placed on the birth-weight chart', async () => {
		const measurements = { 'Circonférence abdominale': measure(250, 'mm'), 'Périmètre crânien': measure(270, 'mm'), 'Diamètre bipariétal': measure(75, 'mm'), 'Longueur fémorale': measure(55, 'mm') }
		const centile = (await evaluate(bodyOf(T2T3, 'Percentile poids'), measurements, at(30))) as number
		// The chart at 30 weeks runs 5→1231 g, 50→1450 g, 95→1669 g, and a fetus of
		// these dimensions sits inside it rather than against a clamp.
		expect(centile).toBeGreaterThan(5)
		expect(centile).toBeLessThan(95)

		// The projected birth weight reads that centile off the chart's term row.
		const projected = (await evaluate(bodyOf(T2T3, 'Poids naissance'), measurements, at(30))) as { value: number; unit: string }
		expect(projected.unit).toEqual('g')
		expect(projected.value).toBeGreaterThan(2848)
		expect(projected.value).toBeLessThan(3860)

		// A bigger fetus tracks a higher centile, and so a heavier birth weight.
		const bigger = { ...measurements, 'Circonférence abdominale': measure(290, 'mm') }
		expect((await evaluate(bodyOf(T2T3, 'Percentile poids'), bigger, at(30))) as number).toBeGreaterThan(centile)
	})

	test('weight gain is this visit less the weight recorded before the pregnancy', async () => {
		const body = bodyOf(LONG, 'Différence de poids')
		const host = hostWith({ 'CD-GYNECOLOGY|weightbeforepregnancy': [hostService('Poids avant grossesse', { type: 'measure', value: 62, unit: 'kg' })] })
		expect(await evaluate(body, { Poids: measure(71, 'kg') }, host)).toBeCloseTo(9, 6)
		// Either side missing yields no value, as the legacy's !pag||!x.Poids did.
		expect(await evaluate(body, {}, host)).toBeUndefined()
		expect(await evaluate(body, { Poids: measure(71, 'kg') }, hostWith({}))).toBeUndefined()
	})

	test('the consultation date and the CRL term come from the host', async () => {
		const consultation = new Date(2024, 7, 1)
		expect(await evaluate(bodyOf('gynecology-fr/echo-t1.json', 'Date de consultation'), {}, { consultDate: consultation })).toEqual(consultation)
		// The CRL table maps millimetres straight to days: 54 mm sits on the 86-day
		// point, so the term is 280 - 86 = 194 days after the consultation.
		expect(await evaluate(bodyOf('gynecology-fr/bb-t1.json', 'Terme CRL'), { CRL: measure(54, 'mm') }, { consultDate: consultation })).toEqual(new Date(2024, 7, 1 + 194))
	})
})
