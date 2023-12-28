import { html, TemplateResult } from 'lit'
import { Field, Form, Group } from '../model'
import { Renderer } from './index'
import { CodeStub, HealthcareParty } from '@icure/api'
import { FormValuesContainer } from '../../../models'

export const render: Renderer = (
	form: Form,
	props: { [key: string]: unknown },
	formsValueContainer?: FormValuesContainer,
	formValuesContainerChanged?: (newValue: FormValuesContainer) => void,
	translationProvider: (text: string) => string = (text) => text,
	ownersProvider: (speciality: string[]) => HealthcareParty[] = () => [],
	codesProvider: (codifications: string[], searchTerm: string) => Promise<CodeStub[]> = () => Promise.resolve([]),
) => {
	const h = function (level: number, content: TemplateResult): TemplateResult {
		return level === 1
			? html`<h1>${content}</h1>`
			: level === 2
			? html`<h2>${content}</h2>`
			: level === 3
			? html`<h3>${content}</h3>`
			: level === 4
			? html`<h4>${content}</h4>`
			: level === 5
			? html`<h5>${content}</h5>`
			: html`<h6>${content}</h6>`
	}
	const renderFieldOrGroup = function (fg: Field | Group, level: number): TemplateResult {
		return fg instanceof Group
			? html` <div class="group">${h(level, html`${fg.group}`)} ${fg.fields?.map((f) => renderFieldOrGroup(f, level + 1))}</div>`
			: html`${
					fg.type === 'textfield'
						? html`<icure-form-textfield
								label="${fg.field}"
								.labels="${fg.labels}"
								multiline="${fg.multiline}"
								rows="${fg.rows || 1}"
								grows="${fg.grows || false}"
								.translationProvider=${translationProvider}
								.ownersProvider=${ownersProvider}
								.codesProvider=${codesProvider}
						  ></icure-form-textfield>`
						: fg.type === 'measure-field'
						? html`<icure-form-measure-field label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-measure-field>`
						: fg.type === 'number-field'
						? html`<icure-form-number-field label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-number-field>`
						: fg.type === 'date-picker'
						? html`<icure-form-date-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-date-picker>`
						: fg.type === 'time-picker'
						? html`<icure-form-time-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-time-picker>`
						: fg.type === 'date-time-picker'
						? html`<icure-form-date-time-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-date-time-picker>`
						: fg.type === 'multiple-choice'
						? html`<icure-form-multiple-choice label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-multiple-choice>`
						: fg.type === 'dropdown-field'
						? html`<icure-form-dropdown-field .labels="${fg.labels}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-dropdown-field>`
						: fg.type === 'radio-button'
						? html`<icure-form-radio-button label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-radio-button>`
						: fg.type === 'checkbox'
						? html`<icure-form-checkbox label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></icure-form-checkbox>`
						: fg.type === 'label'
						? html`<icure-form-label labelPosition=${props.labelPosition} .translationProvider=${translationProvider} label="${fg.field}"></icure-form-label>`
						: ''
			  }
					</div>`
	}

	return html`
		<div class="icure-form">
			${form?.sections?.map(
				(s) =>
					html`
						<h2>${s.section}</h2>
						${s.description ? html`<p>${s.description}</p>` : ''} ${s.fields?.map((f) => renderFieldOrGroup(f, 3))}
					`,
			)}
		</div>
	`
}
