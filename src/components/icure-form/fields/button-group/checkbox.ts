import { html } from 'lit'
import '../text-field/icure-text-field'
import '../../../icure-radio-button-group'
import { CodeStub } from '@icure/api'

export class CheckBox extends OptionsField<string, VersionedValue[]> {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue) => {
			return html`
				<icure-radio-button
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

customElements.define('icure-form-checkbox', CheckBox)
