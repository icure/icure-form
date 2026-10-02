import { Field, Form, Group, Subform, TextField } from '../../src/components/model'

const json = {
	form: 'F',
	sections: [
		{
			section: 'S0',
			fields: [{ field: 'A', type: 'text-field', required: true }],
		},
		{
			section: 'S1',
			fields: [
				{ field: 'B', type: 'number-field' },
				{
					group: 'G',
					fields: [
						{ field: 'C', type: 'date-picker' },
						{ group: 'H', fields: [{ field: 'D', type: 'measure-field' }] },
					],
				},
				{ subform: 'SF', id: 'sf', forms: { child: { form: 'Child', sections: [{ section: 'CS', fields: [{ field: 'E', type: 'text-field' }] }] } } },
			],
		},
	],
}

describe('Field.required', () => {
	it('parses, serialises only when set, and survives a round trip', () => {
		const parsed = Form.parse(json as any)
		const a = parsed.sections[0].fields[0] as TextField
		const b = parsed.sections[1].fields[0] as Field

		expect(a.required).toBe(true)
		expect(a.toJson().required).toBe(true)
		expect(b.required).toBeUndefined()
		expect('required' in b.toJson()).toBe(false)

		const reparsed = Form.parse(JSON.parse(JSON.stringify(parsed.toJson())))
		expect((reparsed.sections[0].fields[0] as Field).required).toBe(true)
	})

	it('is kept by copyIfNeeded, and can be overridden by a computed property', () => {
		const a = Form.parse(json as any).sections[0].fields[0] as TextField
		expect(a.copyIfNeeded({ span: 12 }).required).toBe(true)
		expect(a.copyIfNeeded({ required: false }).required).toBe(false)
	})
})

describe('Field.index', () => {
	it('is the path of the field in the form JSON, groups included', () => {
		const parsed = Form.parse(json as any)
		const s1 = parsed.sections[1]
		const g = s1.fields[1] as Group
		const h = g.fields?.[1] as Group

		expect((parsed.sections[0].fields[0] as Field).index).toBe('0-0')
		expect((s1.fields[0] as Field).index).toBe('1-0')
		expect((g.fields?.[0] as Field).index).toBe('1-1-0')
		expect((h.fields?.[0] as Field).index).toBe('1-1-1-0')
	})

	it('restarts inside a subform form, whose fields render in their own shadow roots', () => {
		const subform = Form.parse(json as any).sections[1].fields[2] as Subform
		expect((subform.forms.child.sections[0].fields[0] as Field).index).toBe('0-0')
	})

	it('is derived: absent from toJson, from spreads, and kept by copyIfNeeded', () => {
		const b = Form.parse(json as any).sections[1].fields[0] as Field

		expect('index' in b.toJson()).toBe(false)
		expect(Object.keys(b)).not.toContain('index')
		expect(b.copyIfNeeded({ span: 12 }).index).toBe('1-0')
	})
})
