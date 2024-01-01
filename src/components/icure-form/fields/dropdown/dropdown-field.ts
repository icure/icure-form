import { html, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { handleSingleMetadataChanged, handleSingleValueChanged, singleValueProvider } from '../utils'
import { Code } from '../../../model'

import '../../../icure-dropdown-field'

export class DropdownField extends Field {
	@property() ownersProvider: (speciality: string[]) => { id: string; name: string }[] = () => []
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]> = async () => []

	render(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-dropdown-field
					.readonly="${this.readonly}"
					.translate="${this.translate}"
					label="${this.label}"
					.displayedLabels="${this.displayedLabels}"
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.metaProvider=${this.metadataProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetaChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
					.optionsProvider=${this.optionsProvider}
					.translationProvider=${this.translationProvider}
					.ownersProvider=${this.ownersProvider}
					defaultLanguage="${this.defaultLanguage}"
				></icure-dropdown-field>
			`
		})
	}
}

customElements.define('icure-form-dropdown-field', DropdownField)
