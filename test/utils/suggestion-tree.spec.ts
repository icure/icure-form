import { Suggestion } from '../../src/generic'
import {
	emptyTreeState,
	hasHierarchy,
	isMatched,
	matchedInSubtree,
	nodeAtPath,
	parentPath,
	replacementTerms,
	reveal,
	SuggestionRow,
	toggleExpanded,
	TreeUiState,
	visibleRows,
} from '../../src/utils/suggestion-tree'

// Fixture: two chapters, codes, thesaurus terms. `T4` is deliberately present under two parents (0/1/1 and 1/0/1).
const term = (id: string, text: string, terms: string[] = []): Suggestion => ({ id, text, terms, label: { fr: text } })
const node = (id: string, text: string, children: Suggestion[]): Suggestion => ({ id, text, terms: [], label: { fr: text }, children })

const tree = (): Suggestion[] => [
	node('CH-IX', 'Chapitre IX', [
		node('I10', 'I10', [term('T1', 'hypertension essentielle', ['hypertension']), term('T2', 'tension élevée', ['tension'])]),
		node('I20', 'I20', [term('T3', 'angine de poitrine', ['angine']), term('T4', 'douleur thoracique', ['douleur'])]),
	]),
	node('CH-X', 'Chapitre X', [node('J45', 'J45', [term('T5', 'asthme', ['asthme']), term('T4', 'douleur thoracique', ['douleur'])]), term('J40', 'J40')]),
]

const flat = (): Suggestion[] => [term('A', 'a', ['a']), term('B', 'b', ['b']), term('C', 'c', ['c'])]

/** Direct child by index, typed as present: the fixture is static, so a miss is a test bug and fails loudly downstream. */
const child = (s: Suggestion, i: number): Suggestion => (s.children ?? [])[i]

/** Deep-copies the tree and sets `matched` on every node from the set of matched ids (the provider's job in production). */
const marked = (roots: Suggestion[], matchedIds: string[]): Suggestion[] => {
	const walk = (s: Suggestion): Suggestion => ({ ...s, matched: matchedIds.includes(s.id), children: s.children?.map(walk) })
	return roots.map(walk)
}

/** Compact, order-preserving rendering of rows for readable assertions: indentation = depth, [+]/[-] = collapsed/expanded. */
const sketch = (rows: SuggestionRow[]): string[] =>
	rows.map((r) => {
		const pad = '  '.repeat(r.depth)
		return r.kind === 'node' ? `${pad}${r.suggestion.id}${r.hasChildren ? (r.expanded ? ' [-]' : ' [+]') : ''}` : `${pad}+${r.count} more`
	})

const rowsOf = (roots: Suggestion[], hasTerms = true, state: TreeUiState = emptyTreeState()) => visibleRows(roots, hasTerms, state)

describe('suggestion-tree: markers', () => {
	it('isMatched reads an absent marker as matched', () => {
		expect(isMatched(term('x', 'x'))).toBe(true)
		expect(isMatched({ ...term('x', 'x'), matched: true })).toBe(true)
		expect(isMatched({ ...term('x', 'x'), matched: false })).toBe(false)
	})

	it('matchedInSubtree is true when the node or any descendant is matched', () => {
		const roots = marked(tree(), ['T5'])
		expect(matchedInSubtree(roots[1])).toBe(true)
		expect(matchedInSubtree(child(roots[1], 0))).toBe(true)
		expect(matchedInSubtree(child(roots[1], 1))).toBe(false)
		expect(matchedInSubtree(roots[0])).toBe(false)
	})

	it('hasHierarchy is false for flat lists and true when any node has children', () => {
		expect(hasHierarchy(flat())).toBe(false)
		expect(hasHierarchy(tree())).toBe(true)
		expect(hasHierarchy([{ ...term('x', 'x'), children: [] }])).toBe(false)
	})
})

