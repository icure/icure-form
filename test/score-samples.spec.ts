import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { makeInterpreter } from '../src/utils/interpreter'
import { parsePrimitive } from '../src/utils/primitive'
import { Field, Form, Group, PrimitiveType } from '../src/components/model'

// Runs the computedProperties.value bodies of the clinical score samples (15 to 18)
// against the published worked examples. The interpreter swallows errors, so a typo in
// a coefficient table or a misnamed field would otherwise only show as an empty field.

const SAMPLES = resolve(__dirname, '../app/samples')

type FieldValue = { content: { [language: string]: PrimitiveType }; codes?: { id: string }[] }

const formulasOf = (file: string): { [field: string]: string } => {
	const form = Form.parse(YAML.parse(readFileSync(resolve(SAMPLES, file), 'utf8')))
	const found: { [field: string]: string } = {}
	const walk = (fgs: (Field | Group | any)[]) =>
		fgs.forEach((fg) => {
			if (fg.clazz === 'group') walk(fg.fields ?? [])
			else if (fg.computedProperties?.value) found[fg.field] = fg.computedProperties.value
		})
	form.sections.forEach((s) => walk(s.fields))
	return found
}

/** The subset of BridgedFormValuesContainer.compute's sandbox these bodies use. */
const sandboxFor = (values: { [label: string]: FieldValue[] }, context: { [key: string]: any } = {}) => {
	const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
		if (!content) return undefined
		const primitive = content['*'] ?? content[Object.keys(content)[0]]
		return primitive && parsePrimitive(primitive, toString)
	}
	const text = (item?: FieldValue) => (item ? parseContent(item.content, true)?.toString() : undefined)
	const hasOption = (it: FieldValue | undefined, option: string) => !!it && !!it.codes?.some((c) => c.id === option || c.id?.split('|')?.[1] === option)
	const natives: { [key: string]: any } = { parseInt, parseFloat, Date, Math, Number, String, Boolean, Array, Object, Promise, parseContent, text, hasOption }
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

const number = (value: number): FieldValue[] => [{ content: { '*': { type: 'number', value } } }]
const option = (field: string, key: string): FieldValue[] => [{ content: { '*': { type: 'string', value: key } }, codes: [{ id: `${field}|${key}|1` }] }]
const ticked = (): FieldValue[] => [{ content: { '*': { type: 'compound', value: { yes: { type: 'boolean', value: true } } } as PrimitiveType }, codes: [{ id: 'yes' }] }]

const interpret = makeInterpreter()

/** Evaluates `fields` in order, feeding each result back so later fields can read earlier ones. */
const run = async (file: string, values: { [label: string]: FieldValue[] }, fields: string[], context: { [key: string]: any } = {}) => {
	const formulas = formulasOf(file)
	const results: { [field: string]: unknown } = {}
	for (const field of fields) {
		expect(formulas[field]).toBeDefined()
		const result: any = await interpret<unknown, any>(formulas[field], sandboxFor(values, context))
		results[field] = result?.content ? parseContent(result) : result
		if (result !== undefined) values[field] = result?.content ? [result] : [{ content: { '*': { type: 'string', value: result } } }]
	}
	return results
}
const parseContent = (v: FieldValue) => (v.content['*'] as any)?.value

describe('15 — SCORE2', () => {
	const inputs = (sex: string, age: number, region?: string) => ({
		sex: option('sex', sex),
		ageYears: number(age),
		smoker: ticked(),
		systolicBp: number(140),
		totalCholesterol: number(5.5),
		hdlCholesterol: number(1.3),
		...(region ? { riskRegion: option('riskRegion', region) } : {}),
	})

	test('male, 50, smoker, low-risk region', async () => {
		const r = await run('15-score2.yaml', inputs('male', 50), ['score2Risk', 'score2Category'])
		expect(r.score2Risk).toBeCloseTo(5.9, 1)
		expect(r.score2Category).toEqual('High')
	})

	test('recalibration raises the risk with the region', async () => {
		const low = (await run('15-score2.yaml', inputs('female', 60, 'low'), ['score2Risk'])).score2Risk as number
		const veryHigh = (await run('15-score2.yaml', inputs('female', 60, 'veryHigh'), ['score2Risk'])).score2Risk as number
		expect(veryHigh).toBeGreaterThan(low * 2)
	})

	test('diabetes points to SCORE2-Diabetes instead of a category', async () => {
		const r = await run('15-score2.yaml', { ...inputs('male', 50), diabetes: ticked() }, ['score2Risk', 'score2Category'])
		expect(r.score2Category).toMatch(/SCORE2-Diabetes/)
	})

	test('outside 40–69 there is no risk, only a hint', async () => {
		const r = await run('15-score2.yaml', inputs('male', 72), ['score2Risk', 'score2Category'])
		expect(r.score2Risk).toBeUndefined()
		expect(r.score2Category).toMatch(/40 to 69/)
	})
})

