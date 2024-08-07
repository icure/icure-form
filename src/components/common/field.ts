import { property, state } from 'lit/decorators.js'
import { LitElement } from 'lit'
import { FieldMetadata, FieldValue, Labels } from '../model'
import { Suggestion, VersionedData } from '../../generic'

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
	@property() defaultLanguage = 'en'

	/**
	 * Iso code and names of the supported languages
	 */
	@property() languages: { [iso: string]: string } = {}

	@property() translationProvider: (language: string, text: string) => string = (language, text) => text

	/**
	 * Provides the value of the field.
	 */
	@property() valueProvider?: () => VersionedData<FieldValue> = undefined
	@property() validationErrorsProvider?: () => string[] = undefined
	@property() ownersProvider: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]> = async () => []
	@property() metadataProvider?: (id: string, revisions: (string | null)[]) => VersionedData<FieldMetadata> = undefined
	@property() handleValueChanged?: (label: string, language: string, value?: FieldValue, id?: string) => string | undefined = undefined
	@property() handleMetadataChanged?: (metadata: FieldMetadata, id?: string) => string | undefined = undefined

	@property() public visible = true
	@property() readonly = false
	@property() displayMetadata = false

	@state() selectedLanguage?: string = undefined
	@state() selectedRevision?: string

	language(): string {
		return (this.translate ? this.selectedLanguage ?? this.defaultLanguage : this.defaultLanguage) ?? 'en'
	}
}
