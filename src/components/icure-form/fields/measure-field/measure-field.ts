import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'

export class MeasureField extends Field {
	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-text-field
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					label="${this.label}"
					.displayedLabels="${this.displayedLabels}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					.styleOptions="${this.styleOptions}"
					schema="measure"
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${this.translationProvider}
					.valueProvider=${this.singleValueProvider(id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${this.handleSingleValueChanged(id)}
					.handleMetadataChanged=${this.handleSingleMetadataChanged(id)}
				></icure-text-field>
			`
		})
	}
}
