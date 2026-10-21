import { PrimitiveType } from '../components/model'

/**
 * Which language a field shows when its value has no content in the current language.
 * `false`: none (the field looks empty). `'*'`: any language, the `'*'` wildcard first. Any other string: that language,
 * then the `'*'` wildcard.
 */
export type LanguageFallback = false | string

/**
 * Normalises the `languageFallback` attribute of `<icure-form>`: `false`/`'false'`/absent → `false`,
 * `true`/`'true'`/`''` (bare attribute) → `'*'`, anything else is a language iso code (or `'*'`).
 */
export const parseLanguageFallback = (value?: string | boolean | null): LanguageFallback =>
	value === undefined || value === null || value === false || value === 'false' ? false : value === true || value === 'true' || value === '' ? '*' : value

/**
 * The content to display for `language`. Text (`string`) content only falls back as configured by `fallback`, because
 * showing it means showing another language. Every other type (numbers, measures, dates, booleans, compounds of codes)
 * reads the same in any language, so it always falls back to the `'*'` wildcard, then to any language.
 */
export const contentForLanguage = (content: { [lng: string]: PrimitiveType } | undefined, language: string, fallback: LanguageFallback = false): PrimitiveType | undefined => {
	if (!content) return undefined
	if (content[language] !== undefined) return content[language]
	const allLanguages = ['*', ...Object.keys(content)]
	const configured = fallback === false ? [] : fallback === '*' ? allLanguages : [fallback, '*']
	return configured.map((lng) => content[lng]).find((c) => c !== undefined) ?? allLanguages.map((lng) => content[lng]).find((c) => c !== undefined && c.type !== 'string')
}
