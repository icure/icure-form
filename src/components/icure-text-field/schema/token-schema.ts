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
				content: 'token+',
				parseDOM: [{ tag: 'ul' }],
				toDOM() {
					return ['ul', 0]
				},
			},

			token: {
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
		marks: reduceMarks(getMarks(contentProvider, colorProvider), marksSelector),
	}
}
