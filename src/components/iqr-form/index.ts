// Import the LitElement base class and html helper function
import { CSSResultGroup, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import { Form } from './model'

import './fields/textfield'
import './fields/measureField'
import './fields/numberField'
import './fields/datePicker'
import './fields/timePicker'
import './fields/dateTimePicker'
import './fields/multipleChoice'
import './fields/dropdown'
import './fields/radioButton'
import './fields/checkbox'
import './fields/label'
// @ts-ignore
import baseCss from './styles/style.scss'
// @ts-ignore
import kendoCss from './styles/kendo.scss'
import { Renderer } from './renderer'

import { render as renderAsCard } from './renderer/cards'
import { render as renderAsForm } from './renderer/form'
import { FormValuesContainer } from '../iqr-form-loader/formValuesContainer'

// Extend the LitElement base class
class IqrForm extends LitElement {
	@property() form?: Form
	@property() renderer = 'form'
	@property() skin = 'material'
	@property() labelPosition?: string = undefined
	@property() formValuesContainer?: FormValuesContainer = undefined
	@property() formValuesContainerChanged?: (newValue: FormValuesContainer) => void = undefined

	constructor() {
		super()
	}

	connectedCallback() {
		super.connectedCallback()
	}

	disconnectedCallback() {
		super.disconnectedCallback()
	}

	static get styles() {
		return [baseCss]
	}

	render() {
		const renderer: Renderer | undefined = this.renderer === 'form' ? renderAsForm : this.renderer === 'form' ? renderAsCard : undefined

		return renderer && this.form
			? renderer(this.form, this.skin, { labelPosition: this.labelPosition }, this.formValuesContainer, (newValue) => this.formValuesContainerChanged?.(newValue))
			: this.form
			? html`<p>unknown renderer</p>`
			: html`<p>missing form</p>`
	}

	firstUpdated() {
		//Do nothing
	}
}

// Register the new element with the browser.
customElements.define('iqr-form', IqrForm)

export class IqrFormKendo extends IqrForm {
	static get theme(): string {
		return 'kendo'
	}

	static get styles(): CSSResultGroup[] {
		return [...IqrForm.styles, kendoCss]
	}
}
customElements.define('iqr-form-kendo', IqrFormKendo)
