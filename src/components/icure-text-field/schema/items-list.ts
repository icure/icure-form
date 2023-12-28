import { SchemaSpec } from 'prosemirror-model'
import { reduceNodes } from './utils'

export type ItemsListSchema = 'items-list'

export function getItemsListSpec(): SchemaSpec {
	return {
		nodes: reduceNodes({
			doc: {
				content: 'paragraph*',
				parseDOM: [{ tag: 'ul' }],
				toDOM() {
					return ['ul', 0]
				},
			},

			paragraph: {
				content: 'inline*',
				group: 'block',
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
