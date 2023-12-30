import { html } from 'lit'
import '../text-field/icure-text-field'
import { Field } from '../../../common'

export class TokenField extends Field {
	render() {
		return html`<icure-text-field
			.actionManager="${this.actionManager}"
			.readonly="${this.readonly}"
			label="${this.label}"
			labels="${this.displayedLabels}"
			defaultLanguage="${this.defaultLanguage}"
			schema="token-field"
			.valueProvider=${() => this.valueProvider}
			.metaProvider=${() => this.metadataProvider}
			.handleValueChanged=${this.handleValueChanged}
			.translationProvider=${this.translationProvider}
			.handleMetaChanged=${this.handleMetadataChanged}
		></icure-text-field>`
	}
}

customElements.define('icure-form-token-field', TokenField)
