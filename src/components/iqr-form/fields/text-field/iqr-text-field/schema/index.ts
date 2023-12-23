import { Schema } from 'prosemirror-model'
import { DocumentSchema, getMarkdownSpec, InlineSchema, StyledSchema } from './markdown-schema'
import { DateSchema, DateTimeSchema, getDateSpec, getDateTimeSpec, getTimeSpec, TimeSchema } from './date-time-schema'
import { getTokensSpec, TokensSchema } from './token-schema'
import { getMeasureSpec, MeasureSchema } from './measure-schema'
import { DecimalSchema, getDecimalSpec } from './decimal-schema'

export type IqrTextFieldSchema = DocumentSchema | TokensSchema | StyledSchema | InlineSchema | DateSchema | TimeSchema | DateTimeSchema | DecimalSchema | MeasureSchema

export function createSchema(
	type: IqrTextFieldSchema,
	colorProvider: (type: string, code: string, isCode: boolean) => string,
	contentProvider: (codes: { type: string; code: string }[]) => string,
): Schema {
	return new Schema(
		type === 'decimal'
			? getDecimalSpec()
			: type === 'measure'
			? getMeasureSpec()
			: type === 'date'
			? getDateSpec()
			: type === 'time'
			? getTimeSpec()
			: type === 'date-time'
			? getDateTimeSpec()
			: type === 'tokens-list' || type === 'styled-tokens-list' || type === 'tokens-list-with-codes' || type === 'styled-tokens-list-with-codes'
			? getTokensSpec(type, contentProvider, colorProvider)
			: getMarkdownSpec(type, contentProvider, colorProvider),
	)
}
