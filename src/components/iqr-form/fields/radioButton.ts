import { css, CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import '../../iqr-text-field'
import '../../iqr-radio-button-group'
import { Labels } from '../../iqr-text-field'
import { OptionCode } from '../../common'

export class RadioButton extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() labelPosition?: string = undefined
	@property() labels?: Labels = undefined
	@property() options?: OptionCode[] = []
	@property() value?: string = ''

	static get styles(): CSSResultGroup[] {
		return [
			css`
				:host {
				}
			`,
		]
	}

	render(): TemplateResult {
		return this.skin === 'kendo'
			? html` <iqr-form-radio-button-kendo
					type="radio"
					.labels="${this.labels}"
					labelPosition="${this.labelPosition}"
					label="${this.label}"
					.options="${this.options}"
					value="${this.value}"
			  ></iqr-form-radio-button-kendo>`
			: html` <iqr-form-radio-button
					type="radio"
					.labels="${this.labels}"
					labelPosition="${this.labelPosition}"
					label="${this.label}"
					.options="${this.options}"
					value="${this.value}"
			  ></iqr-form-radio-button>`
	}
}

customElements.define('iqr-radio-button', RadioButton)
