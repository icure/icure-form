import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { Suggestion } from '../../../../generic'

export class ItemsListField extends Field {
	@property() multiline: boolean | string = false
	@property() lines = 1
	@property() suggestionProvider?: (terms: string[]) => Promise<Suggestion[]>
	@property() linksProvider?: (sug: Suggestion) => Promise<{ href: string; title: string } | undefined>
	@property() codeColorProvider?: (type: string, code: string) => string
	override renderSync(): TemplateResult {
		return html`<icure-text-field
			schema="items-list"
			.readonly="${this.readonly}"
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			.defaultLanguage="${this.defaultLanguage}"
			.languages="${this.languages}"
			?suggestions=${!!this.suggestionProvider}
			?links=${!!this.linksProvider}
			.suggestionProvider=${this.suggestionProvider}
			.linksProvider=${this.linksProvider}
			.codeColorProvider=${this.codeColorProvider}
			.ownersProvider=${this.ownersProvider}
			.valueProvider=${this.valueProvider}
			.validationErrorsProvider=${this.validationErrorsProvider}
			.metadataProvider=${this.metadataProvider}
			.handleValueChanged=${this.handleValueChanged}
			.translationProvider=${this.translationProvider}
			.handleMetadataChanged=${this.handleMetadataChanged}
		></icure-text-field>`
	}
}
