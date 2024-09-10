import { MarkSpec, SchemaSpec } from 'prosemirror-model'
import { reduceMarks, reduceNodes } from './utils'
import { getMarks } from './common-marks'

export type TokensSchema = 'tokens-list' | 'styled-tokens-list' | 'tokens-list-with-codes' | 'styled-tokens-list-with-codes'

export function getTokensSpec(
	type: TokensSchema,
	contentProvider: (codes: { type: string; code: string }[]) => string,
	colorProvider: (type: string, code: string, isCode: boolean) => string,
): SchemaSpec {
	const marksSelector: (key: string, spec: MarkSpec) => boolean = (key: string) => {
		// noinspection RedundantConditionalExpressionJS
		return key !== 'link' && ['styled-tokens-list', 'styled-tokens-list-with-codes'].includes(type)
			? true
			: key === 'link' && ['tokens-list-with-codes', 'styled-text-with-codes']
			? true
			: false
	}
	return {
		nodes: reduceNodes({
			doc: {
				content: 'token*',
			},

			token: {
				content: 'inline*',
				group: 'block',
				attrs: { id: { default: undefined } },
				parseDOM: [{ tag: 'li' }],
				toDOM(node) {
					return ['li', {}, ['span', { class: 'token' }, 0], ['icure-metadata-buttons-bar-wrapper', { id: node.attrs.id }]]
				},
			},

			text: {
				group: 'inline',
			},
		}),
		marks: reduceMarks(getMarks(contentProvider, colorProvider), marksSelector),
	}
}
