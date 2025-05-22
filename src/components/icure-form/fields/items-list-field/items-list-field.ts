import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'

export class ItemsListField extends Field {
	@property() multiline: boolean | string = false
	@property() lines = 1
	override renderSync(): TemplateResult {
		return html`<icure-text-field
			schema="items-list"
			.readonly="${this.readonly}"
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			.defaultLanguage="${this.defaultLanguage}"
			.languages="${this.languages}"
			.ownersProvider=${this.ownersProvider}
			.valueProvider=${this.valueProvider}
			.validationErrorsProvider=${this.validationErrorsProvider}
			.metadataProvider=${this.metadataProvider}
			.handleValueChanged=${this.handleValueChanged}
			.translationProvider=${this.translationProvider}
			.handleMetadataChanged=${this.handleMetadataChanged}
		></icure-text-field>`
	}
}
