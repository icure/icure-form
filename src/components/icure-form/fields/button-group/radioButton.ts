import { html } from 'lit'
import '../text-field/icure-text-field'
import './icure-radio-button-group'
import { VersionedValue } from '../text-field'
import { CodeStub } from '@icure/api'
import { OptionCode, OptionsField } from '../../../common'

export class RadioButton extends OptionsField<string, VersionedValue[]> {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`
				<icure-radio-button
					.actionManager="${this.actionManager}"
					.editable="${this.editable}"
					type="radio"
					.labels="${this.labels}"
					labelPosition="${this.labelPosition}"
					label="${this.label}"
					.options="${this.options}"
					value="${this.value}"
					defaultLanguage="${this.defaultLanguage}"
					.translate="${this.translate}"
					.sortable="${this.sortable}"
					.sortOptions="${this.sortOptions}"
					.valueProvider=${() => versionedValue}
					.handleValueChanged=${this.handleValueChanged}
					.translationProvider=${this.translationProvider}
					.codifications=${this.codifications}
					.optionsProvider=${this.optionsProvider}
					.styleOptions=${this.styleOptions}
				></icure-radio-button>
			`
		})
	}

	public async firstUpdated(): Promise<void> {
		if (this.options === undefined || this.options.length === 0) {
			this.options = ((await this.fetchInitialsOptions()) as (OptionCode | CodeStub)[]) || []
		}
	}
}

customElements.define('icure-form-radio-button', RadioButton)
