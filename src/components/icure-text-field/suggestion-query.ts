import { MarkType, Node as ProsemirrorNode } from 'prosemirror-model'

/**
 * Where the suggestion palette's query starts inside the current paragraph: right after the last text carrying the
 * link mark before `to`, or `from` when nothing before the cursor is linked. Words already turned into codes are thus
 * never searched again, and a word typed right after an inserted suggestion is a fresh query rather than a suffix of
 * the linked term. While the cursor sits inside linked text the query is empty.
 */
export const suggestionQueryStart = (doc: ProsemirrorNode, from: number, to: number, link: MarkType | undefined): number => {
	if (!link || to <= from) return from
	let start = from
	doc.nodesBetween(from, to, (node, pos) => {
		if (node.isText && link.isInSet(node.marks)) start = Math.max(start, Math.min(pos + node.nodeSize, to))
	})
	return start
}
