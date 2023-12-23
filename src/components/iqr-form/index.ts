// Import the LitElement base class and html helper function
import { html } from 'lit'
import { property } from 'lit/decorators.js'

import { Form } from './model'

import './fields/text-field/textfield'
import './fields/measure-field/measureField'
import './fields/number-field/numberField'
import './fields/date-picker/datePicker'
import './fields/date-picker/timePicker'
import './fields/date-picker/dateTimePicker'
import './fields/multiple-choice/multipleChoice'
import './fields/dropdown/dropdown'
import './fields/button-group/radioButton'
import './fields/button-group/checkbox'
import './fields/label/label'
// @ts-ignore
import baseCss from './styles/style.scss'
// @ts-ignore
import kendoCss from './styles/kendo.scss'
import { Renderer } from './renderer'

import { render as renderAsCard } from './renderer/cards'
import { render as renderAsForm } from './renderer/form'
import { CodeStub } from '@icure/api'
import { ActionedField, OptionCode } from '../common'
import { FormValuesContainer } from '../../models'

// Extend the LitElement base class
class IqrForm extends ActionedField {
	@property() form?: Form
	@property() skin = 'material'
	@property() theme = 'default'
	@property() renderer = 'form'
	@property() labelPosition?: string = undefined
	@property() defaultLanguage?: string = undefined
	@property() formValuesContainer?: FormValuesContainer = undefined
	@property() formValuesContainerChanged?: (newValue: FormValuesContainer) => void = undefined
	@property() translationProvider: (text: string) => string = (text) => text
	@property() codesProvider: (codifications: string[], searchTerm: string) => Promise<CodeStub[]> = () => Promise.resolve([])
	@property() optionsProvider: (codifications: string[], searchTerm: string) => Promise<OptionCode[]> = () => Promise.resolve([])

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
		return [baseCss, kendoCss]
	}

	render() {
		const renderer: Renderer | undefined = this.renderer === 'form' ? renderAsForm : this.renderer === 'form' ? renderAsCard : undefined

		if (!this.display) {
			return html``
		}
		return renderer && this.form
			? renderer(
					this.form,
					{ labelPosition: this.labelPosition, defaultLanguage: this.defaultLanguage },
					this.formValuesContainer,
					(newValue) => this.formValuesContainerChanged?.(newValue),
					this.translationProvider,
					() => [],
					this.codesProvider,
					this.optionsProvider,
					this.actionManager,
					this.editable,
			  )
			: this.form
			? html`<p>unknown renderer</p>`
			: html`<p>missing form</p>`
	}

	firstUpdated() {
		if (this.actionManager && this.form && this.formValuesContainer) {
			this.registerStateUpdater(this.form.form || 'main-form')
		}
	}
}

// Register the new element with the browser.
customElements.define('iqr-form', IqrForm)
