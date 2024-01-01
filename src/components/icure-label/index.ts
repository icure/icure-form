import { html, LitElement } from 'lit'
import { generateLabel } from '../common/utils'
import { property } from 'lit/decorators.js'

export class IcureLabel extends LitElement {
	@property() label?: string
	@property() labelPosition?: string
	@property() visible = true

	render() {
		if (!this.visible) {
			return html``
		}
		return html`${generateLabel(this.label ?? '', this.labelPosition ?? 'float', 'en')}`
	}
}
customElements.define('icure-label', IcureLabel)
