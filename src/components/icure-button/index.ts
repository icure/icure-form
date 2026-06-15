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
	@property() actionListener: (event: string, payload: unknown, domEvent?: Event) => void = () => undefined
	@property() event: string
	@property() payload: unknown
	@property({ type: Boolean }) readonly = false

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
		return html`<div
			class="icure-button${this.readonly ? ' icure-button__disabled' : ''}"
			style="button"
			@click="${(e: MouseEvent) => !this.readonly && this.actionListener(this.event, this.payload, e)}"
		>
			${this.label ? this.translationProvider?.(this.defaultLanguage, this.label) ?? this.label : this.label ?? ''}
		</div>`
	}
}
