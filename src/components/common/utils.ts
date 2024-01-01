import { html, TemplateResult } from 'lit'
import { Code, Field, Labels } from '../model'

export const getLabels = (field: Field): Labels => field.labels ?? (field.shortLabel ? { float: field.shortLabel } : { float: field.label() })

export function generateLabels(labels: Labels, language: string, translationProvider?: (language: string, text: string) => string): TemplateResult[] {
	return Object.keys(labels).map((position) => generateLabel(labels[position], position, language, translationProvider))
}

export function generateLabel(
	label: string,
	labelPosition: string,
	language: string,
	translationProvider: (language: string, text: string) => string = (language: string, text) => text,
): TemplateResult {
	switch (labelPosition) {
		case 'right':
		case 'left':
			return html` <label class="icure-label side above ${labelPosition}">${translationProvider(language, label)}</icure-label> `
		default:
			return html` <label class="icure-label ${labelPosition}">${translationProvider(language, label)}</icure-label> `
	}
}

export const defaulCodePromoter = (code: Code): number =>
	code?.label?.en?.toLowerCase() === 'other' ? 2 : code?.label?.en?.toLowerCase() === 'none' ? 1 : code?.label?.en?.toLowerCase() === 'empty' ? -1 : 0

export const defaultCodesComparator =
	(language = 'en', ascending = true, codePromoter: (c: Code) => number = defaulCodePromoter) =>
	(a: Code, b: Code): number => {
		const aPromoted = codePromoter(a)
		const bPromoted = codePromoter(b)
		if (aPromoted !== bPromoted) {
			return (aPromoted - bPromoted) * (ascending ? 1 : -1)
		}
		return (a?.label?.[language] || '').localeCompare(b?.label?.[language] || '') * (ascending ? 1 : -1)
	}

export const translateCodes = (
	codes: Code[],
	sourceLanguage: string,
	destinationLanguage: string,
	translationProvider: (text: string, language?: string) => string,
	codesComparator?: (a: Code, b: Code) => number,
): Code[] =>
	codes
		?.map((code) =>
			code?.label?.[sourceLanguage]
				? {
						...code,
						label: { ...code.label, [destinationLanguage]: translationProvider(code.label[sourceLanguage], destinationLanguage) },
				  }
				: code,
		)
		.sort(codesComparator ?? defaultCodesComparator(destinationLanguage))
