import { Suggestion } from '../generic'

/**
 * Pure rules for rendering hierarchical suggestions (see plans/prd-hierarchical-suggestions.md, R2).
 *
 * This module knows nothing about DOM or Lit. Both suggestion surfaces (the palette under text fields and the dropdown
 * popover) turn a provider result into `SuggestionRow[]` through `visibleRows` and keep a `TreeUiState` for the user's
 * manual expand/collapse and "N more" reveals. The library never matches labels against the search: everything here
 * derives from the provider's `matched` markers (absent = matched) and from the two override maps.
 */

/** Child indices from the root list, joined with '/', e.g. '2/0/4'. Keys UI state: ids may legitimately repeat across a tree. */
export type TreePath = string

export interface TreeUiState {
	/** Manual chevron overrides. Present = the user toggled this node; value = expanded. */
	expanded: Record<TreePath, boolean>
	/** Nodes whose hidden (non-matching) children were revealed through their "N more" row. */
	revealed: Record<TreePath, true>
}

export type SuggestionRow =
	| { kind: 'node'; path: TreePath; suggestion: Suggestion; depth: number; hasChildren: boolean; expanded: boolean }
	/** Trailing row of an expanded node with hidden children. `path` is the parent's; `depth` is the hidden children's. */
	| { kind: 'more'; path: TreePath; depth: number; count: number }

export const emptyTreeState = (): TreeUiState => ({ expanded: {}, revealed: {} })

export const toggleExpanded = (state: TreeUiState, path: TreePath, currentlyExpanded: boolean): TreeUiState => ({
	...state,
	expanded: { ...state.expanded, [path]: !currentlyExpanded },
})

export const reveal = (state: TreeUiState, path: TreePath): TreeUiState => ({ ...state, revealed: { ...state.revealed, [path]: true } })

export const isMatched = (s: Suggestion): boolean => s.matched !== false

export const matchedInSubtree = (s: Suggestion): boolean => isMatched(s) || (s.children ?? []).some(matchedInSubtree)

export const hasHierarchy = (roots: Suggestion[]): boolean => roots.some((s) => !!s.children?.length)

export const parentPath = (path: TreePath): TreePath | undefined => {
	const idx = path.lastIndexOf('/')
	return idx < 0 ? undefined : path.substring(0, idx)
}

export const nodeAtPath = (roots: Suggestion[], path: TreePath): Suggestion | undefined => {
	if (!path.length) return undefined
	let list: Suggestion[] | undefined = roots
	let node: Suggestion | undefined = undefined
	for (const segment of path.split('/')) {
		node = list?.[Number(segment)]
		if (!node) return undefined
		list = node.children
	}
	return node
}

/**
 * The rows to display, depth-first in display order.
 *
 * - A node with children is expanded by default when the search has terms and some descendant is matched; an entry in
 *   `state.expanded` overrides the default either way.
 * - Inside an expanded node that has a matched descendant and has not been revealed, children whose subtree holds no
 *   matched node are hidden and a `more` row with their count closes the group. A node with no matched descendant (it
 *   matched by itself, or the user revealed it) expands to its full child list.
 * - Without search terms markers are ignored: roots are collapsed by default, nothing is hidden, no `more` rows appear.
 * - Roots are always shown, even when their subtree holds no match (a provider should not return such a node).
 *
 * Paths always use a child's index in the full `children` list, so pruning never shifts them.
 */
export const visibleRows = (roots: Suggestion[], hasTerms: boolean, state: TreeUiState): SuggestionRow[] => {
	const rows: SuggestionRow[] = []
	const walk = (nodes: Suggestion[], prefix: TreePath | undefined, depth: number, prune: boolean) => {
		let hidden = 0
		nodes.forEach((node, idx) => {
			if (prune && !matchedInSubtree(node)) {
				hidden++
				return
			}
			const path = prefix === undefined ? `${idx}` : `${prefix}/${idx}`
			const children = node.children ?? []
			const hasChildren = children.length > 0
			// Only a match somewhere below justifies auto-expanding and pruning. A node that matched by itself (or
			// an unmatched node the user revealed) expands to its full child list: there is no filter to apply.
			const anyChildMatched = hasTerms && children.some(matchedInSubtree)
			const expanded = hasChildren && (state.expanded[path] ?? anyChildMatched)
			rows.push({ kind: 'node', path, suggestion: node, depth, hasChildren, expanded })
			if (expanded) {
				walk(children, path, depth + 1, anyChildMatched && !state.revealed[path])
			}
		})
		if (hidden > 0 && prefix !== undefined) {
			rows.push({ kind: 'more', path: prefix, depth, count: hidden })
		}
	}
	walk(roots, undefined, 0, false)
	return rows
}

/**
 * The terms whose typed occurrence a selection replaces in the palette: the node's own `terms` when it has any, else the
 * `terms` of its first matched descendant (depth-first) that has any, else the query terms the palette searched with.
 * Lets a provider leave `terms` empty on the unmatched ancestors it returns for context.
 */
export const replacementTerms = (s: Suggestion, queryTerms: string[]): string[] => {
	if (s.terms?.length) return s.terms
	const fromDescendants = (nodes: Suggestion[]): string[] | undefined => {
		for (const n of nodes) {
			if (isMatched(n) && n.terms?.length) return n.terms
			const deeper = fromDescendants(n.children ?? [])
			if (deeper) return deeper
		}
		return undefined
	}
	return fromDescendants(s.children ?? []) ?? queryTerms
}
