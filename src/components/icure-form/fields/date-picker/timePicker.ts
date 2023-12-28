import { html } from 'lit'

import '../text-field/icure-text-field'
import { Field } from '../../model'
export class TimePicker extends Field {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`
				<icure-text-field
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
				></icure-text-field>
			`
		})
	}
}

customElements.define('icure-form-time-picker', TimePicker)
