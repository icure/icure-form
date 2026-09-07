import { html, nothing, TemplateResult } from 'lit'
import { Renderer, RendererProps } from '../index'
import { fieldValuesProvider, getValidationErrorProvider, handleMetadataChangedProvider, handleValueChangedProvider } from '../../../../utils/fields-values-provider'
import { FieldMetadata, FieldValue, Form, Field, Group, Subform, SortOptions, isVisibleForRole } from '../../../model'
import { FormValuesContainer, Suggestion, Version } from '../../../../generic'

import { defaultTranslationProvider } from '../../../../utils/languages'
import { getLabels } from '../../../common/utils'
import { filterAndSortOptionsFromFieldDefinition, sortSuggestions } from '../../../../utils/code-utils'
import { isEmptyFieldValues, VALUE_BEARING_FIELD_TYPES } from '../../../../utils/field-emptiness'

import './form-selection-button'
import { currentDate, currentDateTime, currentTime } from '../../../../utils/dates'

/**
 * What an internal render function hands its caller: the template to emit — `nothing` when the node
 * is dropped — and whether the node counts as surviving content for the upward cascade. Rendered
 * nodes that carry no answer of their own (labels, action buttons) are `content: false`, so a
 * container holding nothing else still collapses. Render-and-observe: a container decides after its
 * children have rendered, never from a pre-pass (ADR 0001).
 */
type RenderedNode = { template: TemplateResult | typeof nothing; content: boolean }

/** Evaluated `computedProperties` of a Field, Group or Subform, minus `value` / `defaultValue`. */
type ComputedProperties = { [key: string]: string | number | boolean | undefined }

/** A section wrapper awaits the section thunk; an inactive tab never calls it at all (ADR 0001). */
type SectionWrapper = (index: number, section: () => Promise<TemplateResult>) => Promise<TemplateResult>

/**
 * `alwaysVisible` of a Field, Group or Subform: the computed property when the definition declares
 * one — an explicit `false` from the formula wins over the static flag — the model flag otherwise.
 * Always resolved on the original node, never on the `copyIfNeeded` copy handed to the renderers.
 */
const resolveAlwaysVisible = (fg: Field | Group | Subform, computedProperties: ComputedProperties): boolean => !!(computedProperties['alwaysVisible'] ?? fg.alwaysVisible)

