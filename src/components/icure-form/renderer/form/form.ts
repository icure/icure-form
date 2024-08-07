import { html, nothing, TemplateResult } from 'lit'
import { Renderer, RendererProps } from '../index'
import { fieldValuesProvider, getValidationError, handleMetadataChangedProvider, handleValueChangedProvider } from '../../../../utils/fields-values-provider'
import { FieldMetadata, FieldValue, Form, Field, Group, Subform, SortOptions } from '../../../model'
import { FormValuesContainer, Suggestion } from '../../../../generic'

import { defaultTranslationProvider } from '../../../../utils/languages'
import { getLabels } from '../../../common/utils'
import { filterAndSortOptionsFromFieldDefinition, sortSuggestions } from '../../../../utils/code-utils'

import './form-selection-button'
import { currentDate, currentDateTime, currentTime } from '../../../../utils/dates'

export const render: Renderer = (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => [],
	optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>,
	languages?: { [iso: string]: string },
	readonly?: boolean,
	displayMetadata?: boolean,
) => {
	const composedOptionsProvider =
		optionsProvider && form.codifications
			? async (language: string, codifications: string[], terms?: string[], sortOptions?: SortOptions): Promise<Suggestion[]> => {
					const originalOptions = optionsProvider ? await optionsProvider(language, codifications, terms) : []
					return sortSuggestions(
						originalOptions.concat(
							form.codifications
								?.filter((c) => codifications.includes(c.type))
								?.flatMap((c) =>
									c.codes
										.filter((c) => (terms ?? []).map((st) => st.toLowerCase()).every((st) => c.label[language].toLowerCase().includes(st)))
										.map((c) => ({ id: c.id, label: c.label, text: c.label[language], terms: terms ?? [] })),
								) ?? [],
						),
						language,
						sortOptions,
					)
			  }
			: optionsProvider
			? (language: string, codifications: string[], terms?: string[], sortOptions?: SortOptions): Promise<Suggestion[]> => {
					return optionsProvider?.(language, codifications, terms).then((codes) => sortSuggestions(codes, language, sortOptions)) ?? Promise.resolve([])
			  }
			: undefined

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

	function renderGroup(fg: Group, fgSpan: number, level: number) {
		const subElements = (fg.fields ?? []).map((fieldOrGroup: Field | Group) => renderFieldGroupOrSubform(fieldOrGroup, level + 1)).filter((x) => !!x && x !== nothing)
		return subElements.length
			? html`<div class="${['group', fg.borderless ? undefined : 'bordered'].filter((x) => !!x).join(' ')}" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
					${fg.borderless ? nothing : html`<div>${h(level, html`${fg.group}`)}</div>`}
					<div class="icure-form">${subElements}</div>
			  </div>`
			: nothing
	}

	function renderSubform(fg: Subform, fgSpan: number, level: number) {
		const children = formsValueContainer?.getChildren()?.filter((c) => c.getLabel() === fg.id)
		return html`<div class="subform" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
			<div>${h(level, html`${fg.shortLabel}`)}</div>
			<form-selection-button
				class="float-right-btn top"
				.forms="${Object.entries(fg.forms)}"
				.formAdded="${(title: string, form: Form) => {
					form.id && formsValueContainer?.addChild(fg.id, form.id, fg.shortLabel ?? '')
				}}"
			></form-selection-button>
			${children
				?.map((child) => {
					const childForm = Object.values(fg.forms).find((f) => f.id === child.getFormId())
					return (
						childForm &&
						html`
							<div class="container">
								${render(childForm, props, child, translationProvider, ownersProvider, optionsProvider, languages, readonly, displayMetadata)}
								<button @click="${() => formsValueContainer?.removeChild?.(child)}" class="float-right-btn bottom">-</button>
								<hr />
							</div>
						`
					)
				})
				.filter((x) => !!x)}
		</div>`
	}

	function renderTextField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-text-field
			class="icure-form-field"
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan, fg.styleOptions?.width)}"
			label="${fg.field}"
			value="${fg.value}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			.multiline="${fg.multiline || false}"
			.lines=${fgRowSpan}
			.defaultLanguage="${props.language}"
			.languages="${languages}"
			.linksProvider=${fg.options?.linksProvider}
			.suggestionProvider=${fg.options?.suggestionProvider}
			.ownersProvider=${ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.codeColorProvider=${fg.options?.codeColorProvider}
			.linkColorProvider=${fg.options?.linkColorProvider}
			.codeContentProvider=${fg.options?.codeContentProvider}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-text-field>`
	}

	function renderTokenField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-token-field
			class="icure-form-field"
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan, fg.styleOptions?.width)}"
			label="${fg.field}"
			value="${fg.value}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			.multiline="${fg.multiline || false}"
			.lines=${fgRowSpan}
			.defaultLanguage="${props.language}"
			.suggestionProvider=${fg.options?.suggestionProvider}
			.ownersProvider=${ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-token-field>`
	}

	function renderItemsListField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-items-list-field
			class="icure-form-field"
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan, fg.styleOptions?.width)}"
			label="${fg.field}"
			value="${fg.value}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			.multiline="${fg.multiline || false}"
			.lines=${fgRowSpan}
			.defaultLanguage="${props.language}"
			.suggestionProvider=${fg.options?.suggestionProvider}
			.ownersProvider=${ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-items-list-field>`
	}

	function renderMeasureField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-measure-field
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.value}"
			unit="${fg.unit}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-measure-field>`
	}

	function renderNumberField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-number-field
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-number-field>`
	}

	function renderDatePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-date-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentDate() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-date-picker>`
	}

	function renderTimePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-time-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentTime() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-time-picker>`
	}

	function renderDateTimePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-date-time-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentDateTime() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-date-time-picker>`
	}

	function renderDropdownField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-dropdown-field
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			.label=${fg.field}
			.displayedLabels=${getLabels(fg)}
			.defaultLanguage="${props.language}"
			.translate="${fg.translate}"
			.sortOptions="${fg.sortOptions}"
			value="${fg.value}"
			.codifications="${fg.codifications}"
			.optionsProvider="${composedOptionsProvider && fg.codifications?.length
				? (language: string, terms?: string[]) => composedOptionsProvider(language, fg.codifications ?? [], terms, fg.sortOptions)
				: (language: string, terms?: string[]) => filterAndSortOptionsFromFieldDefinition(language, fg, translationProvider, terms)}"
			.ownersProvider=${ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-dropdown-field>`
	}

	function renderRadioButtons(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-radio-button
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			.label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			.defaultLanguage="${props.language}"
			.translate="${fg.translate}"
			.sortOptions="${fg.sortOptions}"
			.codifications="${fg.codifications}"
			.optionsProvider="${composedOptionsProvider && fg.codifications?.length
				? (language: string, terms?: string[]) => composedOptionsProvider(language, fg.codifications ?? [], terms, fg.sortOptions)
				: (language: string, terms?: string[]) => filterAndSortOptionsFromFieldDefinition(language, fg, translationProvider, terms)}"
			.ownersProvider=${ownersProvider}
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-radio-button>`
	}

	function renderCheckboxes(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html` <icure-form-checkbox
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			.label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			.defaultLanguage="${props.language}"
			.translate="${fg.translate}"
			.sortOptions="${fg.sortOptions}"
			value="${fg.value}"
			.codifications="${fg.codifications}"
			.optionsProvider="${composedOptionsProvider && fg.codifications?.length
				? (language: string, terms?: string[]) => composedOptionsProvider(language, fg.codifications ?? [], terms, fg.sortOptions)
				: (language: string, terms?: string[]) => filterAndSortOptionsFromFieldDefinition(language, fg, translationProvider, terms)}"
			.ownersProvider="${ownersProvider}"
			.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
			.metadataProvider="${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}"
			.handleValueChanged="${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}"
			.handleMetadataChanged="${handleMetadataChangedProvider(formsValueContainer)}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-checkbox>`
	}

	function renderLabel(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-label
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			labelPosition=${props.labelPosition}
			label="${fg.field}"
			.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
			.validationErrorsProvider="${getValidationError(formsValueContainer, fg)}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !formsValueContainer?.compute(fg.computedProperties?.readonly) : false)}"
		></icure-form-label>`
	}

	const renderFieldGroupOrSubform = function (fg: Field | Group | Subform, level: number): TemplateResult | TemplateResult[] | typeof nothing {
		if (!fg) {
			return nothing
		}
		const computedProperties = Object.keys(fg.computedProperties ?? {}).reduce(
			(acc, k) => ({ ...acc, [k]: fg.computedProperties?.[k] && formsValueContainer?.compute(fg.computedProperties[k]) }),
			{},
		) as { [key: string]: string | number | boolean | undefined }
		if (computedProperties['hidden']) {
			return nothing
		}

		const fgSpan = (computedProperties['span'] ?? fg.span ?? 6) as number
		const fgRowSpan = (computedProperties['rowSpan'] ?? fg.rowSpan ?? 1) as number

		if (fg.clazz === 'group' && fg.fields?.length) {
			return renderGroup((fg as Group).copy({ ...computedProperties }), fgSpan, level)
		} else if (fg.clazz === 'subform' && (fg.id || computedProperties['title'])) {
			return renderSubform((fg as Subform).copy({ ...computedProperties }), fgSpan, level)
		} else if (fg.clazz === 'field') {
			const field = fg.copy({ ...computedProperties })
			return html`${fg.type === 'text-field'
				? renderTextField(fgSpan, fgRowSpan, field)
				: fg.type === 'measure-field'
				? renderMeasureField(fgSpan, fgRowSpan, field)
				: fg.type === 'token-field'
				? renderTokenField(fgSpan, fgRowSpan, field)
				: fg.type === 'items-list-field'
				? renderItemsListField(fgSpan, fgRowSpan, field)
				: fg.type === 'number-field'
				? renderNumberField(fgSpan, fgRowSpan, field)
				: fg.type === 'date-picker'
				? renderDatePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'time-picker'
				? renderTimePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'date-time-picker'
				? renderDateTimePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'dropdown-field'
				? renderDropdownField(fgSpan, fgRowSpan, field)
				: fg.type === 'radio-button'
				? renderRadioButtons(fgSpan, fgRowSpan, field)
				: fg.type === 'checkbox'
				? renderCheckboxes(fgSpan, fgRowSpan, field)
				: fg.type === 'label'
				? renderLabel(fgSpan, fgRowSpan, field)
				: ''}`
		}
		return html``
	}

	const calculateFieldOrGroupSize = (span: number, rowSpan: number, fixedWidth?: number | undefined) => {
		if (fixedWidth) return `width: ${fixedWidth}px`
		return `grid-column: span ${span}; ${rowSpan > 1 ? `grid-row: span ${rowSpan}` : ''}`
	}

	const renderForm = (form: Form) => {
		return form.sections.map((s) => html`<div class="icure-form">${s.fields.map((fieldOrGroup: Field | Group) => renderFieldGroupOrSubform(fieldOrGroup, 3))}</div>`)
	}

	return html` ${renderForm(form)} `
}
