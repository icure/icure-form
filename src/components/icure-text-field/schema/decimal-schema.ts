import { SchemaSpec as ProseMirrorSchemaSpec } from 'prosemirror-model'
import { SchemaSpec } from './schema-spec'

export type DecimalSchema = 'decimal'

export function getDecimalSpec(): ProseMirrorSchemaSpec {
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

export const decimalSchemaSpec: SchemaSpec = {
	proseMirror: getDecimalSpec(),
	multivalue: false,
}
