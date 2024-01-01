import { property } from 'lit/decorators.js'
import { LitElement } from 'lit'
import { FieldMetadata, FieldValue, Labels } from '../model'
import { VersionedData } from '../../generic'

/**
 * Base class for all fields.
 */
export class Field extends LitElement {
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
	@property() defaultLanguage?: string = 'en'
	/**
	 * Iso code of the default language
	 */
	@property() displayedLanguage?: string = this.defaultLanguage
	@property() translationProvider: (language: string, text: string) => string = (language, text) => text

	/**
	 * Provides the value of the field.
	 */
	@property() valueProvider?: () => VersionedData<FieldValue> = undefined
	@property() metadataProvider?: (id: string, revisions: string[]) => VersionedData<FieldMetadata> = undefined
	@property() handleValueChanged?: (label: string, language: string, value: FieldValue, id?: string) => string | undefined = undefined
	@property() handleMetadataChanged?: (label: string, metadata: FieldMetadata, id?: string) => string | undefined = undefined

	@property() public visible = true
	@property() readonly = false

	language(): string {
		return (this.translate ? this.displayedLanguage : this.defaultLanguage) ?? 'en'
	}
}
