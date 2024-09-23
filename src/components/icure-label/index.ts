import { html, LitElement } from 'lit'
import { generateLabel } from '../common/utils'
import { property } from 'lit/decorators.js'
// @ts-ignore
import baseCss from '../common/styles/style.scss'

export class IcureLabel extends LitElement {
	@property() label?: string
	@property() labelPosition?: string
	@property() visible = true
	@property() translationProvider: (language: string, text: string) => string = (language, text) => text
	@property() defaultLanguage = 'en'

	static get styles() {
		return [baseCss]
	}

	render() {
		if (!this.visible) {
			return html``
		}
		return html`${generateLabel(this.label ? this.translationProvider(this.defaultLanguage, this.label) : '', this.labelPosition ?? 'float', 'en')}`
	}
}
