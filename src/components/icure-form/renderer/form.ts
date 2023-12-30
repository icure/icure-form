import { html, TemplateResult } from 'lit'
import { Renderer } from './index'
import { fieldValuesProvider, handleMetadataChanged, handleValueChanged } from '../../../utils/fieldsValuesProviders'

import '../fields/dropdown/dropdown'
import { currentDate, currentDateTime, currentTime } from '../../../utils/icure-utils'
import { CodeStub, HealthcareParty } from '@icure/api'
import { optionMapper } from '../../../utils/code-utils'
import { Code, FieldMetadata, FieldValue, Form, Field, Group, SubForm } from '../../model'
import { FormValuesContainer } from '../../../generic'

export const render: Renderer = (
	form: Form,
	props: { [key: string]: unknown },
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	formValuesContainerChanged?: (newValue: FormValuesContainer<FieldValue, FieldMetadata>) => void,
	translationProvider: (text: string) => string = (text) => text,
	ownersProvider: (speciality: string[]) => HealthcareParty[] = () => [],
	codesProvider: (codifications: string[], searchTerm: string) => Promise<CodeStub[]> = () => Promise.resolve([]),
	optionsProvider?: (language: string, codifications: string[], searchTerm?: string) => Promise<Code[]>,
	readonly?: boolean,
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
	const renderFieldOrGroup = function (fg: Field | Group | SubForm, level: number, fieldsInRow = 1): TemplateResult | TemplateResult[] {
		const fgColumns = fg.columns ?? 1
		if (fg.clazz === 'group' && fg.fields) {
			const fieldsOrGroupByRows = groupFieldsOrGroupByRows(fg.fields)
			return html`<div class="group" style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width)}">
				${h(level, html`${fg.group}`)}
				${fieldsOrGroupByRows.map((fieldsOrGroupRow) => fieldsOrGroupRow.map((fieldOrGroup) => renderFieldOrGroup(fieldOrGroup, level + 1, sumColumnsOfFields(fieldsOrGroupRow))))}
			</div>`
		} else if (fg.clazz === 'subform' && fg.subform) {
			const children = formsValueContainer?.getChildren(fg.subform)
			return html`<div class="group" style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width)}">
				${Object.entries(children ?? {})?.flatMap(([formKey, children]) => {
					const form = fg?.forms?.[formKey]
					return children
						.map((child) => form && render(form, props, child, formValuesContainerChanged, translationProvider, ownersProvider, codesProvider, optionsProvider))
						.filter((x) => !!x)
				})}
			</div>`
		} else if (fg.clazz === 'field') {
			return html`${fg.type === 'textfield'
				? html`<icure-form-textfield
						.readonly="${readonly}"
						class="icure-form-field"
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
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-textfield>`
				: fg.type === 'measure-field'
				? html`<icure-form-measure-field
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						unit="${fg.unit}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-measure-field>`
				: fg.type === 'number-field'
				? html`<icure-form-number-field
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-number-field>`
				: fg.type === 'date-picker'
				? html`<icure-form-date-picker
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentDate() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-date-picker>`
				: fg.type === 'time-picker'
				? html`<icure-form-time-picker
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentTime() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-time-picker>`
				: fg.type === 'date-time-picker'
				? html`<icure-form-date-time-picker
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.now ? currentDateTime() : fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-date-time-picker>`
				: fg.type === 'multiple-choice'
				? html`<icure-form-multiple-choice
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.labels="${fg.labels}"
						value="${fg.value}"
						defaultLanguage="${props.defaultLanguage}"
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-multiple-choice>`
				: fg.type === 'dropdown-field'
				? html`<icure-form-dropdown-field
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label=${fg.field}
						.labels=${fg.labels}
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						value="${fg.value}"
						.codifications="${fg.codifications}"
						.optionsProvider=${optionsProvider && fg.codifications?.length
							? (language: string, searchTerms?: string) => optionsProvider(language, fg.codifications ?? [], searchTerms)
							: (language: string, searchTerms?: string) =>
									Promise.resolve(
										optionMapper(language, fg).filter(
											(x) =>
												!searchTerms ||
												searchTerms
													.split(/\s+/)
													.map((st) => st.toLowerCase())
													.every((st) => x.label[language].toLowerCase().includes(st)),
										),
									)}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-dropdown-field>`
				: fg.type === 'radio-button'
				? html`<icure-form-radio-button
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label="${fg.field}"
						.labels="${fg.labels}"
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						.codifications="${fg.codifications}"
						.optionsProvider=${optionsProvider && fg.codifications?.length
							? (language: string, searchTerms?: string) => optionsProvider(language, fg.codifications ?? [], searchTerms)
							: (language: string, searchTerms?: string) =>
									Promise.resolve(
										optionMapper(language, fg).filter(
											(x) =>
												!searchTerms ||
												searchTerms
													.split(/\s+/)
													.map((st) => st.toLowerCase())
													.every((st) => x.label[language].toLowerCase().includes(st)),
										),
									)}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-radio-button>`
				: fg.type === 'checkbox'
				? html`<icure-form-checkbox
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						.label="${fg.field}"
						.labels="${fg.labels}"
						defaultLanguage="${props.defaultLanguage}"
						.translate="${fg.translate}"
						.sortable="${fg.sortable}"
						.sortOptions="${fg.sortOptions}"
						value="${fg.value}"
						.codifications="${fg.codifications}"
						.optionsProvider=${optionsProvider && fg.codifications?.length
							? (language: string, searchTerms?: string) => optionsProvider(language, fg.codifications ?? [], searchTerms)
							: (language: string, searchTerms?: string) =>
									Promise.resolve(
										optionMapper(language, fg).filter(
											(x) =>
												!searchTerms ||
												searchTerms
													.split(/\s+/)
													.map((st) => st.toLowerCase())
													.every((st) => x.label[language].toLowerCase().includes(st)),
										),
									)}
						.ownersProvider=${ownersProvider}
						.translationProvider=${translationProvider}
						.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
						.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
						.handleValueChanged=${handleValueChanged(formsValueContainer, formValuesContainerChanged)}
						.handleMetadataChanged=${handleMetadataChanged(formsValueContainer, formValuesContainerChanged)}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-checkbox>`
				: fg.type === 'label'
				? html`<icure-form-label
						.readonly="${readonly}"
						style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow, fg.width, fg.grows)}"
						labelPosition=${props.labelPosition}
						label="${fg.field}"
						.translationProvider=${translationProvider}
						.styleOptions="${fg.styleOptions}"
				  ></icure-form-label>`
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
					html`<div class="icure-form" style="${fieldsOrGroup.some((fieldOrGroup) => fieldOrGroup.styleOptions?.alignItems === 'flex-end') ? 'align-items: flex-end' : ''}">
						${fieldsOrGroup.map((fieldOrGroup: Field | Group) => renderFieldOrGroup(fieldOrGroup, 3, sumColumnsOfFields(fieldsOrGroup)))}
					</div> `,
			),
		)
	}

	const sumColumnsOfFields = (fieldsOrGroup: (Field | Group | SubForm)[]) => {
		return fieldsOrGroup.map((item) => item.columns).reduce((prev, next) => (prev || 0) + (next || 0))
	}

	const groupFieldsOrGroupByRows = (fieldsOrGroup: (Field | Group | SubForm)[]) => {
		return fieldsOrGroup
			.reduce<(Field | Group | SubForm)[][]>((x, y) => {
				if (y.rows) (x[y.rows] = x[y.rows] || []).push(y)
				return x
			}, [])
			.filter((text) => text)
	}

	return html` ${renderForm(form)} `
}
