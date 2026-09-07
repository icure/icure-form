import { Form, Group, Subform, TextField } from '../../src/components/model'

describe('alwaysVisible round-trip', () => {
	it('parses alwaysVisible: true on section, group, subform and field, and emits it via toJson', () => {
		const json = {
			form: 'F',
			sections: [
				{
					section: 'S',
					alwaysVisible: true,
					fields: [
						{ field: 'A', type: 'text-field', alwaysVisible: true },
						{ group: 'G', alwaysVisible: true, fields: [{ field: 'B', type: 'text-field' }] },
						{ subform: 'SF', id: 'sf1', alwaysVisible: true, forms: {} },
					],
				},
			],
		}

		const parsed = Form.parse(json as any)
		const section = parsed.sections[0]
		const field = section.fields[0] as TextField
		const group = section.fields[1] as Group
		const subform = section.fields[2] as Subform

		expect(section.alwaysVisible).toBe(true)
		expect(field.alwaysVisible).toBe(true)
		expect(group.alwaysVisible).toBe(true)
		expect(subform.alwaysVisible).toBe(true)

		expect(section.toJson().alwaysVisible).toBe(true)
		expect(field.toJson().alwaysVisible).toBe(true)
		expect(group.toJson().alwaysVisible).toBe(true)
		expect(subform.toJson().alwaysVisible).toBe(true)

		// Full round-trip: reparse the reserialized instance and confirm the flag survives.
		const reparsed = Form.parse(JSON.parse(JSON.stringify(parsed)))
		const section2 = reparsed.sections[0]
		const field2 = section2.fields[0] as TextField
		const group2 = section2.fields[1] as Group
		const subform2 = section2.fields[2] as Subform

		expect(section2.alwaysVisible).toBe(true)
		expect(field2.alwaysVisible).toBe(true)
		expect(group2.alwaysVisible).toBe(true)
		expect(subform2.alwaysVisible).toBe(true)
	})

	it('leaves alwaysVisible undefined when absent from the source, and toJson omits the key', () => {
		const json = {
			form: 'F',
			sections: [
				{
					section: 'S',
					fields: [
						{ field: 'A', type: 'text-field' },
						{ group: 'G', fields: [{ field: 'B', type: 'text-field' }] },
						{ subform: 'SF', id: 'sf1', forms: {} },
					],
				},
			],
		}

		const parsed = Form.parse(json as any)
		const section = parsed.sections[0]
		const field = section.fields[0] as TextField
		const group = section.fields[1] as Group
		const subform = section.fields[2] as Subform

		expect(section.alwaysVisible).toBeUndefined()
		expect(field.alwaysVisible).toBeUndefined()
		expect(group.alwaysVisible).toBeUndefined()
		expect(subform.alwaysVisible).toBeUndefined()

		// JSON.stringify drops undefined-valued keys, matching how absent optional
		// flags (e.g. roles, samePage) already serialize elsewhere in this model.
		expect(JSON.parse(JSON.stringify(section.toJson()))).not.toHaveProperty('alwaysVisible')
		expect(JSON.parse(JSON.stringify(field.toJson()))).not.toHaveProperty('alwaysVisible')
		expect(JSON.parse(JSON.stringify(group.toJson()))).not.toHaveProperty('alwaysVisible')
		expect(JSON.parse(JSON.stringify(subform.toJson()))).not.toHaveProperty('alwaysVisible')
	})
})