describe('suggestion-tree: visibleRows', () => {
	it('flat input yields one depth-0 leaf row per suggestion, in order, with no "more" rows', () => {
		const rows = rowsOf(flat())
		expect(sketch(rows)).toEqual(['A', 'B', 'C'])
		expect(rows.map((r) => r.kind === 'node' && r.path)).toEqual(['0', '1', '2'])
		expect(rows.every((r) => r.kind === 'node' && !r.hasChildren && !r.expanded)).toBe(true)
	})

	it('root matched only: root collapsed; manual expand shows all children with no "more" row', () => {
		const roots = marked(tree(), ['CH-IX'])
		expect(sketch(rowsOf(roots))).toEqual(['CH-IX [+]', 'CH-X [+]'])
		const state = toggleExpanded(emptyTreeState(), '0', false)
		expect(sketch(rowsOf(roots, true, state))).toEqual(['CH-IX [-]', '  I10 [+]', '  I20 [+]', 'CH-X [+]'])
	})

	it('child matched only: root expanded, non-matching siblings hidden behind a "more" row with the right count and depth', () => {
		const roots = marked(tree(), ['I20'])
		const rows = rowsOf(roots)
		expect(sketch(rows)).toEqual(['CH-IX [-]', '  I20 [+]', '  +1 more', 'CH-X [+]'])
		const more = rows.find((r) => r.kind === 'more')
		expect(more).toEqual({ kind: 'more', path: '0', depth: 1, count: 1 })
	})

	it('grandchild matched only: root and intermediate expanded, each pruned, "more" rows at both levels', () => {
		const roots = marked(tree(), ['T3'])
		expect(sketch(rowsOf(roots))).toEqual(['CH-IX [-]', '  I20 [-]', '    T3', '    +1 more', '  +1 more', 'CH-X [+]'])
	})

	it('root and grandchild matched: a marked ancestor does not suppress pruning', () => {
		const roots = marked(tree(), ['CH-IX', 'T3'])
		expect(sketch(rowsOf(roots))).toEqual(['CH-IX [-]', '  I20 [-]', '    T3', '    +1 more', '  +1 more', 'CH-X [+]'])
	})

	it('everything matched: fully expanded, nothing hidden', () => {
		const roots = tree() // no markers at all = all matched
		expect(sketch(rowsOf(roots))).toEqual(['CH-IX [-]', '  I10 [-]', '    T1', '    T2', '  I20 [-]', '    T3', '    T4', 'CH-X [-]', '  J45 [-]', '    T5', '    T4', '  J40'])
	})

	it('an unmatched root with no matched descendant is still rendered, collapsed', () => {
		const roots = marked(tree(), ['T5'])
		expect(sketch(rowsOf(roots))).toEqual(['CH-IX [+]', 'CH-X [-]', '  J45 [-]', '    T5', '    +1 more', '  +1 more'])
	})

	it('manual collapse of an auto-expanded node, then re-expand, reapplies pruning', () => {
		const roots = marked(tree(), ['T3'])
		const collapsed = toggleExpanded(emptyTreeState(), '0', true)
		expect(sketch(rowsOf(roots, true, collapsed))).toEqual(['CH-IX [+]', 'CH-X [+]'])
		const reopened = toggleExpanded(collapsed, '0', false)
		expect(sketch(rowsOf(roots, true, reopened))).toEqual(['CH-IX [-]', '  I20 [-]', '    T3', '    +1 more', '  +1 more', 'CH-X [+]'])
	})

	it('reveal shows hidden children collapsed; survives collapse/re-expand; forgotten by emptyTreeState', () => {
		const roots = marked(tree(), ['T3'])
		const revealed = reveal(emptyTreeState(), '0')
		expect(sketch(rowsOf(roots, true, revealed))).toEqual(['CH-IX [-]', '  I10 [+]', '  I20 [-]', '    T3', '    +1 more', 'CH-X [+]'])
		const collapsedThenReopened = toggleExpanded(toggleExpanded(revealed, '0', true), '0', false)
		expect(sketch(rowsOf(roots, true, collapsedThenReopened))).toEqual(['CH-IX [-]', '  I10 [+]', '  I20 [-]', '    T3', '    +1 more', 'CH-X [+]'])
		expect(sketch(rowsOf(roots, true, emptyTreeState()))).toEqual(['CH-IX [-]', '  I20 [-]', '    T3', '    +1 more', '  +1 more', 'CH-X [+]'])
	})

	it('reveal on the intermediate level only affects that node', () => {
		const roots = marked(tree(), ['T3'])
		const revealed = reveal(emptyTreeState(), '0/1')
		expect(sketch(rowsOf(roots, true, revealed))).toEqual(['CH-IX [-]', '  I20 [-]', '    T3', '    T4', '  +1 more', 'CH-X [+]'])
	})

	it('expanding a revealed unmatched node shows its full child list: nothing beneath it matched, so nothing is pruned', () => {
		const roots = marked(tree(), ['T3'])
		const state = toggleExpanded(reveal(emptyTreeState(), '0'), '0/0', false)
		expect(sketch(rowsOf(roots, true, state))).toEqual(['CH-IX [-]', '  I10 [-]', '    T1', '    T2', '  I20 [-]', '    T3', '    +1 more', 'CH-X [+]'])
	})

	it('without search terms markers are ignored: roots collapsed, no "more" rows, toggling shows every child', () => {
		const roots = marked(tree(), ['T3'])
		expect(sketch(rowsOf(roots, false))).toEqual(['CH-IX [+]', 'CH-X [+]'])
		const state = toggleExpanded(toggleExpanded(emptyTreeState(), '0', false), '0/0', false)
		expect(sketch(rowsOf(roots, false, state))).toEqual(['CH-IX [-]', '  I10 [-]', '    T1', '    T2', '  I20 [+]', 'CH-X [+]'])
	})

	it('paths use the index in the full children list, so pruned siblings do not shift them', () => {
		const roots = marked(tree(), ['T4'])
		const rows = rowsOf(roots)
		const t4 = rows.filter((r) => r.kind === 'node' && r.suggestion.id === 'T4')
		expect(t4.map((r) => r.kind === 'node' && r.path)).toEqual(['0/1/1', '1/0/1'])
	})

	it('toggleExpanded and reveal are immutable', () => {
		const state = emptyTreeState()
		const next = toggleExpanded(state, '0', false)
		const revealed = reveal(next, '0')
		expect(state).toEqual(emptyTreeState())
		expect(next.revealed).toEqual({})
		expect(revealed.expanded).toEqual({ '0': true })
	})
})

