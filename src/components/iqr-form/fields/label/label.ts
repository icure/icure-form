import { css, CSSResultGroup, html, TemplateResult } from 'lit'
import './iqr-label'
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
		return html`<iqr-label .actionManager="${this.actionManager}" label="${this.label}" labelPosition="${this.labelPosition}"></iqr-label>`
	}
}

customElements.define('iqr-form-label', Label)
