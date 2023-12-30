import { property } from 'lit/decorators.js'
import { LitElement } from 'lit'
import { FieldMetadata, FieldValue, Labels, StateToUpdate } from '../model'
import { ActionManager, VersionedData } from '../../generic'

export abstract class Field extends LitElement {
	/**
	 * The label of the field. This is a unique per form property that is used to create data in the formValuesContainer.
	 */
	@property() label: string

	/**
	 * The labels of the field. These are the labels that will be displayed in the UI.
	 */
	@property() displayedLabels: Labels = {}
	@property() styleOptions: { [key: string]: unknown }

	@property() translate = true
	@property() defaultLanguage?: string = 'en' //todo make an enum
	@property() displayedLanguage?: string = this.defaultLanguage
	@property() translationProvider: (text: string, language?: string) => string = (text) => text

	@property() valueProvider?: () => VersionedData<FieldValue> = undefined
	@property() metadataProvider?: (id: string, revisions: string[]) => VersionedData<FieldMetadata> = undefined
	@property() handleValueChanged?: (label: string, language: string, value: FieldValue, id?: string) => string | undefined = undefined
	@property() handleMetadataChanged?: (label: string, metadata: FieldMetadata, id?: string) => string | undefined = undefined

	@property() public visible = true
	@property() readonly = false

	//This must go away
	@property() actionManager?: ActionManager<FieldValue, FieldMetadata>

	public registerStateUpdater(name: string, stateUpdater?: (state: StateToUpdate, result: any) => void) {
		if (this.actionManager) {
			//this.actionManager.registerStateUpdater(name || '', stateUpdater || this.stateUpdater.bind(this))
		}
	}
	//override

	protected translateText(text: string): string {
		return this.translate ? this.translationProvider(text) : text
	}
}
