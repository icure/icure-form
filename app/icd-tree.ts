import { Suggestion } from '../src/generic'

// Demo-only: turns the BE-THESAURUS terms and their ICD links into a chapter → ICD code → term tree for the
// hierarchical-suggestions sample. The demo holds no labelled ICD categories, so codes are labelled by their number.

type ThesaurusEntry = { id: string; code?: string; label?: { [lng: string]: string }; links?: string[] }

/** A Suggestion that keeps the thesaurus term's links, which the demo's linksProvider turns into code links. */
export type IcdSuggestion = Suggestion & { links?: string[] }

export const normaliseTerm = (term: string): string => term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The demo's `icd10` table: `[numeral, regexp]` rows, typed as a plain array in app/codes.ts. */
type ChapterTable = (string | RegExp)[][]

/** ICD-10 chapter numeral of a code, from the demo's regex table; 'XXII' when none matches. */
export const icdChapter = (code: string, icd10: ChapterTable): string => `${(icd10.find((row) => code.match(row[1])) || [])[0] ?? 'XXII'}`

const chapterLabel = (numeral: string) => ({ fr: `Chapitre ${numeral}`, nl: `Hoofdstuk ${numeral}`, en: `Chapter ${numeral}` })

const byText = (a: Suggestion, b: Suggestion) => a.text.localeCompare(b.text)

export const buildIcdTree = (entries: ThesaurusEntry[], icd10: ChapterTable): IcdSuggestion[] => {
	// numeral → code → terms
	const chapters = new Map<string, Map<string, IcdSuggestion[]>>()
	entries.forEach((entry) => {
		;(entry.links ?? [])
			.filter((link) => link.startsWith('ICD|'))
			.forEach((link) => {
				const code = link.split('|')[1]
				if (!code) return
				const numeral = icdChapter(code, icd10)
				const byCode = chapters.get(numeral) ?? new Map<string, IcdSuggestion[]>()
				chapters.set(numeral, byCode)
				const terms = byCode.get(code) ?? []
				byCode.set(code, terms)
				if (!terms.some((t) => t.id === entry.id)) {
					const fr = entry.label?.fr ?? entry.code ?? entry.id
					terms.push({
						id: entry.id,
						code: entry.code,
						text: fr,
						terms: [],
						label: { fr, nl: entry.label?.nl ?? fr, en: entry.label?.en ?? fr },
						links: entry.links,
					})
				}
			})
	})
	const chapterOrder = (numeral: string) => {
		const idx = icd10.findIndex((row) => row[0] === numeral)
		return idx < 0 ? icd10.length : idx
	}
	return Array.from(chapters.entries())
		.sort(([a], [b]) => chapterOrder(a) - chapterOrder(b))
		.map(([numeral, byCode]) => ({
			id: `ICD-CHAPTER|${numeral}|1`,
			code: numeral,
			text: `Chapitre ${numeral}`,
			terms: [],
			label: chapterLabel(numeral),
			children: Array.from(byCode.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([code, terms]) => ({
					id: `ICD|${code}|10`,
					code,
					text: code,
					terms: [],
					label: { fr: code, nl: code, en: code },
					children: terms.sort(byText),
				})),
		}))
}

/**
 * A marked copy of the tree for a query. Terms are matched when their id is among `hitIds` (the MiniSearch hits for the
 * same query), codes when a normalised query term is a prefix of the code number, chapters never. Roots without a match
 * in their subtree are dropped; kept nodes carry their full child list so the surfaces can hide the unmatched siblings
 * behind "N more". With no terms the tree is returned unmarked.
 */
export const markIcdTree = (tree: IcdSuggestion[], terms: string[], hitIds: Set<string>): IcdSuggestion[] => {
	if (!terms.length) return tree
	const needles = terms.map(normaliseTerm)
	const codeMatches = (code: string) => needles.some((n) => code.toLowerCase().startsWith(n))
	const mark = (s: IcdSuggestion, depth: number): IcdSuggestion => {
		const matched = depth === 2 ? hitIds.has(s.id) : depth === 1 ? codeMatches(s.code ?? '') : false
		return {
			...s,
			matched,
			terms: matched ? terms : [],
			...(s.children ? { children: s.children.map((c) => mark(c, depth + 1)) } : {}),
		}
	}
	const anyMatch = (s: IcdSuggestion): boolean => s.matched === true || (s.children ?? []).some((c) => anyMatch(c))
	return tree.map((root) => mark(root, 0)).filter(anyMatch)
}
