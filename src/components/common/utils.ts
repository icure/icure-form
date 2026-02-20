import { html, TemplateResult } from 'lit'
import { Code, Field, Labels, Position } from '../model'

const labelCache = new WeakMap<Field, Labels>()

export const getLabels = (field: Field): Labels => {
	const cached = labelCache.get(field)
	if (cached) {
		return cached
	}
	const labels = field.labels ?? (field.shortLabel ? { float: field.shortLabel } : { float: field.label() })
	labelCache.set(field, labels)
	return labels
}

export function generateLabels(labels: Labels, language: string, translationProvider?: (language: string, text: string) => string): TemplateResult[] {
	return Object.keys(labels).map((position: Position) => generateLabel(labels[position] as string, position, language, translationProvider))
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
			return html` <label class="icure-label side above ${labelPosition}">${translationProvider(language, label)}</label> `
		default:
			return html` <label class="icure-label ${labelPosition}">${translationProvider(language, label)}</label> `
	}
}

export const makePromoter = (promotions: string[]) => {
	const middle = promotions.indexOf('*')
	return (code: Code): number => {
		const index = promotions.indexOf(code.id ?? '')
		return index >= 0 ? index - middle : 0
	}
}

export const defaultCodePromoter = (code: Code): number =>
	code?.label?.en?.toLowerCase() === 'other' ? 2 : code?.label?.en?.toLowerCase() === 'none' ? 1 : code?.label?.en?.toLowerCase() === 'empty' ? -1 : 0

export const defaultCodesComparator =
	(language = 'en', ascending = true, codePromoter: (c: Code) => number = defaultCodePromoter) =>
	(a: Code, b: Code): number => {
		const aPromoted = codePromoter(a)
		const bPromoted = codePromoter(b)
		if (aPromoted !== bPromoted) {
			return (aPromoted - bPromoted) * (ascending ? 1 : -1)
		}
		return (a?.label?.[language] || '').localeCompare(b?.label?.[language] || '') * (ascending ? 1 : -1)
	}

export const naturalCodesComparator =
	(codePromoter: (c: Code) => number = defaultCodePromoter) =>
	(a: Code, b: Code): number => {
		const aPromoted = codePromoter(a)
		const bPromoted = codePromoter(b)
		return aPromoted !== bPromoted ? -1 : aPromoted - bPromoted
	}
