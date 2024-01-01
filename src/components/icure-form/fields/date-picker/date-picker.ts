import { html } from 'lit'
import { handleSingleMetadataChanged, handleSingleValueChanged, singleValueProvider } from '../utils'
import { Field } from '../../../common'

import '../../../icure-date-picker'

export class DatePicker extends Field {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`<icure-date-picker-field
				.readonly="${this.readonly}"
				label="${this.label}"
				.displayedLabels="${this.displayedLabels}"
				defaultLanguage="${this.defaultLanguage}"
				schema="decimal"
				.translationProvider=${this.translationProvider}
				.valueProvider=${singleValueProvider(this.valueProvider, id)}
				.metaProvider=${this.metadataProvider}
				.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
				.handleMetaChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
			></icure-date-picker-field>`
		})
	}
}
customElements.define('icure-form-date-picker', DatePicker)