describe('suggestion-tree: paths', () => {
	it('nodeAtPath resolves the right instance of a duplicated id', () => {
		const roots = tree()
		expect(nodeAtPath(roots, '0/1/1')).toBe(child(child(roots[0], 1), 1))
		expect(nodeAtPath(roots, '1/0/1')).toBe(child(child(roots[1], 0), 1))
		expect(nodeAtPath(roots, '0/1/1')?.id).toBe('T4')
		expect(nodeAtPath(roots, '1/0/1')?.id).toBe('T4')
	})

	it('nodeAtPath returns undefined for paths that do not exist', () => {
		const roots = tree()
		expect(nodeAtPath(roots, '')).toBeUndefined()
		expect(nodeAtPath(roots, '5')).toBeUndefined()
		expect(nodeAtPath(roots, '1/1/0')).toBeUndefined()
	})

	it('parentPath strips the last segment and is undefined at the root', () => {
		expect(parentPath('0/1/1')).toBe('0/1')
		expect(parentPath('0/1')).toBe('0')
		expect(parentPath('0')).toBeUndefined()
	})
})

describe('suggestion-tree: replacementTerms', () => {
	it('uses the node’s own terms when it has any', () => {
		expect(replacementTerms(term('x', 'x', ['own']), ['query'])).toEqual(['own'])
	})

	it('an unmatched parent takes the first matched descendant’s terms, depth-first', () => {
		const roots = marked(tree(), ['T3'])
		expect(replacementTerms(roots[0], ['query'])).toEqual(['angine'])
		expect(replacementTerms(child(roots[0], 1), ['query'])).toEqual(['angine'])
	})

	it('skips unmatched descendants even when they carry terms', () => {
		const roots = marked(tree(), ['T2'])
		expect(replacementTerms(roots[0], ['query'])).toEqual(['tension'])
	})

	it('falls back to the query terms when nothing in the subtree has terms', () => {
		expect(replacementTerms(node('p', 'p', [term('c', 'c')]), ['query', 'terms'])).toEqual(['query', 'terms'])
		expect(replacementTerms(term('leaf', 'leaf'), ['query'])).toEqual(['query'])
	})
})
