import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { Suggestion } from '../../../../generic'

export class TokenField extends Field {
	@property() multiline: boolean | string = false
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() lines = 1
	override renderSync(): TemplateResult {
		return html`<icure-text-field
			.readonly="${this.readonly}"
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			.defaultLanguage="${this.defaultLanguage}"
			schema="tokens-list"
			.handleMetadataChanged=${this.handleMetadataChanged}
			.handleValueChanged=${this.handleValueChanged}
			.metadataProvider=${this.metadataProvider}
			.ownersProvider=${this.ownersProvider}
			.suggestionProvider=${this.suggestionProvider}
			.translationProvider=${this.translationProvider}
			.validationErrorsProvider=${this.validationErrorsProvider}
			.valueProvider=${this.valueProvider}
		></icure-text-field>`
	}
}
