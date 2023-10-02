import { html, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import './iqr-dropdown'
import { CodeStub, HealthcareParty } from '@icure/api'
import { OptionCode, OptionsField } from '../../../common'
import { VersionedValue } from '../text-field'

export class DropdownField extends OptionsField<string, VersionedValue[]> {
	@property() ownersProvider: (speciality: string[]) => HealthcareParty[] = () => []

	render(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map(
			(versionedValue) =>
				html`
					<iqr-dropdown-field
						.actionManager="${this.actionManager}"
						.editable="${this.editable}"
						label="${this.label}"
						.translate="${this.translate}"
						.sortable="${this.sortable}"
						.sortOptions="${this.sortOptions}"
						.options="${this.options}"
						value="${this.value}"
						.valueProvider=${() => versionedValue}
						.handleValueChanged=${this.handleValueChanged}
						.labelPosition=${this.labelPosition}
						.optionsProvider=${this.optionsProvider}
						.translationProvider=${this.translationProvider}
						.ownersProvider=${this.ownersProvider}
						defaultLanguage="${this.defaultLanguage}"
						.codifications=${this.codifications}
					></iqr-dropdown-field>
				`,
		)
	}

	public async firstUpdated(): Promise<void> {
		if (this.options === undefined || this.options.length === 0) {
			this.options = ((await this.fetchInitialsOptions()) as (OptionCode | CodeStub)[]) || []
		}
	}
}

customElements.define('iqr-form-dropdown-field', DropdownField)
