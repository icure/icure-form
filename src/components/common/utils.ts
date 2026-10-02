import { html, nothing, TemplateResult } from 'lit'
import { Code, Field, Labels, Position } from '../model'
import { localized } from '../../utils/suggestions'

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

/**
 * `labelId`, when given, goes on the primary label only: `float`, or the first displayed label when there is none.
 * It is the target of the field editor's `aria-labelledby`; see `Field.labelId`.
 */
export function generateLabels(labels: Labels, language: string, translationProvider?: (language: string, text: string) => string, labelId?: string): TemplateResult[] {
	const positions = Object.keys(labels) as Position[]
	const primary = positions.includes('float') ? 'float' : positions[0]
	return positions.map((position: Position) => generateLabel(labels[position] as string, position, language, translationProvider, position === primary ? labelId : undefined))
}

export function generateLabel(
	label: string,
	labelPosition: string,
	language: string,
	translationProvider: (language: string, text: string) => string = (language: string, text) => text,
	id?: string,
): TemplateResult {
	switch (labelPosition) {
		case 'right':
		case 'left':
			return html` <label id=${id ?? nothing} class="icure-label side above ${labelPosition}">${translationProvider(language, label)}</label> `
		default:
			return html` <label id=${id ?? nothing} class="icure-label ${labelPosition}">${translationProvider(language, label)}</label> `
	}
}

export const makePromoter = (promotions: string[]) => {
	const middle = promotions.indexOf('*')
	return (code: Code): number => {
		const index = promotions.indexOf(code.id ?? '')
		return index >= 0 ? index - middle : 0
	}
}

// Deliberately reads `label.en` exactly, not through `localized`: it matches the literals 'other' / 'none' / 'empty',
// and letting a `'*'` label reach those comparisons would start promoting a wildcard label reading "None" in every
// language — new behaviour, not wildcard support.
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
		return (localized(a?.label, language) || '').localeCompare(localized(b?.label, language) || '') * (ascending ? 1 : -1)
	}

export const naturalCodesComparator =
	(codePromoter: (c: Code) => number = defaultCodePromoter) =>
	(a: Code, b: Code): number => {
		const aPromoted = codePromoter(a)
		const bPromoted = codePromoter(b)
		return aPromoted !== bPromoted ? -1 : aPromoted - bPromoted
	}
