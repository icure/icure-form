import { html, nothing, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { handleSingleMetadataChanged, handleSingleValueChanged, overlay, singleValueProvider } from '../utils'
import { Suggestion } from '../../../../generic'

// @ts-ignore
import overlayCss from '../../../common/styles/overlay.scss'

export class DropdownField extends Field {
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Suggestion[]> = async () => []

	static get styles() {
		return [overlayCss]
	}

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
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.ownersProvider=${this.ownersProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetadataChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
					.optionsProvider=${this.optionsProvider}
					.translationProvider=${this.translationProvider}
				></icure-dropdown-field>
				${this.loading ? overlay() : nothing}
			`
		})
	}
}