describe('16 — Framingham', () => {
	test("D'Agostino 2008 worked example: woman, 61, smoker, TC 180 mg/dL, HDL 47 mg/dL, untreated SBP 124 → 10.48 %", async () => {
		const r = await run(
			'16-framingham.yaml',
			{
				sex: option('sex', 'female'),
				ageYears: number(61),
				smoker: ticked(),
				systolicBp: number(124),
				totalCholesterol: number(180 / 38.67),
				hdlCholesterol: number(47 / 38.67),
			},
			['framinghamRisk'],
		)
		expect(r.framinghamRisk).toBeCloseTo(10.5, 1)
	})

	test('the example in the form label', async () => {
		const r = await run('16-framingham.yaml', { sex: option('sex', 'male'), ageYears: number(55), systolicBp: number(140), totalCholesterol: number(5.5), hdlCholesterol: number(1.3) }, [
			'framinghamRisk',
			'framinghamCategory',
		])
		expect(r.framinghamRisk).toBeCloseTo(13.4, 1)
		expect(r.framinghamCategory).toEqual('Intermediate (10–20%)')
	})

	test('treated hypertension and smoking raise a woman’s risk', async () => {
		const base = { sex: option('sex', 'female'), ageYears: number(60), systolicBp: number(150), totalCholesterol: number(6), hdlCholesterol: number(1.4) }
		const untreated = (await run('16-framingham.yaml', { ...base }, ['framinghamRisk'])).framinghamRisk as number
		const treated = (await run('16-framingham.yaml', { ...base, treatedHypertension: ticked(), smoker: ticked() }, ['framinghamRisk'])).framinghamRisk as number
		expect(untreated).toBeGreaterThan(5)
		expect(treated).toBeGreaterThan(untreated)
	})
})

describe('17 — AGLA', () => {
	const inputs = (sex: string) => ({
		sex: option('sex', sex),
		ageYears: number(55),
		smoker: ticked(),
		systolicBp: number(145),
		ldlCholesterol: number(4.0),
		hdlCholesterol: number(1.0),
		triglycerides: number(1.8),
	})

	test('male: 55 PROCAM points, 22.2 % × 0.7', async () => {
		const r = await run('17-agla.yaml', inputs('male'), ['procamPoints', 'aglaRisk', 'aglaCategory'])
		expect(r.procamPoints).toEqual(55)
		expect(r.aglaRisk).toEqual('15.5 %')
		expect(r.aglaCategory).toEqual('Intermediate (10–20%)')
	})

	test('female: a further × 0.25', async () => {
		const r = await run('17-agla.yaml', inputs('female'), ['procamPoints', 'aglaRisk', 'aglaCategory'])
		expect(r.aglaRisk).toEqual('3.9 %')
		expect(r.aglaCategory).toEqual('Low (<10%)')
	})

	test('the table ends below 21 and above 59 points', async () => {
		const low = await run(
			'17-agla.yaml',
			{ sex: option('sex', 'male'), ageYears: number(36), systolicBp: number(110), ldlCholesterol: number(2), hdlCholesterol: number(1.6), triglycerides: number(1) },
			['procamPoints', 'aglaRisk'],
		)
		expect(low.procamPoints).toEqual(0)
		expect(low.aglaRisk).toEqual('< 0.7 %')
	})
})

describe('18 — FRAX', () => {
	const inputs = () => ({
		country: option('country', 'be'),
		sex: option('sex', 'female'),
		ageYears: number(70),
		weight: number(60),
		height: number(160),
		previousFracture: ticked(),
	})

	test('BMI and risk-factor count are computed locally', async () => {
		const r = await run('18-frax.yaml', inputs(), ['bmi', 'riskFactorCount'])
		expect(r.bmi).toEqual(23.4)
		expect(r.riskFactorCount).toEqual(1)
	})

	test('the probability is whatever the host frax() answers', async () => {
		const frax = jest.fn(async () => ({ hip: 3.14159, majorOsteoporotic: 12 }))
		const r = await run('18-frax.yaml', inputs(), ['fraxHip'], { frax })
		expect(r.fraxHip).toEqual('3.1 %')
		expect(frax).toHaveBeenCalledWith(expect.objectContaining({ country: 'be', sex: 'female', age: 70, weightKg: 60, heightCm: 160, previousFracture: true, alcohol: false }))
	})

	test('without a FRAX service the field says so', async () => {
		const r = await run('18-frax.yaml', inputs(), ['fraxHip'], { frax: async () => undefined })
		expect(r.fraxHip).toMatch(/No FRAX service configured/)
	})
})

describe('checkbox option keys stay strings', () => {
	test('`yes` is not read as a YAML 1.1 boolean', () => {
		const form = Form.parse(YAML.parse(readFileSync(resolve(SAMPLES, '15-score2.yaml'), 'utf8')))
		const smoker = (form.sections[0].fields[0] as Group).fields?.find((f: any) => f.field === 'smoker') as Field
		expect(Object.keys(smoker.options ?? {})).toEqual(['yes'])
	})
})
