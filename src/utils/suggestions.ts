/**
 * Language resolution for the localized maps carried by a `Suggestion`.
 *
 * Two roles, two maps: `label` is what the user reads while searching, `insertion` is what replaces the matched terms
 * (or what a dropdown stores). Both accept the wildcard key `'*'`, which matches any language — the home for content
 * that is language-neutral (a person's name, an ICD code number) and need not be repeated per language.
 */

/**
 * What these resolvers read. Wider than `Suggestion` on purpose, so a stored `Code` — which carries a `label` but no
 * `terms` — can be resolved with the same rules the surface used when it proposed the suggestion.
 */
export type LocalizedItem = { id?: string; label?: { [lng: string]: string }; insertion?: { [lng: string]: string }; text?: string }

/** `map[language]`, else the `'*'` wildcard. Callers own their own last-resort fallback. */
export const localized = (map: { [lng: string]: string } | undefined, language: string): string | undefined => map?.[language] ?? map?.['*']

/**
 * What the user reads. Falls back through the wildcard, the deprecated `text`, any label, then the id: a row showing a
 * label in another language beats an empty row, and this is what keeps a provider that only fills one language visible.
 */
export const suggestionLabel = (s: LocalizedItem, language: string): string => localized(s.label, language) ?? s.text ?? Object.values(s.label ?? {})[0] ?? s.id ?? ''

/**
 * What replaces the matched terms. Deliberately stricter than `suggestionLabel`: it stops at the label resolved for
 * this language and never falls back to an arbitrary other one, because the result is written into the record. When
 * nothing resolves the caller inserts (or stores) nothing, as it already does when a provider yields no suggestion.
 */
export const suggestionInsertion = (s: LocalizedItem, language: string): string | undefined => localized(s.insertion, language) ?? s.text ?? localized(s.label, language)
