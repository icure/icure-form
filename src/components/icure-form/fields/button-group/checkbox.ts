import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { handleSingleMetadataChanged, handleSingleValueChanged, singleValueProvider } from '../utils'
import { property } from 'lit/decorators.js'
import { Code } from '../../../model'

export class CheckBox extends Field {
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]> = async () => []
	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-button-group
					type="checkbox"
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					.displayedLabels="${this.displayedLabels}"
					label="${this.label}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					.translate="${this.translate}"
					.ownersProvider=${this.ownersProvider}
					.optionsProvider=${this.optionsProvider}
					.translationProvider=${this.translationProvider}
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetadataChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
					.styleOptions=${this.styleOptions}
				></icure-button-group>
			`
		})
	}
}
