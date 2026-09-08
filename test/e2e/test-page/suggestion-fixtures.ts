import { Suggestion } from '../../../src/generic'

// Deterministic suggestion trees for the e2e harness. Ids are `type|code|version` because the iCure bridge normalises
// stored codes from their id and rejects any other shape.
//
// The fixture provider marks a node `matched` when a query term is a case-insensitive substring of its text. That is a
// fixture convenience standing in for a host's search index: the library itself never matches labels (constraint 1 of
// plans/hierarchical-suggestions.md), so nothing like this may appear under src/.

const node = (code: string, text: string, children?: Suggestion[]): Suggestion => ({
	id: `FIXTURE|${code}|1`,
	code,
	text,
	terms: [],
	label: { en: text },
	...(children ? { children } : {}),
})

export const fixtureTrees: Record<string, () => Suggestion[]> = {
	flat: () => [node('A', 'Alpha'), node('B', 'Bravo'), node('C', 'Charlie')],
	// Two chapters → codes → terms. `T4` (Chest pain) deliberately appears under I20 and J45.
	'icd-mini': () => [
		node('CH-IX', 'Chapter IX — Circulatory', [
			node('I10', 'I10', [node('T1', 'Essential hypertension'), node('T2', 'High blood pressure')]),
			node('I20', 'I20', [node('T3', 'Angina pectoris'), node('T4', 'Chest pain'), node('T5', 'Stable angina')]),
			node('I50', 'I50', [node('T6', 'Heart failure'), node('T7', 'Cardiac decompensation')]),
		]),
		node('CH-X', 'Chapter X — Respiratory', [
			node('J45', 'J45', [node('T8', 'Asthma'), node('T9', 'Allergic asthma'), node('T4', 'Chest pain')]),
			node('J40', 'J40', [node('T10', 'Bronchitis'), node('T11', 'Chest cold')]),
		]),
	],
}

/**
 * A provider over a named fixture tree. With no terms it returns the whole tree unmarked. With terms it keeps the roots
 * whose subtree holds a match and marks every node of those roots, so unmatched siblings are present (and hidden by the
 * surfaces behind "N more"). Matched nodes carry the query terms, as the palette expects.
 */
export const fixtureProvider =
	(name: string) =>
	async (terms: string[] = []): Promise<Suggestion[]> => {
		const roots = fixtureTrees[name]?.() ?? []
		if (!terms.length) return roots
		const needles = terms.map((t) => t.toLowerCase())
		const matches = (s: Suggestion) => needles.some((n) => s.text.toLowerCase().includes(n))
		const anyMatch = (s: Suggestion): boolean => matches(s) || (s.children ?? []).some(anyMatch)
		const mark = (s: Suggestion): Suggestion => ({
			...s,
			matched: matches(s),
			terms: matches(s) ? terms : [],
			...(s.children ? { children: s.children.map(mark) } : {}),
		})
		return roots.filter(anyMatch).map(mark)
	}
