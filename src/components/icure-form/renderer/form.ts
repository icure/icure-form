import { html, nothing, TemplateResult } from 'lit'
import { Renderer, RendererProps } from './index'
import { fieldValuesProvider, handleMetadataChanged, handleValueChanged } from '../../../utils/fields-values-provider'
import { currentDate, currentDateTime, currentTime } from '../../../utils/icure-utils'
import { CodeStub, HealthcareParty } from '@icure/api'
import { optionMapper } from '../../../utils/code-utils'
import { Code, FieldMetadata, FieldValue, Form, Field, Group, SubForm } from '../../model'
import { FormValuesContainer } from '../../../generic'

import '../fields'
import { defaultTranslationProvider } from '../../../utils/languages'
import { getLabels } from '../../common/utils'

export const render: Renderer = (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	ownersProvider: (speciality: string[]) => HealthcareParty[] = () => [],
	codesProvider: (codifications: string[], searchTerm: string) => Promise<CodeStub[]> = () => Promise.resolve([]),
	optionsProvider?: (language: string, codifications: string[], searchTerm?: string) => Promise<Code[]>,
	readonly?: boolean,
) => {
	const composedOptionsProvider =
		optionsProvider && form.codifications
			? async (language: string, codifications: string[], searchTerms?: string): Promise<Code[]> => {
					const originalOptions = optionsProvider ? await optionsProvider(language, codifications, searchTerms) : []
					return originalOptions.concat(
						form.codifications
							?.filter((c) => codifications.includes(c.type))
							?.flatMap((c) =>
								c.codes.filter(
									(c) =>
										!searchTerms ||
										searchTerms
											.split(/\s+/)
											.map((st) => st.toLowerCase())
											.every((st) => c.label[language].toLowerCase().includes(st)),
								),
							) ?? [],
					)
			  }
			: optionsProvider

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

	function renderGroup(fg: Group, fgColumns: number, level: number) {
		return html`<div class="${['group', fg.borderless ? undefined : 'bordered'].filter((x) => !!x).join(' ')}" style="${calculateFieldOrGroupWidth(fgColumns, fg.width)}">
			${fg.borderless ? nothing : html`<div>${h(level, html`${fg.group}`)}</div>`}
			<div class="icure-form" style="grid-template-columns: repeat(${fgColumns}, 1fr)">
				${(fg.fields ?? []).map((fieldOrGroup: Field | Group) => renderFieldOrGroup(fieldOrGroup, level + 1))}
			</div>
		</div>`
	}

	function renderSubForm(fg: SubForm, fgColumns: number) {
		const children = formsValueContainer?.getChildren(fg.title)
		return html`<div class="group" style="${calculateFieldOrGroupWidth(fgColumns, fg.width)}">
			${Object.entries(children ?? {})?.flatMap(([formKey, children]) => {
				const form = fg?.forms?.[formKey]
				return children.map((child) => form && render(form, props, child, translationProvider, ownersProvider, codesProvider, optionsProvider)).filter((x) => !!x)
			})}
		</div>`
	}

	function renderTextField(fgColumns: number, fg: Field) {
		return html`<icure-form-textfield
			class="icure-form-field"
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows, fg.styleOptions?.width)}"
			label="${fg.field}"
			value="${fg.value}"
			.displayedLabels="${getLabels(fg)}"
			.multiline="${fg.multiline || false}"
			defaultLanguage="${props.defaultLanguage}"
			.linksProvider=${fg.options?.linksProvider}
			.suggestionProvider=${fg.options?.suggestionProvider}
			.ownersProvider=${fg.options?.ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.codeColorProvider=${fg.options?.codeColorProvider}
			.linkColorProvider=${fg.options?.linkColorProvider}
			.codeContentProvider=${fg.options?.codeContentProvider}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-textfield>`
	}

	function renderMeasureField(fgColumns: number, fg: Field) {
		return html`<icure-form-measure-field
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			value="${fg.value}"
			unit="${fg.unit}"
			defaultLanguage="${props.defaultLanguage}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-measure-field>`
	}

	function renderNumberField(fgColumns: number, fg: Field) {
		return html`<icure-form-number-field
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			value="${fg.value}"
			defaultLanguage="${props.defaultLanguage}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-number-field>`
	}

	function renderDatePicker(fgColumns: number, fg: Field) {
		return html`<icure-form-date-picker
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			value="${fg.now ? currentDate() : fg.value}"
			defaultLanguage="${props.defaultLanguage}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-date-picker>`
	}

	function renderTimePicker(fgColumns: number, fg: Field) {
		return html`<icure-form-time-picker
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			value="${fg.now ? currentTime() : fg.value}"
			defaultLanguage="${props.defaultLanguage}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-time-picker>`
	}

	function renderDateTimePicker(fgColumns: number, fg: Field) {
		return html`<icure-form-date-time-picker
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			value="${fg.now ? currentDateTime() : fg.value}"
			defaultLanguage="${props.defaultLanguage}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-date-time-picker>`
	}

	function renderDropdownField(fgColumns: number, fg: Field) {
		return html`<icure-form-dropdown-field
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			.label=${fg.field}
			.displayedLabels=${getLabels(fg)}
			defaultLanguage="${props.defaultLanguage}"
			.translate="${fg.translate}"
			.sortable="${fg.sortable}"
			.sortOptions="${fg.sortOptions}"
			value="${fg.value}"
			.codifications="${fg.codifications}"
			.optionsProvider=${composedOptionsProvider && fg.codifications?.length
				? (language: string, searchTerms?: string) => composedOptionsProvider(language, fg.codifications ?? [], searchTerms)
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
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-dropdown-field>`
	}

	function renderRadioButtons(fgColumns: number, fg: Field) {
		return html`<icure-form-radio-button
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			.label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			defaultLanguage="${props.defaultLanguage}"
			.translate="${fg.translate}"
			.sortable="${fg.sortable}"
			.sortOptions="${fg.sortOptions}"
			.codifications="${fg.codifications}"
			.optionsProvider=${composedOptionsProvider && fg.codifications?.length
				? (language: string, searchTerms?: string) => composedOptionsProvider(language, fg.codifications ?? [], searchTerms)
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
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata}
			.handleValueChanged=${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}
			.handleMetadataChanged=${handleMetadataChanged(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-radio-button>`
	}

	function renderCheckboxes(fgColumns: number, fg: Field) {
		return html` <icure-form-checkbox
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			.label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			defaultLanguage="${props.defaultLanguage}"
			.translate="${fg.translate}"
			.sortable="${fg.sortable}"
			.sortOptions="${fg.sortOptions}"
			value="${fg.value}"
			.codifications="${fg.codifications}"
			.optionsProvider="${composedOptionsProvider && fg.codifications?.length
				? (language: string, searchTerms?: string) => composedOptionsProvider(language, fg.codifications ?? [], searchTerms)
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
						)}"
			.ownersProvider="${ownersProvider}"
			.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider="${formsValueContainer && formsValueContainer.getMetadata}"
			.handleValueChanged="${handleValueChanged(formsValueContainer, props.defaultOwner, fg)}"
			.handleMetadataChanged="${handleMetadataChanged(formsValueContainer)}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-checkbox>`
	}

	function renderLabel(fgColumns: number, fg: Field) {
		return html`<icure-form-label
			style="${calculateFieldOrGroupWidth(fgColumns, fg.width, fg.grows)}"
			labelPosition=${props.labelPosition}
			label="${fg.field}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-label>`
	}

	const renderFieldOrGroup = function (fg: Field | Group | SubForm, level: number): TemplateResult | TemplateResult[] {
		const fgColumns = fg.columns ?? 6
		const hidden = fg.computedProperties?.hidden ? formsValueContainer?.compute(fg.computedProperties?.hidden) : false
		if (hidden) {
			return html``
		}
		if (fg.clazz === 'group' && fg.fields) {
			return renderGroup(fg, fgColumns, level)
		} else if (fg.clazz === 'subform' && fg.title) {
			return renderSubForm(fg, fgColumns)
		} else if (fg.clazz === 'field') {
			return html`${fg.type === 'textfield'
				? renderTextField(fgColumns, fg)
				: fg.type === 'measure-field'
				? renderMeasureField(fgColumns, fg)
				: fg.type === 'number-field'
				? renderNumberField(fgColumns, fg)
				: fg.type === 'date-picker'
				? renderDatePicker(fgColumns, fg)
				: fg.type === 'time-picker'
				? renderTimePicker(fgColumns, fg)
				: fg.type === 'date-time-picker'
				? renderDateTimePicker(fgColumns, fg)
				: fg.type === 'dropdown-field'
				? renderDropdownField(fgColumns, fg)
				: fg.type === 'radio-button'
				? renderRadioButtons(fgColumns, fg)
				: fg.type === 'checkbox'
				? renderCheckboxes(fgColumns, fg)
				: fg.type === 'label'
				? renderLabel(fgColumns, fg)
				: ''}`
		}
		return html``
	}

	const calculateFieldOrGroupWidth = (columns: number, fieldWidth?: number, shouldFieldGrow?: boolean, fixedWidth?: number | undefined) => {
		if (fixedWidth) return `width: ${fixedWidth}px`
		return `grid-column: span ${columns};`
	}

	const renderForm = (form: Form) => {
		return form.sections.map((s) => html`<div class="icure-form">${s.fields.map((fieldOrGroup: Field | Group) => renderFieldOrGroup(fieldOrGroup, 3))}</div>`)
	}

	return html` ${renderForm(form)} `
}
