import { css, CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'

import '../../iqr-text-field'
import { Labels, VersionedValue } from '../../iqr-text-field'

export class TimePicker extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() labelPosition?: string = undefined
	@property() valueProvider?: () => VersionedValue[] = undefined
	@property() labels?: Labels = undefined
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
			? html` <iqr-text-field-kendo
					.labels="${this.labels}"
					labelPosition=${this.labelPosition}
					label="${this.label}"
					schema="time"
					.valueProvider=${this.valueProvider}
					value="${this.value}"
			  ></iqr-text-field-kendo>`
			: html` <iqr-text-field
					.labels="${this.labels}"
					labelPosition=${this.labelPosition}
					label="${this.label}"
					schema="time"
					.valueProvider=${this.valueProvider}
					value="${this.value}"
			  ></iqr-text-field>`
	}
}

customElements.define('iqr-form-time-picker', TimePicker)
