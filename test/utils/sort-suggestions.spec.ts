import { Code } from '../../src/components/model'
import { Suggestion } from '../../src/generic'
import { sortSuggestions } from '../../src/utils/code-utils'

const leaf = (id: string, en: string, extra: Partial<Suggestion> = {}): Suggestion => ({ id, text: en, terms: [], label: { en }, ...extra })
const branch = (id: string, en: string, children: Suggestion[], extra: Partial<Suggestion> = {}): Suggestion => ({ id, text: en, terms: [], label: { en }, children, ...extra })

// Deliberately unsorted at every level. `T2` sits inside a child group; a root is also called `T2-root` to prove promotion is per group.
const tree = (): Suggestion[] => [
	branch('CH-B', 'Bravo', [
		branch('I20', 'Kilo', [leaf('T3', 'Zulu', { terms: ['zulu'], matched: true }), leaf('T4', 'Alpha', { terms: ['alpha'], matched: false })], { code: 'I20', matched: false }),
		branch('I10', 'Delta', [leaf('T1', 'Yankee'), leaf('T2', 'Mike')], { code: 'I10' }),
	]),
	branch('CH-A', 'Alpha', [leaf('J45', 'Charlie'), leaf('J40', 'Bravo')]),
	leaf('T2-root', 'Mike'),
]

const ids = (s: Suggestion[]): string[] => s.map((x) => x.id)
const childIds = (s: Suggestion[], id: string): string[] => ids(s.find((x) => x.id === id)?.children ?? [])

describe('sortSuggestions: flat input (regression)', () => {
	it('a flat Code input yields exactly the shape produced before hierarchy existed', () => {
		const codes: Code[] = [
			{ id: 'b', label: { en: 'Bee' } },
			{ id: 'a', label: { en: 'Ay' } },
		]
		expect(sortSuggestions(codes, 'en', { sort: 'asc' })).toStrictEqual([
			{ id: 'a', label: { en: 'Ay' }, text: 'Ay', terms: [] },
			{ id: 'b', label: { en: 'Bee' }, text: 'Bee', terms: [] },
		])
	})

	it('label defaults to { [language]: id } and text to the id when no label is given', () => {
		expect(sortSuggestions([{ id: 'x' }], 'fr')).toStrictEqual([{ id: 'x', label: { fr: 'x' }, text: 'x', terms: [] }])
	})

	it('text follows the label in the requested language, as before', () => {
		expect(sortSuggestions([leaf('x', 'Ex')], 'en')[0].text).toBe('Ex')
		expect(sortSuggestions([leaf('x', 'Ex')], 'fr')[0].text).toBe('x')
	})

	it('natural sort keeps input order', () => {
		const codes: Code[] = [
			{ id: 'b', label: { en: 'Bee' } },
			{ id: 'a', label: { en: 'Ay' } },
		]
		expect(ids(sortSuggestions(codes, 'en'))).toEqual(['b', 'a'])
		expect(ids(sortSuggestions(codes, 'en', { sort: 'natural' }))).toEqual(['b', 'a'])
	})
})

describe('sortSuggestions: hierarchical input', () => {
	it('preserves children at every level, sorted with the same options', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'asc' })
		expect(ids(out)).toEqual(['CH-A', 'CH-B', 'T2-root'])
		expect(childIds(out, 'CH-A')).toEqual(['J40', 'J45'])
		expect(childIds(out, 'CH-B')).toEqual(['I10', 'I20'])
		const chB = out.find((x) => x.id === 'CH-B')
		expect(childIds(chB?.children ?? [], 'I20')).toEqual(['T4', 'T3'])
		expect(childIds(chB?.children ?? [], 'I10')).toEqual(['T2', 'T1'])
	})

	it('desc sorts every sibling group in reverse', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'desc' })
		expect(ids(out)).toEqual(['T2-root', 'CH-B', 'CH-A'])
		expect(childIds(out, 'CH-B')).toEqual(['I20', 'I10'])
		const chB = out.find((x) => x.id === 'CH-B')
		expect(childIds(chB?.children ?? [], 'I20')).toEqual(['T3', 'T4'])
	})

	it('natural keeps input order at every level', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'natural' })
		expect(ids(out)).toEqual(['CH-B', 'CH-A', 'T2-root'])
		expect(childIds(out, 'CH-B')).toEqual(['I20', 'I10'])
		const chB = out.find((x) => x.id === 'CH-B')
		expect(childIds(chB?.children ?? [], 'I10')).toEqual(['T1', 'T2'])
	})

	it('preserves matched, code and terms on every node', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'asc' })
		const chB = out.find((x) => x.id === 'CH-B')
		const i20 = chB?.children?.find((x) => x.id === 'I20')
		expect(chB?.matched).toBeUndefined()
		expect(i20?.matched).toBe(false)
		expect(i20?.code).toBe('I20')
		const t3 = i20?.children?.find((x) => x.id === 'T3')
		const t4 = i20?.children?.find((x) => x.id === 'T4')
		expect(t3).toStrictEqual({ id: 'T3', label: { en: 'Zulu' }, text: 'Zulu', terms: ['zulu'], matched: true })
		expect(t4).toStrictEqual({ id: 'T4', label: { en: 'Alpha' }, text: 'Alpha', terms: ['alpha'], matched: false })
	})

	it('does not invent children, matched or code on nodes that had none', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'asc' })
		const chA = out.find((x) => x.id === 'CH-A')
		expect(chA?.children?.find((x) => x.id === 'J40')).toStrictEqual({ id: 'J40', label: { en: 'Bravo' }, text: 'Bravo', terms: [] })
		expect(out.find((x) => x.id === 'T2-root')).toStrictEqual({ id: 'T2-root', label: { en: 'Mike' }, text: 'Mike', terms: [] })
	})

	it('a promotion applies within its own sibling group only', () => {
		// Without promotion I10's children sort Mike (T2) < Yankee (T1); promoting T1 flips them. Roots and I20 are untouched.
		const out = sortSuggestions(tree(), 'en', { sort: 'asc', promotions: 'T1,*' })
		expect(ids(out)).toEqual(['CH-A', 'CH-B', 'T2-root'])
		const chB = out.find((x) => x.id === 'CH-B')
		expect(childIds(chB?.children ?? [], 'I10')).toEqual(['T1', 'T2'])
		expect(childIds(chB?.children ?? [], 'I20')).toEqual(['T4', 'T3'])
	})

	it('a promoted root id moves to the top of the roots without touching child groups', () => {
		const out = sortSuggestions(tree(), 'en', { sort: 'asc', promotions: 'T2-root,*' })
		expect(ids(out)).toEqual(['T2-root', 'CH-A', 'CH-B'])
		const chB = out.find((x) => x.id === 'CH-B')
		expect(childIds(chB?.children ?? [], 'I10')).toEqual(['T2', 'T1'])
	})
})
