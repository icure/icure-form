import { Code, Field, SortOptions } from '../components/model'
import { defaultCodePromoter, defaultCodesComparator, makePromoter, naturalCodesComparator } from '../components/common/utils'
import { Suggestion } from '../generic'
import { CodeStub, normalizeCode } from '@icure/api'

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
	).map((c) => ({ id: c.id, label: c.label, text: c.label[language] ?? '', terms: [] }))

export const filterAndSortOptionsFromFieldDefinition = (
	language: string,
	fg: Field,
	translationProvider: ((language: string, text: string) => string) | undefined,
	terms?: string[],
) =>
	Promise.resolve(
		sortCodes(
			optionMapper(language, fg, translationProvider).filter((x) => (terms ?? []).map((st) => st.toLowerCase()).every((st) => x.label[language].toLowerCase().includes(st))),
			language,
			fg.sortOptions,
		),
	)

export const normalizeCodes = (codes: CodeStub[]): CodeStub[] => codes.map((c) => normalizeCode(c))
