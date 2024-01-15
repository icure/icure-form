import { html } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'

export class ItemsListField extends Field {
	@property() multiline: boolean | string = false
	@property() lines = 1
	render() {
		return html`<icure-text-field
			.readonly="${this.readonly}"
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			defaultLanguage="${this.defaultLanguage}"
			displayedLanguage="${this.displayedLanguage}"
			schema="items-list-field"
			.valueProvider=${() => this.valueProvider}
			.metaProvider=${() => this.metadataProvider}
			.handleValueChanged=${this.handleValueChanged}
			.translationProvider=${this.translationProvider}
			.handleMetaChanged=${this.handleMetadataChanged}
		></icure-text-field>`
	}
}
