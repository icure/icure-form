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
						? html`<iqr-form-textfield
								label="${fg.field}"
								.labels="${fg.labels}"
								multiline="${fg.multiline}"
								rows="${fg.rows || 1}"
								grows="${fg.grows || false}"
								.translationProvider=${translationProvider}
								.ownersProvider=${ownersProvider}
								.codesProvider=${codesProvider}
						  ></iqr-form-textfield>`
						: fg.type === 'measure-field'
						? html`<iqr-form-measure-field label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-measure-field>`
						: fg.type === 'number-field'
						? html`<iqr-form-number-field label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-number-field>`
						: fg.type === 'date-picker'
						? html`<iqr-form-date-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-date-picker>`
						: fg.type === 'time-picker'
						? html`<iqr-form-time-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-time-picker>`
						: fg.type === 'date-time-picker'
						? html`<iqr-form-date-time-picker label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-date-time-picker>`
						: fg.type === 'multiple-choice'
						? html`<iqr-form-multiple-choice label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-multiple-choice>`
						: fg.type === 'dropdown-field'
						? html`<iqr-form-dropdown-field .labels="${fg.labels}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-dropdown-field>`
						: fg.type === 'radio-button'
						? html`<iqr-form-radio-button label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-radio-button>`
						: fg.type === 'checkbox'
						? html`<iqr-form-checkbox label="${fg.field}" .translationProvider=${translationProvider} .labels="${fg.labels}"></iqr-form-checkbox>`
						: fg.type === 'label'
						? html`<iqr-form-label labelPosition=${props.labelPosition} .translationProvider=${translationProvider} label="${fg.field}"></iqr-form-label>`
						: ''
			  }
					</div>`
	}

	return html`
		<div class="iqr-form">
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
