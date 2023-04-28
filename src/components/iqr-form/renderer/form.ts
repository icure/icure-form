import { html, TemplateResult } from 'lit'
import { Field, Form, Group } from '../model'
import { Renderer } from './index'
import { FormValuesContainer } from '../../iqr-form-loader'

import '../fields/dropdown'
import { renderField } from '../fieldRenderer'

//const firstItemMetaProvider = (valuesProvider: () => VersionedMeta[]) => () => valuesProvider()[0]

export const render: Renderer = (
	form: Form,
	skin: string,
	props: { [key: string]: unknown },
	formsValueContainer?: FormValuesContainer,
	formValuesContainerChanged?: (newValue: FormValuesContainer) => void,
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
	const renderFieldOrGroup = function (fg: Field | Group, level: number, fieldsInRow = 1): TemplateResult | TemplateResult[] {
		const fgColumns = fg.columns ?? 1
		if (fg.hideCondition) {
			const hideCondition = fg.hideCondition
			const hideConditionResult = formsValueContainer?.compute(hideCondition)
			if (hideConditionResult) {
				return html``
			}
		}
		if (fg.clazz === 'group' && fg.fields) {
			const fieldsOrGroupByRows = groupFieldsOrGroupByRows(fg.fields)
			return html`<div class="group" style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}">
				${h(level, html`${fg.group}`)}
				${fieldsOrGroupByRows.map((fieldsOrGroupRow) => fieldsOrGroupRow.map((fieldOrGroup) => renderFieldOrGroup(fieldOrGroup, level + 1, sumColumnsOfFields(fieldsOrGroupRow))))}
			</div>`
			// 	return fieldsOrGroupByRows.map((fieldsOrGroupRow) =>
			// 	fieldsOrGroupRow.map(
			// 		(fieldOrGroup) => `<div class="group">${h(level, html`${fieldOrGroup}`)} ${renderFieldOrGroup(fieldOrGroup, level + 1, sumColumnsOfFields(fieldsOrGroupRow))}</div>`,
			// 	),
			// )
		} else if (fg.clazz === 'field') {
			return renderField(fg, skin, fgColumns, fieldsInRow, props.labelPosition as string, formsValueContainer, formValuesContainerChanged)
		}
		return html``
	}

	const calculateFieldOrGroupWidth = (columns: number, fieldsInRow: number) => {
		return `--width: ${(100 / fieldsInRow) * (columns || 0)}%`
	}

	const renderForm = (form: Form) => {
		return form.sections.map((s) =>
			groupFieldsOrGroupByRows(s.fields)?.map(
				(fieldsOrGroup) =>
					html`<div class="iqr-form">${fieldsOrGroup.map((fieldOrGroup: Field | Group) => renderFieldOrGroup(fieldOrGroup, 3, sumColumnsOfFields(fieldsOrGroup)))}</div> `,
			),
		)
	}

	const sumColumnsOfFields = (fieldsOrGroup: (Field | Group)[]) => {
		return fieldsOrGroup.map((item) => item.columns).reduce((prev, next) => (prev || 0) + (next || 0))
	}

	const groupFieldsOrGroupByRows = (fieldsOrGroup: (Field | Group)[]) => {
		return fieldsOrGroup
			.reduce<(Field | Group)[][]>((x, y) => {
				if (y.rows) (x[y.rows] = x[y.rows] || []).push(y)
				return x
			}, [])
			.filter((text) => text)
	}

	return html` ${renderForm(form)} `
}
