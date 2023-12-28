import { html, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import './icure-dropdown'
import { CodeStub, HealthcareParty } from '@icure/api'
import { Field, OptionCode } from '../../../common'

export class DropdownField extends Field {
	@property() ownersProvider: (speciality: string[]) => HealthcareParty[] = () => []
	@property() optionsProvider: (searchTerm?: string) => Promise<(OptionCode | CodeStub)[]> = async () => []

	render(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map(
			(versionedValue) =>
				html`
					<icure-dropdown-field
						.actionManager="${this.actionManager}"
						.editable="${this.editable}"
						.translate="${this.translate}"
						.valueProvider=${() => versionedValue}
						.handleValueChanged=${this.handleValueChanged}
						.optionsProvider=${this.optionsProvider}
						.translationProvider=${this.translationProvider}
						.ownersProvider=${this.ownersProvider}
						defaultLanguage="${this.defaultLanguage}"
					></icure-dropdown-field>
				`,
		)
	}
}

customElements.define('icure-form-dropdown-field', DropdownField)
