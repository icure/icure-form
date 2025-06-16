import { html, nothing, TemplateResult } from 'lit'
import { RendererProps } from '../index'
import { fieldValuesProvider, getValidationErrorProvider, handleMetadataChangedProvider, handleValueChangedProvider } from '../../../../utils/fields-values-provider'
import { Field, FieldMetadata, FieldValue, Form, Group, SortOptions, Subform } from '../../../model'
import { FormValuesContainer, Suggestion } from '../../../../generic'

import { defaultTranslationProvider } from '../../../../utils/languages'
import { getLabels } from '../../../common/utils'
import { filterAndSortOptionsFromFieldDefinition, sortSuggestions } from '../../../../utils/code-utils'

import './form-selection-button'
import { currentDate, currentDateTime, currentTime } from '../../../../utils/dates'

async function allNext<T>(
	subGenerators: (AsyncGenerator<[T, boolean], void, unknown> | undefined)[],
	cache: T[],
): Promise<{
	done: boolean
	subElements: Awaited<typeof nothing | T>[]
}> {
	let done = true
	const subElements = await Promise.all(
		subGenerators.map(async (sg, idx) => {
			if (!sg) {
				return nothing
			}
			if (cache[idx]) {
				return cache[idx]
			}
			const itv = await sg.next()
			if (itv.value) {
				const [value, isStale] = itv.value
				if (isStale) {
					cache[idx] = value
				}
				done = done && isStale
				return value
			} else {
				return nothing
			}
		}),
	)
	return { done, subElements }
}