const renderInternal = async (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	revisionsFilter?: (field: Field, id: string, history: Version<FieldMetadata>[]) => string[],
	ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => [],
	optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>,
	actionListener: (event: string, payload: unknown, domEvent?: Event) => void = () => undefined,
	languages?: { [iso: string]: string },
	readonly?: boolean,
	displayMetadata?: boolean,
	sectionWrapper?: SectionWrapper,
): Promise<RenderedNode> => {
	// Read-only review mode. When off, every cascade rule below is a pass-through: `content` is still
	// computed but never changes what is emitted.
	const hide = !!props.hideEmptyFields

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
										.filter((c) => (terms ?? []).map((st) => st.toLowerCase()).every((st) => (c.label?.[language] ?? c.id).toLowerCase().includes(st)))
										.map((c) => ({ id: c.id, label: c.label ?? { [language]: c.id }, text: c.label?.[language] ?? c.id, terms: terms ?? [] })),
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

	const h = function (level: number, className = '', content: TemplateResult): TemplateResult {
		return level === 1
			? html`<h1 class="${className}">${content}</h1>`
			: level === 2
			? html`<h2 class="${className}">${content}</h2>`
			: level === 3
			? html`<h3 class="${className}">${content}</h3>`
			: level === 4
			? html`<h4 class="${className}">${content}</h4>`
			: level === 5
			? html`<h5 class="${className}">${content}</h5>`
			: html`<h6 class="${className}">${content}</h6>`
	}

	async function renderGroup(fg: Group, fgSpan: number, level: number, alwaysVisible: boolean): Promise<RenderedNode> {
		const tp = translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))
		const results = await Promise.all((fg.fields ?? []).map((fieldOrGroup: Field | Group) => renderFieldGroupOrSubform(fieldOrGroup, level + 1)))
		const subElements = results.map((r) => r.template).filter((x) => !!x && x !== nothing)
		const hasContent = results.some((r) => r.content)
		const groupTitle = fg.translate && tp && props.language ? tp(props.language, fg.group) : fg.group
		const shell = (children: unknown) =>
			html`<div class="${['group', fg.borderless ? undefined : 'bordered'].filter((x) => !!x).join(' ')}" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
				${fg.borderless ? nothing : html`<div>${h(level, '', html`${groupTitle}`)}</div>`}
				<div class="icure-form">${children}</div>
			</div>`
		// Read-only review: a group whose children all dropped goes with them, unless it opts out with
		// `alwaysVisible` — then its shell (title as usual, empty grid) stands in for the missing content.
		if (hide && !hasContent) {
			return alwaysVisible ? { template: shell(nothing), content: true } : { template: nothing, content: false }
		}
		// Flag off: unchanged behaviour — collapse only when every child template is `nothing`.
		return subElements.length ? { template: shell(subElements), content: hasContent } : { template: nothing, content: false }
	}

	async function renderSubform(fg: Subform, fgSpan: number, level: number, alwaysVisible: boolean): Promise<RenderedNode> {
		const children = (await formsValueContainer?.getChildren())?.filter((c) => c.getLabel() === fg.id)
		const tp = translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))
		const instances: TemplateResult[] = []
		for (const child of children ?? []) {
			const childForm = Object.values(fg.forms).find((f) => f.id === child.getFormId())
			if (!childForm) {
				continue
			}
			const rendered = await renderInternal(childForm, props, child, translationProvider, revisionsFilter, ownersProvider, optionsProvider, actionListener, languages, readonly, displayMetadata)
			// Read-only review: an instance whose whole child form dropped is skipped entirely — no title
			// and no remove button either.
			if (hide && !rendered.content) {
				continue
			}
			const title = childForm.form ?? childForm.description
			const localisedTitle = (title && tp && props.language ? tp?.(props.language, title) : title) ?? ''
			const localisedRemove = (fg.labels.remove && tp && props.language ? tp?.(props.language, fg.labels.remove) : fg.labels.remove) ?? 'Remove'
			instances.push(html`
				<div class="subform__child">
					<h3 class="subform__child__title">${localisedTitle}</h3>
					${rendered.template} ${readonly ? nothing : html` <button class="subform__removeBtn" @click="${() => formsValueContainer?.removeChild?.(child)}">${localisedRemove}</button>`}
				</div>
			`)
		}
		// The heading carries the add button, so it stays as long as the subform itself is shown. With no
		// instance left and no opt-out, the whole node drops rather than leaving an empty heading behind.
		if (hide && !instances.length && !alwaysVisible) {
			return { template: nothing, content: false }
		}
		return {
			template: html`<div class="subform" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
				<div class="subform__heading">
					${h(level, 'subform__heading__title', html`${(props.language && fg.shortLabel ? tp?.(props.language, fg.shortLabel) : fg.shortLabel) ?? ''}`)}
					${readonly
						? nothing
						: html`<form-selection-button
								.label="${fg.labels.add ?? 'Add subform'}"
								.forms="${Object.entries(fg.forms)}"
								.formAdded="${(title: string, form: Form) => {
									form.id && formsValueContainer?.addChild(fg.id, form.id, fg.shortLabel ?? '')
								}}"
								.translationProvider="${tp}"
								.language="${props.language}"
						  ></form-selection-button>`}
				</div>
				${instances}
			</div>`,
			content: instances.length > 0 || alwaysVisible,
		}
	}

	async function renderTextField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-text-field
			class="icure-form-field"
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan, fg.styleOptions?.width)}"
			label="${fg.field}"
			value="${fg.value}"
			.schema="${fg.schema}"
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.codeColorProvider=${fg.options?.codeColorProvider}
			.linkColorProvider=${fg.options?.linkColorProvider}
			.codeContentProvider=${fg.options?.codeContentProvider}
			.defaultValueProvider=${formsValueContainer?.getDefaultValueProvider(fg.field)}
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readOnlyEvent="${fg.readOnlyEvent}"
			.actionListener="${actionListener}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-text-field>`
	}

	async function renderTokenField(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.tokenDeleteButton="${!!fg.tokenDeleteButton}"
			.delegatedEdition="${!!fg.delegatedEdition}"
			.event="${fg.event}"
			.readOnlyEvent="${fg.readOnlyEvent}"
			.actionListener="${actionListener}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-token-field>`
	}

	async function renderItemsListField(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-items-list-field>`
	}

	async function renderMeasureField(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-measure-field>`
	}

	async function renderNumberField(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-number-field
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-number-field>`
	}

	async function renderDatePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-date-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentDate() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-date-picker>`
	}

	async function renderTimePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-time-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentTime() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-time-picker>`
	}

	async function renderDateTimePicker(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-date-time-picker
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			label="${fg.field}"
			.displayedLabels="${getLabels(fg)}"
			.displayMetadata="${displayMetadata}"
			value="${fg.now ? currentDateTime() : fg.value}"
			.defaultLanguage="${props.language}"
			.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-date-time-picker>`
	}

	async function renderDropdownField(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-dropdown-field>`
	}

	async function renderRadioButtons(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
			.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
			.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-radio-button>`
	}

	async function renderCheckboxes(fgSpan: number, fgRowSpan: number, fg: Field) {
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
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg, revisionsFilter)}"
			.metadataProvider="${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}"
			.handleValueChanged="${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}"
			.handleMetadataChanged="${handleMetadataChangedProvider(formsValueContainer)}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-checkbox>`
	}

	async function renderButton(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-button
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-button"
			label="${fg.shortLabel ?? fg.field}"
			.defaultLanguage="${props.language}"
			.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.actionListener="${actionListener}"
			.event="${fg.event !== undefined ? fg.event : fg.computedProperties?.event ? (await formsValueContainer?.compute(fg.computedProperties?.event))?.value : 'submit'}"
			.payload="${fg.payload !== undefined ? fg.payload : fg.computedProperties?.payload ? (await formsValueContainer?.compute(fg.computedProperties?.payload))?.value : undefined}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-button>`
	}

	async function renderLabel(fgSpan: number, fgRowSpan: number, fg: Field) {
		return html`<icure-form-label
			style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
			class="icure-form-field"
			.defaultLanguage="${props.language}"
			labelPosition=${props.labelPosition}
			label="${fg.shortLabel ?? fg.field}"
			.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
			.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
			.styleOptions="${fg.styleOptions}"
			.readonly="${readonly || fg.readonly || (fg.computedProperties?.readonly ? !!(await formsValueContainer?.compute(fg.computedProperties?.readonly))?.value : false)}"
		></icure-form-label>`
	}

	const renderFieldGroupOrSubform = async function (fg: Field | Group | Subform, level: number): Promise<RenderedNode> {
		if (!fg) {
			return { template: nothing, content: false }
		}
		if (!isVisibleForRole((fg as any).roles, props.role)) {
			return { template: nothing, content: false }
		}
		const computedProperties = (await Object.keys(fg.computedProperties ?? {})
			.filter((k) => k !== 'value' && k !== 'defaultValue')
			.reduce(
				async (acc, k) => ({ ...(await acc), [k]: fg.computedProperties?.[k] && (await formsValueContainer?.compute(fg.computedProperties[k]))?.value }),
				Promise.resolve({}),
			)) as ComputedProperties
		if (computedProperties['hidden']) {
			return { template: nothing, content: false }
		}
		const alwaysVisible = resolveAlwaysVisible(fg, computedProperties)
		// Read-only review mode: a value-bearing field with no displayable answer is omitted, unless it
		// opts out with `alwaysVisible`.
		if (hide && fg.clazz === 'field' && VALUE_BEARING_FIELD_TYPES.has(fg.type)) {
			if (!alwaysVisible && isEmptyFieldValues(formsValueContainer ? fieldValuesProvider(formsValueContainer, fg, revisionsFilter)() : undefined)) {
				return { template: nothing, content: false }
			}
		}

		const fgSpan = (computedProperties['span'] ?? fg.span ?? 6) as number
		const fgRowSpan = (computedProperties['rowSpan'] ?? fg.rowSpan ?? 1) as number

		if (fg.clazz === 'group' && fg.fields?.length) {
			return await renderGroup((fg as Group).copyIfNeeded({ ...computedProperties }), fgSpan, level, alwaysVisible)
		} else if (fg.clazz === 'subform' && (fg.id || computedProperties['title'])) {
			return await renderSubform((fg as Subform).copyIfNeeded({ ...computedProperties }), fgSpan, level, alwaysVisible)
		} else if (fg.clazz === 'field') {
			const field = fg.copyIfNeeded({ ...computedProperties })
			const template = html`${fg.type === 'text-field'
				? await renderTextField(fgSpan, fgRowSpan, field)
				: fg.type === 'measure-field'
				? await renderMeasureField(fgSpan, fgRowSpan, field)
				: fg.type === 'token-field'
				? await renderTokenField(fgSpan, fgRowSpan, field)
				: fg.type === 'items-list-field'
				? await renderItemsListField(fgSpan, fgRowSpan, field)
				: fg.type === 'number-field'
				? await renderNumberField(fgSpan, fgRowSpan, field)
				: fg.type === 'date-picker'
				? await renderDatePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'time-picker'
				? await renderTimePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'date-time-picker'
				? await renderDateTimePicker(fgSpan, fgRowSpan, field)
				: fg.type === 'dropdown-field'
				? await renderDropdownField(fgSpan, fgRowSpan, field)
				: fg.type === 'radio-button'
				? await renderRadioButtons(fgSpan, fgRowSpan, field)
				: fg.type === 'checkbox'
				? await renderCheckboxes(fgSpan, fgRowSpan, field)
				: fg.type === 'label'
				? await renderLabel(fgSpan, fgRowSpan, field)
				: fg.type === 'action'
				? await renderButton(fgSpan, fgRowSpan, field)
				: ''}`
			// A label or an action button renders whenever it is reached, but never counts as surviving
			// content: a group or section holding nothing else still collapses around it.
			return { template, content: VALUE_BEARING_FIELD_TYPES.has(fg.type) }
		}
		return { template: html``, content: false }
	}

	const calculateFieldOrGroupSize = (span: number, rowSpan: number, fixedWidth?: number | undefined) => {
		if (fixedWidth) return `width: ${fixedWidth}px`
		return `grid-column: span ${span}; ${rowSpan > 1 ? `grid-row: span ${rowSpan}` : ''}`
	}

	const renderForm = async (form: Form, sectionWrapper?: SectionWrapper): Promise<RenderedNode[]> => {
		return await Promise.all(
			form.sections.map(async (s, idx): Promise<RenderedNode> => {
				if (!isVisibleForRole(s.roles, props.role)) {
					return { template: nothing, content: false }
				}
				// A section's children are rendered inside this thunk, so a wrapper that never calls it (an
				// inactive tab) costs no value read and no formula evaluation for that section — ADR 0001.
				// Narrower than `RenderedNode`: a section always has a template of its own, its grid.
				const renderSection = async (): Promise<{ template: TemplateResult; content: boolean }> => {
					const results = await Promise.all(s.fields.map((fieldOrGroup: Field | Group | Subform) => renderFieldGroupOrSubform(fieldOrGroup, 3)))
					return { template: html` <div class="icure-form">${results.map((r) => r.template)}</div>`, content: results.some((r) => r.content) }
				}
				if (sectionWrapper) {
					// `form:tab`: the wrapper is always called — every section keeps its tab — and it alone
					// decides whether the thunk runs. Section-level cascade is therefore plain-`form` only,
					// and the node counts as content because the wrapper always emits its own tab element.
					return { template: await sectionWrapper(idx, async () => (await renderSection()).template), content: true }
				}
				const rendered = await renderSection()
				if (hide && !rendered.content) {
					// An `alwaysVisible` section keeps its (now empty) grid and reports content, so that a
					// subform instance holding only such a section survives too — as the group shell does.
					return s.alwaysVisible ? { template: rendered.template, content: true } : { template: nothing, content: false }
				}
				return rendered
			}),
		)
	}

	const sections = await renderForm(form, sectionWrapper)
	return { template: html`${sections.map((s) => s.template)}`, content: sections.some((s) => s.content) }
}

export const render: Renderer = async (
	form,
	props,
	formsValueContainer,
	translationProvider,
	revisionsFilter,
	ownersProvider,
	optionsProvider,
	actionListener,
	languages,
	readonly,
	displayMetadata,
	sectionWrapper,
) => {
	const rendered = await renderInternal(
		form,
		props,
		formsValueContainer,
		translationProvider,
		revisionsFilter,
		ownersProvider,
		optionsProvider,
		actionListener,
		languages,
		readonly,
		displayMetadata,
		sectionWrapper,
	)
	// The whole-form node always carries a template (`html`${sections}``); the `nothing` arm of
	// `RenderedNode` only ever describes a dropped child, so the public contract stays a bare template.
	return rendered.template as TemplateResult
}
