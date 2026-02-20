import { property, state } from 'lit/decorators.js'
import { LitElement, TemplateResult } from 'lit'
import { FieldMetadata, FieldValue, Labels, pteq } from '../model'
import { Suggestion, Version, VersionedData } from '../../generic'
import { Task } from '@lit/task'
import { PropertyValues } from '@lit/reactive-element'

/**
 * Base class for all fields.
 */
export abstract class Field extends LitElement {
	/**
	 * The label of the field. This is a unique per form property that is used to create data in the formValuesContainer.
	 */
	@property() label: string

	/**
	 * The labels of the field. These are the labels that will be displayed in the UI.
	 * Several labels can be displayed at once
	 */
	@property() displayedLabels: Labels = {}

	/**
	 * Extra styles applied to the field.
	 */
	@property() styleOptions: { [key: string]: unknown }

	/**
	 * Translate labels and options
	 */
	@property() translate = true
	/**
	 * Iso code of the default language
	 */
	@property() defaultLanguage = 'en'

	/**
	 * Iso code and names of the supported languages
	 */
	@property() languages: { [iso: string]: string } = {}

	@property() translationProvider: (language: string, text: string) => string = (language, text) => text

	/**
	 * Provides the value of the field.
	 */
	@property() defaultValueProvider?: () => FieldValue = undefined
	@property() valueProvider?: () => VersionedData<FieldValue> = undefined
	@property() validationErrorsProvider?: () => Promise<[FieldMetadata, string] | null>[] = undefined
	@property() ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => []
	@property() metadataProvider?: (id: string, revisions: (string | null)[]) => VersionedData<FieldMetadata> = undefined
	@property() handleValueChanged?: (label: string, language: string, value?: FieldValue, id?: string) => string | undefined = undefined
	@property() handleMetadataChanged?: (metadata: FieldMetadata, id?: string) => string | undefined = undefined

	@property() public visible = true
	@property() readonly = false
	@property() displayMetadata = false

	@state() selectedLanguage?: string = undefined
	@state() selectedRevision?: string

	private latestValues?: VersionedData<FieldValue>
	private latestMetadata?: { [id: string]: Version<FieldMetadata>[] }

	_asyncTask = new Task(this, {
		task: async () => {
			if (!this.validationErrorsProvider) return []
			const results = await Promise.all(this.validationErrorsProvider())
			return results.filter((r): r is [FieldMetadata, string] => r != null)
		},
		args: () => [],
	})

	language(): string {
		return (this.translate ? this.selectedLanguage ?? this.defaultLanguage : this.defaultLanguage) ?? 'en'
	}

	shouldUpdate(changedProperties: PropertyValues) {
		changedProperties.delete('handleValueChanged')
		changedProperties.delete('handleMetadataChanged')
		changedProperties.delete('validationErrorsProvider')

		if (changedProperties.has('valueProvider')) {
			const newValues = this.valueProvider?.() ?? {}
			if (this.versionedValuesEqual(this.latestValues ?? {}, newValues)) {
				changedProperties.delete('valueProvider')
			}
		}

		if (changedProperties.has('metadataProvider')) {
			const values = this.latestValues ?? this.valueProvider?.() ?? {}
			const newMetadata = this.metadataProvider ? this.collectMetadata(values, this.metadataProvider) : {}
			if (this.versionedMetadataEqual(this.latestMetadata ?? {}, newMetadata)) {
				changedProperties.delete('metadataProvider')
			}
		}

		return changedProperties.size > 0
	}

	private versionedValuesEqual(a: VersionedData<FieldValue>, b: VersionedData<FieldValue>): boolean {
		const aKeys = Object.keys(a)
		const bKeys = Object.keys(b)
		if (aKeys.length !== bKeys.length) return false
		return aKeys.every((k) => {
			const av = a[k]?.[0]?.value
			const bv = b[k]?.[0]?.value
			return this.fieldValueEqual(av, bv)
		})
	}

	private fieldValueEqual(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
		if (a === b) return true
		if (!a || !b) return false
		const aLangs = Object.keys(a.content)
		const bLangs = Object.keys(b.content)
		if (aLangs.length !== bLangs.length) return false
		if (!aLangs.every((l) => pteq(a.content[l], b.content[l]))) return false
		const aCodes = a.codes ?? []
		const bCodes = b.codes ?? []
		return aCodes.length === bCodes.length && aCodes.every((c, i) => c.id === bCodes[i].id)
	}

	private versionedMetadataEqual(a: { [id: string]: Version<FieldMetadata>[] }, b: { [id: string]: Version<FieldMetadata>[] }): boolean {
		const aKeys = Object.keys(a)
		const bKeys = Object.keys(b)
		if (aKeys.length !== bKeys.length) return false
		return aKeys.every((k) => {
			const am = a[k]?.[0]?.value
			const bm = b[k]?.[0]?.value
			return this.fieldMetadataEqual(am, bm)
		})
	}

	private fieldMetadataEqual(a: FieldMetadata | undefined, b: FieldMetadata | undefined): boolean {
		if (a === b) return true
		if (!a || !b) return false
		return (
			a.label === b.label &&
			a.index === b.index &&
			a.valueDate === b.valueDate &&
			a.owner === b.owner &&
			(a.tags?.length ?? 0) === (b.tags?.length ?? 0) &&
			(a.tags ?? []).every((t, i) => t.id === b.tags?.[i]?.id)
		)
	}

	private collectMetadata(values: VersionedData<FieldValue>, metadataProvider: (id: string, revisions: (string | null)[]) => VersionedData<FieldMetadata>): { [id: string]: Version<FieldMetadata>[] } {
		return Object.entries(values).reduce((acc, [id, versions]) => {
			const revisions = versions.map((v) => v.revision)
			acc[id] = metadataProvider(id, revisions)?.[id] ?? []
			return acc
		}, {} as { [id: string]: Version<FieldMetadata>[] })
	}

	protected handleSingleValueChanged = (id?: string) => this.handleValueChanged && ((label: string, language: string, value: FieldValue) => this.handleValueChanged?.(label, language, value, id))

	protected handleSingleMetadataChanged = (id?: string) => this.handleMetadataChanged && ((metadata: FieldMetadata) => this.handleMetadataChanged?.(metadata, id))

	protected singleValueProvider = (id?: string) => (this.valueProvider && id ? () => ({ [id]: this.valueProvider?.()?.[id] }) : () => ({}))

	render() {
		this.latestValues = this.valueProvider?.()
		if (this.latestValues && this.metadataProvider) {
			this.latestMetadata = this.collectMetadata(this.latestValues, this.metadataProvider)
		}

		return this.validationErrorsProvider?.length
			? this._asyncTask.render({
					pending: () => this.renderSync({ validationErrors: [] }),
					complete: (validationErrors: [FieldMetadata, string][]) => this.renderSync({ validationErrors }),
					error: () => this.renderSync({ validationErrors: [] }),
			  })
			: this.renderSync({ validationErrors: [] })
	}

	abstract renderSync({}: { validationErrors: [FieldMetadata, string][] }): TemplateResult | TemplateResult[] | undefined
}
