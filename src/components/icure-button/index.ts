import { html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { icureFormLogging } from '../../index'

export class IcureButton extends LitElement {
	@property() label?: string
	@property() labelPosition?: string
	@property() visible = true
	@property() defaultLanguage = 'en'
	@property() translationProvider?: (language: string, text: string) => string = (language, text) => text
	@property() actionListener: (event: string, payload: unknown) => void = () => undefined
	@property() event: string
	@property() payload: unknown

	static get styles() {
		return [baseCss]
	}

	render() {
		if (!this.visible) {
			return html``
		}
		if (icureFormLogging) {
			console.log(`Rendering button ${this.label}`)
		}
		return html`<div class="icure-button" style="button" @click="${() => this.actionListener(this.event, this.payload)}">
			${this.label ? this.translationProvider?.(this.defaultLanguage, this.label) ?? this.label : this.label ?? ''}
		</div>`
	}
}
