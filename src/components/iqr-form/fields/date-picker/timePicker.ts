import { html } from 'lit'

import '../text-field/iqr-text-field'
import { VersionedValue } from '../text-field/iqr-text-field'
import { ValuedField } from '../../../common/valuedField'
export class TimePicker extends ValuedField<string, VersionedValue[]> {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`
				<iqr-text-field
					.actionManager="${this.actionManager}"
					.editable="${this.editable}"
					.labels="${this.labels}"
					labelPosition=${this.labelPosition}
					label="${this.label}"
					schema="time"
					.valueProvider=${() => versionedValue}
					value="${this.value}"
					defaultLanguage="${this.defaultLanguage}"
					.handleValueChanged=${this.handleValueChanged}
					.translationProvider=${this.translationProvider}
				></iqr-text-field>
			`
		})
	}
}

customElements.define('iqr-form-time-picker', TimePicker)
