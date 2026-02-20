import { html, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { Suggestion } from '../../../../generic'

export class DropdownField extends Field {
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Suggestion[]> = async () => []

	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-dropdown-field
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					.translate="${this.translate}"
					label="${this.label}"
					.displayedLabels="${this.displayedLabels}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					.valueProvider=${this.singleValueProvider(id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.ownersProvider=${this.ownersProvider}
					.handleValueChanged=${this.handleSingleValueChanged(id)}
					.handleMetadataChanged=${this.handleSingleMetadataChanged(id)}
					.optionsProvider=${this.optionsProvider}
					.translationProvider=${this.translationProvider}
				></icure-dropdown-field>
			`
		})
	}
}
