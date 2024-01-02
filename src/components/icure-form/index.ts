// Import the LitElement base class and html helper function
import { html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import { Renderer } from './renderer'
import { render as renderAsForm } from './renderer/form'
import { Code, FieldMetadata, FieldValue, Form } from '../model'
import { FormValuesContainer } from '../../generic'

import './fields'

// @ts-ignore
import baseCss from '../styles/style.scss'
// @ts-ignore
import kendoCss from '../styles/kendo.scss'
import { defaultTranslationProvider } from '../../utils/languages'

/**
 * Form element
 */
class IcureForm extends LitElement {
	@property() form?: Form
	@property() skin = 'material'
	@property() theme = 'default'
	@property() renderer = 'form'
	@property() visible = true
	@property() readonly = false
	@property() labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float' | undefined = undefined
	@property() defaultLanguage?: string = undefined
	@property() formValuesContainer?: FormValuesContainer<FieldValue, FieldMetadata> = undefined
	@property() translationProvider?: (language: string, text: string) => string
	@property() codesProvider: (codifications: string[], searchTerm: string) => Promise<Code[]> = () => Promise.resolve([])
	@property() optionsProvider: (language: string, codifications: string[], searchTerm: string) => Promise<Code[]> = () => Promise.resolve([])

	constructor() {
		super()
	}

	static get styles() {
		return [baseCss, kendoCss]
	}

	render() {
		const renderer: Renderer | undefined = this.renderer === 'form' ? renderAsForm : undefined

		if (!this.visible) {
			return html``
		}
		const translationTables = this.form?.translations

		return renderer && this.form
			? renderer(
					this.form,
					{ labelPosition: this.labelPosition, defaultLanguage: this.defaultLanguage },
					this.formValuesContainer,
					this.translationProvider ?? (translationTables ? defaultTranslationProvider(translationTables) : undefined),
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
