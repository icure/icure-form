import { html } from 'lit'
import '../text-field/icure-text-field'
import { VersionedValue } from '../text-field/icure-text-field'
import { ValuedField } from '../../../common/valuedField'

export class MultipleChoice extends ValuedField<string, VersionedValue[]> {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`<icure-text-field
				.actionManager="${this.actionManager}"
				.editable="${this.editable}"
				.labels="${this.labels}"
				value="${this.value}"
				labelPosition=${this.labelPosition}
				label="${this.label}"
				defaultLanguage="${this.defaultLanguage}"
				.valueProvider=${() => versionedValue}
				.handleValueChanged=${this.handleValueChanged}
				.translationProvider=${this.translationProvider}
			></icure-text-field>`
		})
	}
}

customElements.define('icure-form-multiple-choice', MultipleChoice)
