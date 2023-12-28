import { css, CSSResultGroup, html, TemplateResult } from 'lit'
import './icure-label'
import { LabelizedField } from '../../../common'

export class Label extends LabelizedField {
	//override
	static get styles(): CSSResultGroup[] {
		return [
			css`
				:host {
				}
			`,
		]
	}

	render(): TemplateResult {
		return html`<icure-label .actionManager="${this.actionManager}" label="${this.label}" labelPosition="${this.labelPosition}"></icure-label>`
	}
}

customElements.define('icure-form-label', Label)
