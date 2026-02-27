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
		return {
			id: optionKey,
			label: { [language]: translationProvider ? translationProvider(language, text) : text },
		}
	})

export const sortCodes = (codes: Code[], language: string, sortOptions?: SortOptions) =>
	sortOptions?.sort && sortOptions?.sort !== 'natural'
		? codes.sort(defaultCodesComparator(language, sortOptions?.sort === 'asc', sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))
		: codes.sort(naturalCodesComparator(sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))

export const sortSuggestions = (codes: (Code | Suggestion)[], language: string, sortOptions?: SortOptions): Suggestion[] =>
	(sortOptions?.sort && sortOptions?.sort !== 'natural'
		? codes.sort(defaultCodesComparator(language, sortOptions?.sort === 'asc', sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))
		: codes.sort(naturalCodesComparator(sortOptions?.promotions ? makePromoter(sortOptions.promotions.split(/ ?, ?/)) : defaultCodePromoter))
	).map((c) => ({ id: c.id, label: c.label ?? { [language]: c.id }, text: c.label?.[language] ?? c.id, terms: [] }))

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
