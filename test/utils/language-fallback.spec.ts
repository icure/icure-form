import { PrimitiveType } from '../../src/components/model'
import { contentForLanguage, parseLanguageFallback } from '../../src/utils/language-fallback'

const str = (value: string): PrimitiveType => ({ type: 'string', value })
const num = (value: number): PrimitiveType => ({ type: 'number', value })

describe('parseLanguageFallback', () => {
	it('reads absent and false as no fallback', () => {
		expect(parseLanguageFallback(undefined)).toBe(false)
		expect(parseLanguageFallback(null)).toBe(false)
		expect(parseLanguageFallback(false)).toBe(false)
		expect(parseLanguageFallback('false')).toBe(false)
	})

	it("reads true and a bare attribute as '*'", () => {
		expect(parseLanguageFallback(true)).toBe('*')
		expect(parseLanguageFallback('true')).toBe('*')
		expect(parseLanguageFallback('')).toBe('*')
		expect(parseLanguageFallback('*')).toBe('*')
	})

	it('keeps a language iso code', () => {
		expect(parseLanguageFallback('fr')).toBe('fr')
	})
})

describe('contentForLanguage', () => {
	it('prefers the current language whatever the fallback', () => {
		expect(contentForLanguage({ fr: str('Bonjour'), nl: str('Hallo') }, 'nl', '*')).toEqual(str('Hallo'))
	})

	it('shows no text in another language when the fallback is off', () => {
		expect(contentForLanguage({ fr: str('Bonjour') }, 'nl', false)).toBeUndefined()
	})

	it("always reads the '*' wildcard, which matches every language, after the exact language", () => {
		expect(contentForLanguage({ '*': str('Dr Smith') }, 'nl', false)).toEqual(str('Dr Smith'))
		expect(contentForLanguage({ fr: str('Bonjour'), '*': str('Hi') }, 'nl', 'fr')).toEqual(str('Hi'))
		expect(contentForLanguage({ nl: str('Hallo'), '*': str('Hi') }, 'nl', false)).toEqual(str('Hallo'))
	})

	it("falls back to any language when the fallback is '*'", () => {
		expect(contentForLanguage({ fr: str('Bonjour') }, 'nl', '*')).toEqual(str('Bonjour'))
	})

	it('falls back to the configured language and nothing else', () => {
		expect(contentForLanguage({ en: str('Hello'), fr: str('Bonjour') }, 'nl', 'fr')).toEqual(str('Bonjour'))
		expect(contentForLanguage({ en: str('Hello') }, 'nl', 'fr')).toBeUndefined()
	})

	it('always falls back for language-neutral content', () => {
		expect(contentForLanguage({ fr: num(42) }, 'nl', false)).toEqual(num(42))
		expect(contentForLanguage({ fr: { type: 'datetime', value: 20261021 } }, 'nl', 'en')).toEqual({ type: 'datetime', value: 20261021 })
	})

	it('handles missing content', () => {
		expect(contentForLanguage(undefined, 'nl', '*')).toBeUndefined()
	})
})
