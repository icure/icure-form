import { css, CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'

import '../../../icure-label'

export class Label extends LitElement {
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
	@property() labelPosition?: string
	@property() visible = true

	render(): TemplateResult {
		return html`<icure-label .visible="${this.visible}" label="${this.label}" labelPosition="${this.labelPosition}"></icure-label>`
	}
}

customElements.define('icure-form-label', Label)
