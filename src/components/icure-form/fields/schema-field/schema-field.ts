import { html, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { StencilRef } from '../../../model'
import { StencilProvider } from '../../../icure-schema'

export class SchemaField extends Field {
	@property({ attribute: false }) stencils?: StencilRef[]
	@property() defaultStencil?: string
	@property({ attribute: false }) colors?: string[]
	@property({ attribute: false }) strokeWidths?: number[]
	@property({ attribute: false }) stencilProvider?: StencilProvider

	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-schema
					style="display: block; width: 100%; min-width: 0;"
					.readonly="${this.readonly}"
					.required="${this.required}"
					.fieldIndex="${this.fieldIndex}"
					.displayMetadata="${this.displayMetadata}"
					.displayedLabels="${this.displayedLabels}"
					label="${this.label}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					.translate="${this.translate}"
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${this.translationProvider}
					.valueProvider=${this.singleValueProvider(id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${this.handleSingleValueChanged(id)}
					.handleMetadataChanged=${this.handleSingleMetadataChanged(id)}
					.styleOptions=${this.styleOptions}
					.stencils=${this.stencils}
					.defaultStencil=${this.defaultStencil}
					.colors=${this.colors}
					.strokeWidths=${this.strokeWidths}
					.stencilProvider=${this.stencilProvider}
				></icure-schema>
			`
		})
	}
}
