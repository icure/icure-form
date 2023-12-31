import { Schema } from 'prosemirror-model'
import { getMarkdownSpec } from './markdown-schema'
import { getDateSpec, getDateTimeSpec, getTimeSpec } from './date-time-schema'
import { getTokensSpec } from './token-schema'
import { getMeasureSpec } from './measure-schema'
import { getDecimalSpec } from './decimal-schema'
import { getItemsListSpec } from './items-list'
import { IcureTextFieldSchema } from '../../model'

export function createSchema(
	type: IcureTextFieldSchema,
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
			: type === 'items-list'
			? getItemsListSpec()
			: type === 'tokens-list' || type === 'styled-tokens-list' || type === 'tokens-list-with-codes' || type === 'styled-tokens-list-with-codes'
			? getTokensSpec(type, contentProvider, colorProvider)
			: getMarkdownSpec(type, contentProvider, colorProvider),
	)
}
