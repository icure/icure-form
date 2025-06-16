import { html, nothing, TemplateResult } from 'lit'
import { handleSingleMetadataChanged, handleSingleValueChanged, overlay, singleValueProvider } from '../utils'

import { Field } from '../../../common'

// @ts-ignore
import overlayCss from '../../../common/styles/overlay.scss'

export class DateTimePicker extends Field {
	static get styles() {
		return [overlayCss]
	}

	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`<icure-text-field
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					label="${this.label}"
					.displayedLabels="${this.displayedLabels}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
					schema="date-time"
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${this.translationProvider}
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetadataChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
				></icure-text-field>
				${this.loading ? overlay() : nothing} `
		})
	}
}
