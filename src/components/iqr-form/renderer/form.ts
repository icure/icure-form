import { html, TemplateResult } from 'lit'
import { Field, Form, Group } from '../model'
import { Renderer } from './index'
import {
	handleFieldValueChangedProvider,
	dateFieldValuesProvider,
	dateTimeFieldValuesProvider,
	radioButtonFieldValuesProvider,
	dropdownFieldValuesProvider,
	handleMetaChangedProvider,
	measureFieldValuesProvider,
	metaProvider,
	numberFieldValuesProvider,
	textFieldValuesProvider,
	timeFieldValuesProvider,
} from '../../../utils/fieldsValuesProviders'
import { /*VersionedMeta,*/ VersionedValue } from '../fields/text-field'

import '../fields/dropdown/dropdown'
import { currentDate, currentDateTime, currentTime } from '../../../utils/icure-utils'
import { CodeStub, HealthcareParty } from '@icure/api'
import { OptionCode } from '../../common'
import { ActionManager, FormValuesContainer } from '../../../models'
import { optionMapper } from '../../../utils/code-utils'

export const firstItemValueProvider = (valuesProvider: () => VersionedValue[]) => () => valuesProvider()[0] ? [valuesProvider()[0]] : []
//const firstItemMetaProvider = (valuesProvider: () => VersionedMeta[]) => () => valuesProvider()[0]

export const render: Renderer = (
	form: Form,
	props: { [key: string]: unknown },
	formsValueContainer?: FormValuesContainer,
	formValuesContainerChanged?: (newValue: FormValuesContainer) => void,
	translationProvider: (text: string) => string = (text) => text,
	ownersProvider: (speciality: string[]) => HealthcareParty[] = () => [],
	codesProvider: (codifications: string[], searchTerm: string) => Promise<CodeStub[]> = () => Promise.resolve([]),
	optionsProvider: (codifications: string[], searchTerm?: string) => Promise<OptionCode[]> = () => Promise.resolve([]),
	actionManager?: ActionManager,
	editable?: boolean,
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
		if (fg.clazz === 'group' && fg.fields) {
			const fieldsOrGroupByRows = groupFieldsOrGroupByRows(fg.fields)
			return html`<div class="group" style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width)}">
				${h(level, html`${fg.group}`)}
				${fieldsOrGroupByRows.map((fieldsOrGroupRow) => fieldsOrGroupRow.map((fieldOrGroup) => renderFieldOrGroup(fieldOrGroup, level + 1, sumColumnsOfFields(fieldsOrGroupRow))))}
			</div>`
			// 	return fieldsOrGroupByRows.map((fieldsOrGroupRow) =>
			// 	fieldsOrGroupRow.map(
			// 		(fieldOrGroup) => `<div class="group">${h(level, html`${fieldOrGroup}`)} ${renderFieldOrGroup(fieldOrGroup, level + 1, sumColumnsOfFields(fieldsOrGroupRow))}</div>`,
			// 	),
			// )
		} else if (fg.clazz === 'field') {
			return html`${fg.type === 'textfield'
				? html`<iqr-form-textfield
						.actionManager="${actionManager}"
						.editable="${editable}"
						class="iqr-form-field"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows, fg.styleOptions?.width)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						value="${fg.value}"
						.labels="${fg.labels}"
						.multiline="${fg.multiline || false}"
						defaultLanguage="${props.defaultLanguage}"
						.linksProvider=${fg.options?.linksProvider}
						.suggestionProvider=${fg.options?.suggestionProvider}
						.ownersProvider=${fg.options?.ownersProvider}
						.translationProvider=${translationProvider}
						.codeColorProvider=${fg.options?.codeColorProvider}
						.linkColorProvider=${fg.options?.linkColorProvider}
						.codeContentProvider=${fg.options?.codeContentProvider}
						.valueProvider="${formsValueContainer && firstItemValueProvider(textFieldValuesProvider(formsValueContainer, fg))}"
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-textfield>`
				: fg.type === 'measure-field'
				? html`<iqr-form-measure-field
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						unit="${fg.unit}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(measureFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-measure-field>`
				: fg.type === 'number-field'
				? html`<iqr-form-number-field
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(numberFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-number-field>`
				: fg.type === 'date-picker'
				? html`<iqr-form-date-picker
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentDate() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(dateFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-date-picker>`
				: fg.type === 'time-picker'
				? html`<iqr-form-time-picker
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentTime() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(timeFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-time-picker>`
				: fg.type === 'date-time-picker'
				? html`<iqr-form-date-time-picker
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentDateTime() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(dateTimeFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-date-time-picker>`
				: fg.type === 'multiple-choice'
				? html`<iqr-form-multiple-choice
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.valueProvider="${formsValueContainer && firstItemValueProvider(textFieldValuesProvider(formsValueContainer, fg))}"
						.translationProvider=${translationProvider}
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-multiple-choice>`
				: fg.type === 'dropdown-field'
				? html`<iqr-form-dropdown-field
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label=${fg.field}
						.labels=${fg.labels}
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						.options="${optionMapper(fg)}"
						value="${fg.value}"
						.codifications="${fg.codifications}"
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.optionsProvider=${optionsProvider}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && firstItemValueProvider(dropdownFieldValuesProvider(formsValueContainer, fg))}"
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-dropdown-field>`
				: fg.type === 'radio-button'
				? html`<iqr-form-radio-button
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label="${fg.field}"
						.labels="${fg.labels}"
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						.options="${optionMapper(fg)}"
						value="${fg.value}"
						.codifications="${fg.codifications}"
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.optionsProvider=${codesProvider}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && firstItemValueProvider(radioButtonFieldValuesProvider(formsValueContainer, fg))}"
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-radio-button>`
				: fg.type === 'checkbox'
				? html`<iqr-form-checkbox
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label="${fg.field}"
						.labels="${fg.labels}"
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						.options="${optionMapper(fg)}"
						value="${fg.value}"
						.codifications="${fg.codifications}"
						.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
						.optionsProvider=${codesProvider}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && firstItemValueProvider(radioButtonFieldValuesProvider(formsValueContainer, fg))}"
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-checkbox>`
				: fg.type === 'label'
				? html`<iqr-form-label
						.actionManager="${actionManager}"
						.editable="${editable}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.translationProvider=${translationProvider}
						.styleOptions="${fg.styleOptions}"
				  ></iqr-form-label>`
				: ''}`
		}
		return html``
	}

	const calculateFieldOrGroupWidth = (columns: number, fieldsInRow: number, fieldWidth?: number, shouldFieldGrow?: boolean, fixedWidth?: number | undefined) => {
		if (fixedWidth) return `width: ${fixedWidth}px`
		else if (fieldWidth && fieldWidth > 0) return `--width: ${fieldWidth}px; --grows: ${Number(shouldFieldGrow)}`
		return `--width: ${(100 / fieldsInRow) * (columns || 0)}%; --grows: ${Number(shouldFieldGrow)};`
	}

	const renderForm = (form: Form) => {
		return form.sections.map((s) =>
			groupFieldsOrGroupByRows(s.fields)?.map(
				(fieldsOrGroup) =>
					html`<div class="iqr-form" style="${fieldsOrGroup.some((fieldOrGroup) => fieldOrGroup.styleOptions?.alignItems === 'flex-end') ? 'align-items: flex-end' : ''}">
						${fieldsOrGroup.map((fieldOrGroup: Field | Group) => renderFieldOrGroup(fieldOrGroup, 3, sumColumnsOfFields(fieldsOrGroup)))}
					</div> `,
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
