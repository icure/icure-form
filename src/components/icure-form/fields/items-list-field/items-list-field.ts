import { html } from 'lit'
import { Field } from '../../../common'

import '../../../icure-text-field'

export class ItemsListField extends Field {
	render() {
		return html`<icure-text-field
			.readonly="${this.readonly}"
			label="${this.label}"
			.displayedLabels="${this.displayedLabels}"
			defaultLanguage="${this.defaultLanguage}"
			schema="items-list-field"
			.valueProvider=${() => this.valueProvider}
			.metaProvider=${() => this.metadataProvider}
			.handleValueChanged=${this.handleValueChanged}
			.translationProvider=${this.translationProvider}
			.handleMetaChanged=${this.handleMetadataChanged}
		></icure-text-field>`
	}
}

customElements.define('icure-form-items-list-field', ItemsListField)
