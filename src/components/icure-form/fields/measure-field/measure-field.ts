import { html } from 'lit'
import { handleSingleMetadataChanged, handleSingleValueChanged, singleValueProvider } from '../utils'
import { Field } from '../../../common'

import '../../../icure-text-field'

export class MeasureField extends Field {
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`
				<icure-text-field
					.readonly="${this.readonly}"
					label="${this.label}"
					.displayedLabels="${this.displayedLabels}"
					defaultLanguage="${this.defaultLanguage}"
					schema="measure"
					.translationProvider=${this.translationProvider}
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.metaProvider=${this.metadataProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetaChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
				></icure-text-field>
			`
		})
	}
}

customElements.define('icure-form-measure-field', MeasureField)
