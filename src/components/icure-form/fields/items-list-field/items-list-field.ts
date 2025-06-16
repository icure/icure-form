import { html, nothing, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { overlay } from '../utils'

// @ts-ignore
import overlayCss from '../../../common/styles/overlay.scss'

export class ItemsListField extends Field {
	@property() multiline: boolean | string = false
	@property() lines = 1
	static get styles() {
		return [overlayCss]
	}

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
			></icure-text-field>
			${this.loading ? overlay() : nothing} `
	}
}
