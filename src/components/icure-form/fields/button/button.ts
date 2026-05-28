import { css, CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'

import '../../../icure-label'

export class Button extends LitElement {
	//override
	static get styles(): CSSResultGroup[] {
		return [
			css`
				:host {
				}
			`,
		]
	}

	@property() label?: string
	@property() visible = true
	@property() defaultLanguage = 'en'
	@property() translationProvider: (language: string, text: string) => string = (language, text) => text
	@property() actionListener: (event: string, payload: unknown, domEvent?: Event) => void = () => undefined
	@property() event: string
	@property() payload: unknown

	render(): TemplateResult {
		return html`<icure-button
			.visible="${this.visible}"
			label="${this.label}"
			.translationProvider="${this.translationProvider}"
			.defaultLanguage="${this.defaultLanguage}"
			.actionListener="${this.actionListener}"
			.event="${this.event}"
			.payload="${this.payload}"
		></icure-button>`
	}
}
