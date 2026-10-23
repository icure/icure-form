import { PrimitiveType } from '../components/model'

/**
 * Which other language a field shows when its value has no content in the current language, nor under the `'*'`
 * wildcard (which matches every language, so it is always read). `false`: none (the field looks empty). `'*'`: any
 * language. Any other string: that language only.
 */
export type LanguageFallback = false | string

/**
 * Normalises the `languageFallback` attribute of `<icure-form>`: `false`/`'false'`/absent → `false`,
 * `true`/`'true'`/`''` (bare attribute) → `'*'`, anything else is a language iso code (or `'*'`).
 */
export const parseLanguageFallback = (value?: string | boolean | null): LanguageFallback =>
	value === undefined || value === null || value === false || value === 'false' ? false : value === true || value === 'true' || value === '' ? '*' : value

/**
 * The content to display for `language`: its own content, else the `'*'` wildcard's. Past those, text (`string`)
 * content only falls back to another language as configured by `fallback`, because showing it means showing another
 * language. Every other type (numbers, measures, dates, booleans, compounds of codes) reads the same in any language,
 * so it always falls back to any language.
 */
export const contentForLanguage = (content: { [lng: string]: PrimitiveType } | undefined, language: string, fallback: LanguageFallback = false): PrimitiveType | undefined => {
	if (!content) return undefined
	const own = content[language] ?? content['*']
	if (own !== undefined) return own
	const allLanguages = Object.keys(content)
	const configured = fallback === false ? [] : fallback === '*' ? allLanguages : [fallback]
	return configured.map((lng) => content[lng]).find((c) => c !== undefined) ?? allLanguages.map((lng) => content[lng]).find((c) => c !== undefined && c.type !== 'string')
}

/**
 * The `content` key a field reads and writes: the language picked in the field's metadata bar while translating, else
 * the form's `contentLanguage`, else the form's language. `'*'` is a valid key: content shared by every language.
 */
export const contentKeyOf = (selectedLanguage: string | undefined, contentLanguage: string | undefined, defaultLanguage: string | undefined): string =>
	selectedLanguage ?? contentLanguage ?? defaultLanguage ?? 'en'

/**
 * The language in which a code's insertion or label is resolved into text stored under `contentKey`: that key when it
 * is a language, the UI language when it is the `'*'` wildcard (which names no language to resolve in).
 */
export const textLanguageOf = (contentKey: string, uiLanguage: string): string => (contentKey === '*' ? uiLanguage : contentKey)
