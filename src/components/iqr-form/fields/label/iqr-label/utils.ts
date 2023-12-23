import { html, TemplateResult } from 'lit'
import { Labels } from '../../../../../models'

export function generateLabels(labels: Labels, translationProvider: (text: string) => string = (text) => text): TemplateResult[] {
	return Object.keys(labels).map((position) => generateLabel(labels[position], position, translationProvider))
}

export function generateLabel(label: string, labelPosition: string, translationProvider: (text: string) => string = (text) => text): TemplateResult {
	switch (labelPosition) {
		case 'right':
		case 'left':
			return html` <label class="iqr-label side above ${labelPosition}">${translationProvider(label)}</iqr-label> `
		default:
			return html` <label class="iqr-label ${labelPosition}">${translationProvider(label)}</iqr-label> `
	}
}
