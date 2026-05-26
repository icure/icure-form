import { flatten } from '../../src/components/icure-form/renderer/card/flatten'
import { Form, Section, Group, TextField } from '../../src/components/model'

function mkField(label: string, extra: Partial<TextField> = {}): TextField {
	const f = new TextField(label, {})
	Object.assign(f, extra)
	return f
}

describe('card flatten — samePage', () => {
	it('appends a samePage Field to the previous card, ignoring questionsPerCard', () => {
		const form = new Form('F', [new Section('S', [mkField('A'), mkField('B', { samePage: true })])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(1)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A', 'B'])
	})

	it('joins a samePage Field across a group boundary', () => {
		const form = new Form('F', [new Section('S', [mkField('A'), new Group('G', [mkField('B', { samePage: true })], {})])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(1)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A', 'B'])
	})

	it('falls back to a fresh card when samePage is the very first item', () => {
		const form = new Form('F', [new Section('S', [mkField('A', { samePage: true })])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(1)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A'])
	})

	it('places an entire samePage Group on the previous card, overriding questionsPerCard', () => {
		const group = new Group('G', [mkField('B'), mkField('C'), mkField('D')], {})
		group.samePage = true
		const form = new Form('F', [new Section('S', [mkField('A'), group])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(1)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A', 'B', 'C', 'D'])
	})

	it('handles nested samePage groups', () => {
		const inner = new Group('Inner', [mkField('C'), mkField('D')], {})
		inner.samePage = true
		const outer = new Group('Outer', [mkField('B'), inner], {})
		outer.samePage = true
		const form = new Form('F', [new Section('S', [mkField('A'), outer])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(1)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A', 'B', 'C', 'D'])
	})

	it('does not bleed samePage suppression past the group exit', () => {
		const samePageGroup = new Group('SP', [mkField('B'), mkField('C')], {})
		samePageGroup.samePage = true
		const normalGroup = new Group('N', [mkField('D')], {})
		const form = new Form('F', [new Section('S', [mkField('A'), samePageGroup, normalGroup])])
		const cards = flatten(form, { questionsPerCard: 1 })
		expect(cards).toHaveLength(2)
		expect(cards[0].fields.map((f) => f.field)).toEqual(['A', 'B', 'C'])
		expect(cards[1].fields.map((f) => f.field)).toEqual(['D'])
	})

	it('round-trips samePage through Form.parse / toJson for Field and Group', () => {
		const json = {
			form: 'F',
			sections: [
				{
					section: 'S',
					fields: [
						{ field: 'A', type: 'text-field' },
						{ field: 'B', type: 'text-field', samePage: true },
						{ group: 'G', samePage: true, fields: [{ field: 'C', type: 'text-field' }] },
					],
				},
			],
		}
		const parsed = Form.parse(json as any)
		const fieldB = parsed.sections[0].fields[1] as TextField
		const groupG = parsed.sections[0].fields[2] as Group
		expect(fieldB.samePage).toBe(true)
		expect(groupG.samePage).toBe(true)

		const reparsed = Form.parse(JSON.parse(JSON.stringify(parsed)))
		const fieldB2 = reparsed.sections[0].fields[1] as TextField
		const groupG2 = reparsed.sections[0].fields[2] as Group
		expect(fieldB2.samePage).toBe(true)
		expect(groupG2.samePage).toBe(true)
	})
})
