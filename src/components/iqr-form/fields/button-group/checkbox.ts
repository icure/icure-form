import { html } from 'lit'
import '../text-field/iqr-text-field'
import './iqr-radio-button-group'
import { VersionedValue } from '../text-field'
import { CodeStub } from '@icure/api'
import { OptionCode, OptionsField } from '../../../common'

export class CheckBox extends OptionsField<string, VersionedValue[]> {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`
				<iqr-radio-button
					.actionManager="${this.actionManager}"
					.editable="${this.editable}"
					type="checkbox"
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
				></iqr-radio-button>
			`
		})
	}

	public async firstUpdated(): Promise<void> {
		if (this.options === undefined || this.options.length === 0) {
			this.options = ((await this.fetchInitialsOptions()) as (OptionCode | CodeStub)[]) || []
		}
	}
}

customElements.define('iqr-form-checkbox', CheckBox)
