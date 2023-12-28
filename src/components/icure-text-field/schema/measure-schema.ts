import { SchemaSpec } from 'prosemirror-model'

export type MeasureSchema = 'measure'

export function getMeasureSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'decimal unit',
			},

			decimal: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', { class: 'measure' }, 0]
				},
				regexp: '[\\>\\<,. 0-9-]',
			},

			unit: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', { class: 'unit' }, 0]
				},
				editable: false,
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}
