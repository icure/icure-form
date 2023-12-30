import { html, TemplateResult } from 'lit'
import { Code, Labels } from '../model'

export function generateLabels(labels: Labels, translationProvider: (text: string) => string = (text) => text): TemplateResult[] {
	return Object.keys(labels).map((position) => generateLabel(labels[position], position, translationProvider))
}

export function generateLabel(label: string, labelPosition: string, translationProvider: (text: string) => string = (text) => text): TemplateResult {
	switch (labelPosition) {
		case 'right':
		case 'left':
			return html` <label class="icure-label side above ${labelPosition}">${translationProvider(label)}</icure-label> `
		default:
			return html` <label class="icure-label ${labelPosition}">${translationProvider(label)}</icure-label> `
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
