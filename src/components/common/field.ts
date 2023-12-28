import { property } from 'lit/decorators.js'
import { ActionManager, Labels, VersionedData } from '../../models'
import { LitElement } from 'lit'
import { Content } from '@icure/api'
import { StateToUpdate } from '../icure-form/model'

export abstract class Field extends LitElement {
	@property() labels: Labels = {}
	@property() placeholder?: string = ''
	@property() styleOptions: { [key: string]: unknown }

	@property() translate = true
	@property() defaultLanguage?: string = 'en' //todo make an enum
	@property() displayedLanguage?: string = this.defaultLanguage
	@property() translationProvider: (text: string, language?: string) => string = (text) => text
	@property() containerId?: string = undefined
	@property() valueProvider?: () => VersionedData[] = undefined
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleValueChanged?: (id: string | undefined, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() actionManager?: ActionManager
	@property() editable = true
	@property() public displayed = true

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
