import { Field, Form } from '../../src/components/model'

// `suggestions` / `links` opt a text-like field in to the host-level providers of <icure-form> even without
// `codifications`. They must parse from YAML/JSON, survive toJson and survive the render-time copy of a field.
describe('suggestions / links field flags', () => {
	const json = {
		form: 'F',
		sections: [
			{
				section: 'S',
				fields: [
					{ field: 'a', type: 'text-field', suggestions: true, links: true },
					{ field: 'b', type: 'token-field', codifications: ['ICD'] },
					{ field: 'c', type: 'items-list-field', suggestions: true },
					{ field: 'd', type: 'text-field' },
				],
			},
		],
	}

	const fields = (): Field[] => Form.parse(json as any).sections[0].fields as Field[]

	it('parses the flags on text, token and items-list fields', () => {
		const [a, b, c, d] = fields()
		expect(a.suggestions).toBe(true)
		expect(a.links).toBe(true)
		expect(b.suggestions).toBeUndefined()
		expect(b.links).toBeUndefined()
		expect(b.codifications).toEqual(['ICD'])
		expect(c.suggestions).toBe(true)
		expect(c.links).toBeUndefined()
		expect(d.suggestions).toBeUndefined()
		expect(d.links).toBeUndefined()
	})

	it('round-trips through toJson, emitting the flags only when set', () => {
		const out = JSON.parse(JSON.stringify(Form.parse(json as any).toJson())) as any
		const [a, b, c, d] = out.sections[0].fields
		expect(a.suggestions).toBe(true)
		expect(a.links).toBe(true)
		expect(b).not.toHaveProperty('suggestions')
		expect(b).not.toHaveProperty('links')
		expect(c.suggestions).toBe(true)
		expect(c).not.toHaveProperty('links')
		expect(d).not.toHaveProperty('suggestions')
		expect(d).not.toHaveProperty('links')
		expect(Form.parse(out).sections[0].fields.map((f) => [(f as Field).suggestions, (f as Field).links])).toEqual([[true, true], [undefined, undefined], [true, undefined], [undefined, undefined]])
	})

	it('survives copyIfNeeded, which the renderer applies to fields with computed properties', () => {
		const [a, , c] = fields()
		const a2 = a.copyIfNeeded({ span: 12 })
		expect(a2).not.toBe(a)
		expect(a2.suggestions).toBe(true)
		expect(a2.links).toBe(true)
		const c2 = c.copyIfNeeded({ span: 12 })
		expect(c2).not.toBe(c)
		expect(c2.suggestions).toBe(true)
	})
})
