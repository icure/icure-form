import { SchemaSpec as ProseMirrorSchemaSpec } from 'prosemirror-model'
import { reduceNodes } from './utils'
import { multivalueExtractor, SchemaSpec } from './schema-spec'

export type ItemsListSchema = 'items-list'

export function getItemsListSpec(): ProseMirrorSchemaSpec {
	return {
		nodes: reduceNodes({
			doc: {
				content: 'item*',
			},

			item: {
				content: 'inline*',
				group: 'block',
				attrs: { id: { default: undefined } },
				parseDOM: [{ tag: 'li' }],
				toDOM() {
					return ['li', 0]
				},
			},

			text: {
				group: 'inline',
			},
		}),
		marks: {},
	}
}

export const itemsListSchemaSpec: SchemaSpec = {
	proseMirror: getItemsListSpec(),
	multivalue: true,
	primitiveTypesExtractor: multivalueExtractor,
}
