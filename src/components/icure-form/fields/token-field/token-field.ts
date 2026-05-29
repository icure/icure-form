import { html, TemplateResult } from 'lit'
import { Field } from '../../../common'
import { property } from 'lit/decorators.js'
import { Suggestion } from '../../../../generic'

export class TokenField extends Field {
	@property() multiline: boolean | string = false
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() lines = 1
	@property({ type: Boolean }) tokenDeleteButton = false
	// When true, a click anywhere on the field fires the host actionListener
	// (fire-and-forget) with the field's `event` name instead of opening the
	// inner ProseMirror editor. The handler is then responsible for updating
	// the values and triggering a re-render.
	@property({ type: Boolean }) delegatedEdition = false
	@property() event?: string
	@property() actionListener?: (event: string, payload: unknown, domEvent?: Event) => void = undefined

	private fireDelegatedAction(e: MouseEvent) {
		if (!this.delegatedEdition || !this.actionListener) return
		e.preventDefault()
		e.stopPropagation()
		// Fire-and-forget: we do not await the callback. The host is expected
		// to mutate the form values and trigger its own re-render afterwards.
		this.actionListener(this.event ?? 'edit', undefined, e)
	}

	override renderSync(): TemplateResult {
		const inner = html`<icure-text-field
			.readonly="${this.readonly || this.delegatedEdition}"
			label="${this.label}"
			.multiline="${this.multiline}"
			.lines="${this.lines}"
			.displayedLabels="${this.displayedLabels}"
			.defaultLanguage="${this.defaultLanguage}"
			.tokenDeleteButton="${this.tokenDeleteButton && !this.delegatedEdition}"
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

		// In delegated-edition mode we wrap the (now readonly) editor in a
		// click-capturing div. The wrapper blocks pointer events from reaching
		// ProseMirror and instead fires the host actionListener.
		return this.delegatedEdition
			? html`<div class="delegated-edition" style="cursor: pointer; position: relative;" @click="${(e: MouseEvent) => this.fireDelegatedAction(e)}">
					<div style="pointer-events: none;">${inner}</div>
			  </div>`
			: inner
	}
}
