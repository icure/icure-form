import { html } from 'lit'
import { property } from 'lit/decorators.js'
import './icure-date-picker'
import { VersionedMeta, VersionedValue } from '../text-field/icure-text-field'
import { Content } from '@icure/api'
import { ValuedField } from '../../../common/valuedField'
export class DatePicker extends ValuedField<string, VersionedValue[]> {
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined

	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`<icure-date-picker-field
				.actionManager="${this.actionManager}"
				.editable="${this.editable}"
				labelPosition=${this.labelPosition}
				label="${this.label}"
				.labels="${this.labels}"
				value=${this.value}
				.valueProvider=${() => versionedValue}
				.handleValueChanged=${this.handleValueChanged}
				.translationProvider=${this.translationProvider}
				defaultLanguage="${this.defaultLanguage}"
			></icure-date-picker-field>`
		})
	}
}

customElements.define('icure-form-date-picker', DatePicker)
