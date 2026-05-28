import { SchemaSpec as ProseMirrorSchemaSpec, Node as ProsemirrorNode } from 'prosemirror-model'
import { IcureTextFieldSchema, PrimitiveType } from '../../model'

export interface PrimitivesExtractorContext {
	serialize: (node: ProsemirrorNode) => string
}

export interface EditRequestContext {
	trigger: 'token-click' | 'field-edit'
	tokenId?: string
	tokenContent?: string
	label: string
	language: string
	schema: IcureTextFieldSchema
	readonly: boolean
	actionListener?: (event: string, payload: unknown, domEvent?: Event) => void
	domEvent?: Event
}

export interface SchemaSpec {
	proseMirror: ProseMirrorSchemaSpec
	multivalue: boolean
	primitiveTypesExtractor?: (doc: ProsemirrorNode | undefined, ctx: PrimitivesExtractorContext) => [string, PrimitiveType][]
	onEditRequest?: (ctx: EditRequestContext) => Promise<boolean>
}

export const multivalueExtractor: NonNullable<SchemaSpec['primitiveTypesExtractor']> = (doc, ctx) =>
	doc?.childCount
		? [...Array(doc.childCount).keys()].map((idx) => {
				const child = doc.child(idx)
				const id: string = child.attrs.id ?? ''
				return [id, { type: 'string', value: ctx.serialize(child) }] as [string, PrimitiveType]
		  })
		: []
