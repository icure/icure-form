// Import the LitElement base class and html helper function
import { html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import './fields/text-field/text-field'
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
import { render as renderAsForm } from './renderer/form'
import { CodeStub } from '@icure/api'
import { Code, FieldMetadata, FieldValue, Form } from '../model'
import { FormValuesContainer } from '../../generic'

// Extend the LitElement base class
class IcureForm extends LitElement {
	@property() form?: Form
	@property() skin = 'material'
	@property() theme = 'default'
	@property() renderer = 'form'
	@property() visible = true
	@property() readonly = false
	@property() labelPosition?: string = undefined
	@property() defaultLanguage?: string = undefined
	@property() formValuesContainer?: FormValuesContainer<FieldValue, FieldMetadata> = undefined
	@property() formValuesContainerChanged?: (newValue: FormValuesContainer<FieldValue, FieldMetadata>) => void = undefined
	@property() translationProvider: (text: string) => string = (text) => text
	@property() codesProvider: (codifications: string[], searchTerm: string) => Promise<Code[]> = () => Promise.resolve([])
	@property() optionsProvider: (language: string, codifications: string[], searchTerm: string) => Promise<Code[]> = () => Promise.resolve([])

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
		const renderer: Renderer | undefined = this.renderer === 'form' ? renderAsForm : undefined

		if (!this.visible) {
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
					this.readonly,
			  )
			: this.form
			? html`<p>unknown renderer</p>`
			: html`<p>missing form</p>`
	}
}

// Register the new element with the browser.
customElements.define('icure-form', IcureForm)
