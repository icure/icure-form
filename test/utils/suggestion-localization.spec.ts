import { Suggestion } from '../../src/generic'
import { localized, suggestionInsertion, suggestionLabel } from '../../src/utils/suggestions'

// Every case below keeps the label and the insertion distinct: they were the same string everywhere before the split,
// so an assertion that does not differentiate them proves nothing about it.
const sug = (extra: Partial<Suggestion> = {}): Suggestion => ({ id: 'ICD|I20.9|10', terms: [], label: {}, ...extra })

describe('localized', () => {
	it('resolves the exact language', () => {
		expect(localized({ fr: 'Angine', en: 'Angina' }, 'fr')).toBe('Angine')
	})

	it("serves a language with no key from the '*' wildcard", () => {
		expect(localized({ '*': 'I20.9' }, 'nl')).toBe('I20.9')
	})

	it("prefers the exact language over the '*' wildcard", () => {
		expect(localized({ fr: 'Angine', '*': 'Angina' }, 'fr')).toBe('Angine')
	})

	it('is undefined when neither the language nor the wildcard is present', () => {
		expect(localized({ fr: 'Angine' }, 'nl')).toBeUndefined()
		expect(localized({}, 'fr')).toBeUndefined()
		expect(localized(undefined, 'fr')).toBeUndefined()
	})
})

describe('suggestionLabel', () => {
	it('reads the label for the language', () => {
		expect(suggestionLabel(sug({ label: { fr: 'Angine', en: 'Angina' } }), 'fr')).toBe('Angine')
	})

	it("falls back to the label's wildcard", () => {
		expect(suggestionLabel(sug({ label: { '*': 'Angina' } }), 'nl')).toBe('Angina')
	})

	it('falls back to the deprecated text when the label holds nothing', () => {
		expect(suggestionLabel(sug({ text: 'Angina' }), 'fr')).toBe('Angina')
	})

	it('falls back to a label in another language rather than showing an empty row', () => {
		expect(suggestionLabel(sug({ label: { fr: 'Angine' } }), 'nl')).toBe('Angine')
	})

	it('falls back to the id when there is nothing else', () => {
		expect(suggestionLabel(sug(), 'fr')).toBe('ICD|I20.9|10')
	})

	it('never reads the insertion', () => {
		expect(suggestionLabel(sug({ label: { fr: 'Angine' }, insertion: { fr: 'I20.9' } }), 'fr')).toBe('Angine')
	})
})

describe('suggestionInsertion', () => {
	it('reads the insertion for the language', () => {
		expect(suggestionInsertion(sug({ label: { fr: 'Angine' }, insertion: { fr: 'I20.9 Angine' } }), 'fr')).toBe('I20.9 Angine')
	})

	it("falls back to the insertion's wildcard", () => {
		expect(suggestionInsertion(sug({ label: { fr: 'Angine' }, insertion: { '*': 'I20.9' } }), 'fr')).toBe('I20.9')
	})

	it('falls back to the deprecated text', () => {
		expect(suggestionInsertion(sug({ text: 'Angina' }), 'fr')).toBe('Angina')
	})

	it('falls back to the label for the same language, wildcard included', () => {
		expect(suggestionInsertion(sug({ label: { fr: 'Angine' } }), 'fr')).toBe('Angine')
		expect(suggestionInsertion(sug({ label: { '*': 'I20.9' } }), 'nl')).toBe('I20.9')
	})

	it('is undefined rather than a label in another language: the result is written into the record', () => {
		expect(suggestionInsertion(sug({ label: { fr: 'Angine' } }), 'nl')).toBeUndefined()
		expect(suggestionInsertion(sug(), 'fr')).toBeUndefined()
	})

	it('resolves each language independently of the other', () => {
		const s = sug({ label: { fr: 'Angine', nl: 'Angina pectoris' }, insertion: { fr: 'I20.9 Angine', nl: 'I20.9' } })
		expect([suggestionLabel(s, 'fr'), suggestionInsertion(s, 'fr')]).toEqual(['Angine', 'I20.9 Angine'])
		expect([suggestionLabel(s, 'nl'), suggestionInsertion(s, 'nl')]).toEqual(['Angina pectoris', 'I20.9'])
	})
})