export async function* render(
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => [],
	optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>,
	actionListener: (event: string, payload: unknown) => void = () => undefined,
	languages?: { [iso: string]: string },
	readonly?: boolean,
	displayMetadata?: boolean,
	sectionWrapper?: (index: number, section: () => Promise<TemplateResult>) => Promise<TemplateResult>,
): AsyncGenerator<[TemplateResult<1>, boolean], void, unknown> {
	async function* renderPotentiallyReadonlyField(fg: Field, getHtml: (readonly: boolean) => TemplateResult<1>): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		if (formsValueContainer?.isFieldBeingComputed(fg.label())) {
			yield [getHtml(true), true]
		} else if (fg.computedProperties?.readonly) {
			const readonlyPromise = formsValueContainer?.compute(fg.computedProperties.readonly)
			yield [getHtml(true), false]
			const finalResult = getHtml(!!readonlyPromise ? await (readonlyPromise as Promise<boolean>) : false)
			while (true) {
				yield [finalResult, true]
			}
		} else {
			const finalResult = getHtml(readonly ?? fg.readonly ?? false)
			while (true) {
				yield [finalResult, true]
			}
		}
	}

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

	async function* renderGroup(fg: Group, fgSpan: number, level: number): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		const subGenerators = fg.fields?.map((fieldOrGroup: Field | Group) => renderFieldGroupOrSubform(fieldOrGroup, level + 1)) ?? []
		const cache: (TemplateResult<1> | typeof nothing)[] = []
		while (true) {
			const { done, subElements } = await allNext(subGenerators, cache)
			const filteredSubElements = subElements.filter((x) => !!x && x !== nothing)

			yield [
				filteredSubElements.length
					? html` <div class="${['group', fg.borderless ? undefined : 'bordered'].filter((x) => !!x).join(' ')}" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
							${fg.borderless ? nothing : html` <div>${h(level, '', html`${fg.group}`)}</div>`}
							<div class="icure-form">${filteredSubElements}</div>
					  </div>`
					: nothing,
				done,
			] as [TemplateResult<1> | typeof nothing, boolean]
		}
	}

	async function* renderSubform(fg: Subform, fgSpan: number, level: number): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		async function getHtml(children: [FormValuesContainer<FieldValue, FieldMetadata>, Form | undefined, TemplateResult<1> | typeof nothing][]) {
			return html`<div class="subform" style="${calculateFieldOrGroupSize(fgSpan, 1)}">
				<div class="subform__heading">
					${h(level, 'subform__heading__title', html`${(props.language && fg.shortLabel ? tp?.(props.language, fg.shortLabel) : fg.shortLabel) ?? ''}`)}
					${readonly
						? nothing
						: html`<form-selection-button
								.label="${fg.labels.add ?? 'Add subform'}"
								.forms="${Object.entries(fg.forms)}"
								.formAdded="${(form: Form) => {
									form.id && formsValueContainer?.addChild(fg.id, form.id, fg.shortLabel ?? '')
								}}"
								.translationProvider="${tp}"
								.language="${props.language}"
						  ></form-selection-button>`}
				</div>
				${await Promise.all(
					children?.map(async ([child, childForm, renderedChildForm]) => {
						const title = childForm?.form ?? childForm?.description
						const localisedTitle = (title && tp && props.language ? tp?.(props.language, title) : title) ?? ''
						const localisedRemove = (fg.labels.remove && tp && props.language ? tp?.(props.language, fg.labels.remove) : fg.labels.remove) ?? 'Remove'

						return html`
							<div class="subform__child">
								<h3 class="subform__child__title">${localisedTitle}</h3>
								${renderedChildForm} ${readonly ? nothing : html` <button class="subform__removeBtn" @click="${() => formsValueContainer?.removeChild?.(child)}">${localisedRemove}</button>`}
							</div>
						`
					}),
				)}
			</div>`
		}

		const children = (await formsValueContainer?.getChildren())?.filter((c) => c.getLabel() === fg.id)
		const tp = translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))

		const subGenerators = (children ?? []).map((child) => {
			const childForm = Object.values(fg.forms).find((f) => f.id === child.getFormId())
			return childForm ? render(childForm, props, child, translationProvider, ownersProvider, optionsProvider, actionListener, languages, readonly, displayMetadata) : undefined
		})

		const cache: (TemplateResult<1> | typeof nothing)[] = []
		while (true) {
			const { done, subElements } = await allNext(subGenerators, cache)
			yield [await getHtml((children ?? []).map((child, idx) => [child, Object.values(fg.forms).find((f) => f.id === child.getFormId()), subElements[idx]])), done] as [TemplateResult<1>, boolean]
		}
	}

	async function* renderTextField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
			const loading = formsValueContainer?.isFieldBeingComputed(fg.label())
			return html`<icure-form-text-field
				class="icure-form-field ${loading ? 'loading' : ''}"
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
				.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
				.codeColorProvider=${fg.options?.codeColorProvider}
				.linkColorProvider=${fg.options?.linkColorProvider}
				.codeContentProvider=${fg.options?.codeContentProvider}
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
				.loading="${loading}"
			></icure-form-text-field>`
		})
	}

	async function* renderTokenField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-token-field>`
		})
	}

	async function* renderItemsListField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-items-list-field>`
		})
	}

	async function* renderMeasureField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-measure-field>`
		})
	}

	async function* renderNumberField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
			const loading = formsValueContainer?.isFieldBeingComputed(fg.label())
			return html`<icure-form-number-field
				style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
				class="icure-form-field ${loading ? 'loading' : ''}"
				label="${fg.field}"
				.displayedLabels="${getLabels(fg)}"
				.displayMetadata="${displayMetadata}"
				value="${fg.value}"
				.defaultLanguage="${props.language}"
				.translationProvider=${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}
				.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
				.loading="${loading}"
			></icure-form-number-field>`
		})
	}

	async function* renderDatePicker(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
			return html` <icure-form-date-picker
				style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
				class="icure-form-field"
				label="${fg.field}"
				.displayedLabels="${getLabels(fg)}"
				.displayMetadata="${displayMetadata}"
				value="${fg.now ? currentDate() : fg.value}"
				.defaultLanguage="${props.language}"
				.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
				.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider="${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}"
				.handleValueChanged="${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}"
				.handleMetadataChanged="${handleMetadataChangedProvider(formsValueContainer)}"
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-date-picker>`
		})
	}

	async function* renderTimePicker(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-time-picker>`
		})
	}

	async function* renderDateTimePicker(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-date-time-picker>`
		})
	}

	async function* renderDropdownField(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-dropdown-field>`
		})
	}

	async function* renderRadioButtons(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider=${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}
				.handleValueChanged=${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}
				.handleMetadataChanged=${handleMetadataChangedProvider(formsValueContainer)}
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-radio-button>`
		})
	}

	async function* renderCheckboxes(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield* renderPotentiallyReadonlyField(fg, function (readonly: boolean) {
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
				.valueProvider="${formsValueContainer && fieldValuesProvider(formsValueContainer, fg)}"
				.metadataProvider="${formsValueContainer && formsValueContainer.getMetadata.bind(formsValueContainer)}"
				.handleValueChanged="${handleValueChangedProvider(formsValueContainer, fg, props.defaultOwner)}"
				.handleMetadataChanged="${handleMetadataChangedProvider(formsValueContainer)}"
				.styleOptions="${fg.styleOptions}"
				.readonly="${readonly}"
			></icure-form-checkbox>`
		})
	}

	async function* renderButton(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		function getHtml(payload: unknown, event: string) {
			return html`<icure-form-button
				style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
				class="icure-form-button"
				label="${fg.shortLabel ?? fg.field}"
				.defaultLanguage="${props.language}"
				.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
				.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
				.actionListener="${actionListener}"
				.event="${event}"
				.payload="${payload}"
				.styleOptions="${fg.styleOptions}"
			></icure-form-button>`
		}

		if (fg.computedProperties?.readonly || fg.computedProperties?.event) {
			yield [getHtml(true, fg.event ?? 'submit'), false]

			const [payload, event] = (await Promise.all([
				fg.payload !== undefined ? fg.payload : fg.computedProperties?.payload ? !(await formsValueContainer?.compute(fg.computedProperties?.payload)) : undefined,
				fg.event !== undefined ? fg.event : fg.computedProperties?.event ? !(await formsValueContainer?.compute(fg.computedProperties?.event)) : 'submit',
			])) as [string | undefined, string]

			yield [getHtml(payload, event), true]
		} else {
			yield [getHtml(true, fg.event ?? 'submit'), true]
		}
	}

	async function* renderLabel(fgSpan: number, fgRowSpan: number, fg: Field): AsyncGenerator<[TemplateResult<1>, boolean], void, unknown> {
		yield [
			html`<icure-form-label
				style="${calculateFieldOrGroupSize(fgSpan, fgRowSpan)}"
				class="icure-form-field"
				.defaultLanguage="${props.language}"
				labelPosition="${props.labelPosition}"
				label="${fg.shortLabel ?? fg.field}"
				.translationProvider="${translationProvider ?? (form.translations && defaultTranslationProvider(form.translations))}"
				.validationErrorsProvider="${getValidationErrorProvider(formsValueContainer, fg)}"
				.styleOptions="${fg.styleOptions}"
			></icure-form-label>`,
			true,
		]
	}

	async function* dummyGen(): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		yield [html``, true]
	}

	async function* renderFieldGroupOrSubform(fg: Field | Group | Subform, level: number): AsyncGenerator<[TemplateResult<1> | typeof nothing, boolean], void, unknown> {
		if (!fg) {
			yield Promise.resolve([nothing, true] as [typeof nothing, boolean])
			return
		}
		const computedProperties = (await Object.keys(fg.computedProperties ?? {})
			.filter((k) => k !== 'value' && k !== 'defaultValue')
			.reduce(async (acc, k) => ({ ...(await acc), [k]: fg.computedProperties?.[k] && (await formsValueContainer?.compute(fg.computedProperties[k])) }), Promise.resolve({}))) as {
			[key: string]: string | number | boolean | undefined
		}
		if (computedProperties['hidden']) {
			yield Promise.resolve([nothing, true] as [typeof nothing, boolean])
			return
		}

		const fgSpan = (computedProperties['span'] ?? fg.span ?? 6) as number
		const fgRowSpan = (computedProperties['rowSpan'] ?? fg.rowSpan ?? 1) as number

		if (fg.clazz === 'group' && fg.fields?.length) {
			yield* renderGroup((fg as Group).copy({ ...computedProperties }), fgSpan, level)
		} else if (fg.clazz === 'subform' && (fg.id || computedProperties['title'])) {
			yield* renderSubform((fg as Subform).copy({ ...computedProperties }), fgSpan, level)
		} else if (fg.clazz === 'field') {
			const field = fg.copy({ ...computedProperties })

			for await (const render of fg.type === 'text-field'
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
				: fg.type === 'action'
				? renderButton(fgSpan, fgRowSpan, field)
				: dummyGen()) {
				yield [html`${render[0]}`, render[1]]
			}
		} else {
			yield [html``, true]
		}
	}

	const calculateFieldOrGroupSize = (span: number, rowSpan: number, fixedWidth?: number | undefined) => {
		if (fixedWidth) return `width: ${fixedWidth}px`
		return `grid-column: span ${span}; ${rowSpan > 1 ? `grid-row: span ${rowSpan}` : ''}`
	}

	async function* renderForm(
		form: Form,
		sectionWrapper: (index: number, section: () => Promise<TemplateResult>) => Promise<TemplateResult>,
	): AsyncGenerator<[TemplateResult<1>, boolean], void, unknown> {
		const sectionGenerators = form.sections.map(async function* (s): AsyncGenerator<[(TemplateResult<1> | typeof nothing)[], boolean], void, unknown> {
			const fieldsGenerator = s.fields.map((fieldOrGroup: Field | Group | Subform) => renderFieldGroupOrSubform(fieldOrGroup, 3))
			const cache: (TemplateResult<1> | typeof nothing)[] = []
			while (true) {
				const { done, subElements } = await allNext(fieldsGenerator, cache)
				yield [subElements, done]
			}
		})

		const cache: (TemplateResult<1> | typeof nothing)[][] = []
		while (true) {
			const { done, subElements } = await allNext(sectionGenerators, cache)
			yield [html`${await Promise.all(subElements.map((section, idx) => sectionWrapper(idx, async () => html` <div class="icure-form">${section}</div>`)))}`, done]
		}
	}

	yield* renderForm(form, sectionWrapper ?? (async (_idx, section) => await section()))
}
