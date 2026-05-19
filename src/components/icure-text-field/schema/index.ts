import { markdownSchemaSpec } from './markdown-schema'
import { dateSchemaSpec, dateTimeSchemaSpec, timeSchemaSpec } from './date-time-schema'
import { tokensSchemaSpec } from './token-schema'
import { measureSchemaSpec } from './measure-schema'
import { decimalSchemaSpec } from './decimal-schema'
import { itemsListSchemaSpec } from './items-list-schema'
import { IcureTextFieldSchema } from '../../model'
import { SchemaSpec } from './schema-spec'

export type { SchemaSpec, EditRequestContext, PrimitivesExtractorContext } from './schema-spec'
export { multivalueExtractor } from './schema-spec'

export function createSchemaSpec(
	type: IcureTextFieldSchema,
	colorProvider: (type: string, code: string, isCode: boolean) => string,
	contentProvider: (codes: { type: string; code: string }[]) => string,
): SchemaSpec {
	if (type === 'decimal') return decimalSchemaSpec
	if (type === 'measure') return measureSchemaSpec
	if (type === 'date') return dateSchemaSpec
	if (type === 'time') return timeSchemaSpec
	if (type === 'date-time') return dateTimeSchemaSpec
	if (type === 'items-list') return itemsListSchemaSpec
	if (type === 'tokens-list' || type === 'styled-tokens-list' || type === 'tokens-list-with-codes' || type === 'styled-tokens-list-with-codes') {
		return tokensSchemaSpec(type, contentProvider, colorProvider)
	}
	return markdownSchemaSpec(type, contentProvider, colorProvider)
}
