import { html } from 'lit'
import { property } from 'lit/decorators.js'

import '../text-field/iqr-text-field'
import { VersionedMeta, VersionedValue } from '../text-field/iqr-text-field'
import { Content } from '@icure/api'
import { ValuedField } from '../../../common/valuedField'
export class DateTimePicker extends ValuedField<string, VersionedValue[]> {
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined

	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue, idx) => {
			return html`<iqr-text-field
				.actionManager="${this.actionManager}"
				.editable="${this.editable}"
				.labels="${this.labels}"
				labelPosition=${this.labelPosition}
				label="${this.label}"
				schema="date-time"
				value=${this.value}
				.valueProvider=${() => versionedValue}
				.metaProvider=${() => this.metaProvider?.()?.[idx]}
				.handleValueChanged=${this.handleValueChanged}
				.handleMetaChanged=${this.handleMetaChanged}
				.translationProvider=${this.translationProvider}
				defaultLanguage="${this.defaultLanguage}"
			></iqr-text-field>`
		})
	}
}

customElements.define('iqr-form-date-time-picker', DateTimePicker)
