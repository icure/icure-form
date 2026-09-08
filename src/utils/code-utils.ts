import { Code, Field, SortOptions } from '../components/model'
import { defaultCodePromoter, defaultCodesComparator, makePromoter, naturalCodesComparator } from '../components/common/utils'
import { Suggestion } from '../generic'
import { CodeStub } from '@icure/cardinal-sdk'

/**
 * Maps the options defined in a field into a list of codes
 *
 * @param language
 * @param field
 * @param translationProvider
 */
export const optionMapper = (language: string, field: Field, translationProvider?: (language: string, text: string) => string): Code[] =>
	Object.keys(field?.options ?? []).map((optionKey) => {
		const text: string = (field?.options?.[optionKey] as string) ?? ''
		// `normalizeCode` only accepts ids shaped as `type|code|version`. Bare keys
		// like `yes` or `locked` would otherwise crash deep inside the bridge when
		// the user clicks the option. Auto-qualify them, scoped per field, so
		// authoring `options: { locked: 'Yes' }` simply works.
		const qualifiedId = optionKey.includes('|') ? optionKey : `${field.field}|${optionKey}|1`
		return {
			id: qualifiedId,
			label: { [language]: translationProvider ? translationProvider(language, text) : text },
		}
	})

export const sortCodes = (codes: Code[], language: string, sortOptions?: SortOptions) =>
	sortOptions?.sort && sortOptions?.sort !== 'natural'
		? codes.sort(defaultCodesComparator(language, sortOptions?.sort === 'asc', sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))
		: codes.sort(naturalCodesComparator(sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))

/**
 * Sorts a provider result with the field's sort options and normalises every entry to a `Suggestion`.
 *
 * Hierarchical results are sorted per sibling group: each node's `children` are sorted recursively with the same options,
 * so a promotion applies within its own group only. `code`, `terms`, `matched` and `children` survive the mapping; a flat
 * `Code` input yields the same shape as before (`{ id, label, text, terms: [] }`).
 */
export const sortSuggestions = (codes: (Code | Suggestion)[], language: string, sortOptions?: SortOptions): Suggestion[] => {
	const promoter = sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter
	const comparator = sortOptions?.sort && sortOptions?.sort !== 'natural' ? defaultCodesComparator(language, sortOptions?.sort === 'asc', promoter) : naturalCodesComparator(promoter)
	return codes.sort(comparator).map((c) => {
		const s = c as Partial<Suggestion>
		const label = c.label ?? { [language]: c.id }
		return {
			id: c.id,
			label,
			text: label[language] ?? c.id,
			terms: s.terms ?? [],
			...(c.code !== undefined ? { code: c.code } : {}),
			...(s.matched !== undefined ? { matched: s.matched } : {}),
			...(s.children ? { children: sortSuggestions(s.children, language, sortOptions) } : {}),
		}
	})
}

export const filterAndSortOptionsFromFieldDefinition = (language: string, fg: Field, translationProvider: ((language: string, text: string) => string) | undefined, terms?: string[]) =>
	Promise.resolve(
		sortCodes(
			optionMapper(language, fg, translationProvider).filter((x) => (terms ?? []).map((st) => st.toLowerCase()).every((st) => (x.label?.[language] ?? x.id).toLowerCase().includes(st))),
			language,
			fg.sortOptions,
		),
	)

export const normalizeCodes = (codes: CodeStub[]): CodeStub[] => codes.map((c) => normalizeCode(c))

/**
 * Normalizes the code's four main fields (type, code, version and id). The first three are considered to be
 * authoritative, while the id is a pure function of them. The authoritative fields are filled in from the id if
 * missing, or the version is set to '1' if it is the only missing authoritative field. The id is then rederived from
 * the three fields.
 * @param code The code to normalize.
 * @returns A shallow copy of the input with its type, code, version and id normalized.
 */
export function normalizeCode(code: CodeStub): CodeStub {
	code = new CodeStub(code)

	if (code.type && code.code && code.version) {
		// do nothing, we all have the authoritative fields we need
	} else if (code.id) {
		// reconstruct the authoritative fields from the id
		const [idType, idCode, idVersion, ...idRest] = code.id.split('|')
		if (idType && idCode && idVersion && idRest.length === 0) {
			if (!code.type) code.type = idType
			if (!code.code) code.code = idCode
			if (!code.version) code.version = idVersion
		} else {
			throw new Error(`attempted to normalize from a malformed code id "${code.id}"`)
		}
	} else if (code.type && code.code && !code.version) {
		// we can provide a default value
		code.version = '1'
	} else {
		throw new Error('could not reconstruct the code')
	}

	// Recompute the id to ensure that it matches the reconstructed code.
	code.id = `${code.type}|${code.code}|${code.version}`

	return code
}
