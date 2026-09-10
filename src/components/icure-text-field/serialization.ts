import { Node as ProsemirrorNode } from 'prosemirror-model'
import { defaultMarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown'
import { Code } from '../model'

/**
 * Inline markdown of a paragraph-topped document (`styled-text`, `text-with-codes`, `styled-text-with-codes`): the text
 * with its em, strong and link marks, in the form the field's markdown parser reads back. `defaultMarkdownSerializer`
 * itself expects block content and would drop the marks of a bare paragraph.
 */
// prosemirror-markdown marks the state constructor @internal, so its typings hide the (nodes, marks, options) signature
// that MarkdownSerializer.serialize itself uses, and its `out` buffer; we need the state directly to render inline content.
type StateConstructor = new (nodes: typeof defaultMarkdownSerializer.nodes, marks: typeof defaultMarkdownSerializer.marks, options: Record<string, unknown>) => MarkdownSerializerState

export const serializeInlineMarkdown = (content: ProsemirrorNode): string => {
	const state = new (MarkdownSerializerState as unknown as StateConstructor)(defaultMarkdownSerializer.nodes, defaultMarkdownSerializer.marks, {})
	state.renderInline(content)
	return (state as unknown as { out: string }).out
}

/**
 * The codes carried by the link marks of a document. A link href lists comma-separated `c-<type>://<code>` entries —
 * the convention the link mark's toDOM reads — where `<code>` may also be a full `type|code|version` id. Entries of
 * another category (`i-` internal links, `x-` external links) are ignored, and duplicates collapse on id. The version
 * defaults to `1` when the href carries none, as `normalizeCode` does for codes without one.
 */
export const codesFromLinks = (doc: ProsemirrorNode | undefined): Code[] => {
	if (!doc) return []
	const link = doc.type.schema.marks['link']
	if (!link) return []
	const codes = new Map<string, Code>()
	doc.descendants((node) => {
		if (!node.isText) return
		const href = link.isInSet(node.marks)?.attrs?.href as string | undefined
		href?.split(',').forEach((url) => {
			const at = url.indexOf('://')
			if (at < 0 || !url.startsWith('c-')) return
			const protocolType = url.substring(2, at)
			const rest = url.substring(at + 3)
			const [type, code, version] = rest.includes('|') ? rest.split('|') : [protocolType, rest, '1']
			if (!type || !code) return
			const id = `${type}|${code}|${version || '1'}`
			if (!codes.has(id)) codes.set(id, { id, type, code, version: version || '1', label: {} })
		})
	})
	return Array.from(codes.values())
}
