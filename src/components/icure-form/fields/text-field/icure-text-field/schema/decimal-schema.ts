import { SchemaSpec } from 'prosemirror-model'

export type DecimalSchema = 'decimal'

export function getDecimalSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'decimal',
			},

			decimal: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', 0]
				},
				regexp: '[,. 0-9-]',
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}
