import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { Suggestion } from '../../../../generic'

export class TokenField extends Field {
	@property() multiline: boolean | string = false
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() lines = 1
	@property({ type: Boolean }) tokenDeleteButton = false
	// When true, clicks no longer open the inner ProseMirror editor. Clicking an
	// existing token fires the host actionListener with `{ valueId, content }`
	// (valueId = the token's VersionedData key, i.e. the service id in the iCure
	// bridge); clicking an empty area fires it with `undefined`. The handler is
	// then responsible for mutating the values and triggering a re-render.
	// Delegated click handling lives in the inner <icure-text-field>. This can be
	// combined with `tokenDeleteButton`: the delete cross still removes its token
	// directly, while clicking the token body delegates the edition.
	@property({ type: Boolean }) delegatedEdition = false
	@property() event?: string
	@property() readOnlyEvent?: string
	@property() actionListener?: (event: string, payload: unknown, domEvent?: Event) => void = undefined

	override renderSync(): TemplateResult {
		// Pointer affordance exactly when a click fires the actionListener:
		// delegated edition while editable, readOnlyEvent while readonly.
		const clickable = this.readonly ? this.readOnlyEvent != null : this.delegatedEdition
		return html`<icure-text-field
			class="${clickable ? 'delegated-edition' : ''}"
			style="${clickable ? 'cursor: pointer;' : ''}"
			.readonly="${this.readonly || this.delegatedEdition}"
			.delegatedEdition="${!this.readonly && this.delegatedEdition}"
			.event="${this.event}"
			.readOnlyEvent="${this.readOnlyEvent}"
			.actionListener=${this.actionListener}
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			.displayMetadata="${this.displayMetadata}"
			.defaultLanguage="${this.defaultLanguage}"
			.tokenDeleteButton="${this.tokenDeleteButton}"
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
