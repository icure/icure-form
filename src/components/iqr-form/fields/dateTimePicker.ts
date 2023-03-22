import { css, CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators'

import '../../iqr-text-field'
import { Labels, VersionedValue } from '../../iqr-text-field'

export class DateTimePicker extends LitElement {
	@property() label = ''
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
		return html`<iqr-text-field
			.labels="${this.labels}"
			labelPosition=${this.labelPosition}
			label="${this.label}"
			schema="date-time"
			value=${this.value}
			.valueProvider=${this.valueProvider}
		></iqr-text-field>`
	}
}

customElements.define('iqr-form-date-time-picker', DateTimePicker)
