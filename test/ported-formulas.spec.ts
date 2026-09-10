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

/** The subset of BridgedFormValuesContainer.compute's sandbox that the ported bodies use. */
const sandboxFor = (values: { [label: string]: FieldValue[] }) => {
	const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
		if (!content) {
			return undefined
		}
		const primitive = content['*'] ?? content[Object.keys(content)[0]]
		return primitive && parsePrimitive(primitive, toString)
	}
	const natives: { [key: string]: any } = { parseInt, parseFloat, Date, Math, Number, String, Boolean, Array, Object, Promise, parseContent }
	const proxy: any = new Proxy(
		{},
		{
			has: () => true,
			get: (_target, key: string | symbol) => {
				if (key === 'undefined') return undefined
				if (natives[key as string]) return natives[key as string]
				if (key === 'self') return proxy
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
const evaluate = (body: string, values: { [label: string]: FieldValue[] }) => interpret<unknown, any>(body, sandboxFor(values))

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
		expect(computed.reads.length).toBeGreaterThan(0)
		expect((computed as any).readTypes).not.toContain(undefined)

		const values = Object.fromEntries(computed.reads.map((read, index) => [read, plausible((computed as any).readTypes[index])]))
		await expect(evaluate(computed.body, values)).resolves.toBeDefined()
		// And with nothing filled in, a formula must decline to produce a value
		// rather than throw or invent one — except the scores, which legitimately
		// total 0, and the gestational ages, which say so in words.
		const empty = await evaluate(computed.body, {})
		expect(['undefined', 'number', 'string']).toContain(typeof empty)
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
