import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { Code } from '../../../model'

export class RadioButton extends Field {
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]> = async () => []
	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-button-group
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					type="radio"
					.displayedLabels="${this.displayedLabels}"
					label="${this.label}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					.translate="${this.translate}"
					.optionsProvider=${this.optionsProvider}
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${this.translationProvider}
					.valueProvider=${this.singleValueProvider(id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${this.handleSingleValueChanged(id)}
					.handleMetadataChanged=${this.handleSingleMetadataChanged(id)}
					.styleOptions=${this.styleOptions}
				></icure-button-group>
			`
		})
	}
}
