import { Form, Section, CheckBox } from '../../src/components/model'

// A section flagged `compact` is rendered with a `compact` CSS class that tightens the
// vertical spacing of its fields (see src/components/common/styles/style.scss).
describe('Section.compact', () => {
	test('is parsed from JSON', () => {
		const section = Section.parse({ section: 'Main', compact: true, fields: [] })
		expect(section.compact).toBe(true)
	})

	test('is written back by toJson', () => {
		const section = new Section('Main', [], undefined, undefined, undefined, true)
		expect(section.toJson().compact).toBe(true)
	})

	test('is absent by default and left out of the serialised JSON', () => {
		const section = Section.parse({ section: 'Main', fields: [] })
		expect(section.compact).toBeUndefined()
		expect(JSON.parse(JSON.stringify(section.toJson()))).not.toHaveProperty('compact')
	})

	test('survives a full Form round trip', () => {
		const form = new Form('Vaccins', [new Section('Main', [new CheckBox('Tedivax', { span: 6, options: { Tedivax: 'Tedivax' } })], undefined, undefined, undefined, true)])
		const reparsed = Form.parse(JSON.parse(JSON.stringify(form.toJson())))
		expect(reparsed.sections[0].compact).toBe(true)
	})
})
