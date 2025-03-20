// Import the LitElement base class and html helper function
import { html, LitElement, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

import { Renderer } from './renderer'
import { render as renderAsForm } from './renderer/form/form'
import { FieldMetadata, FieldValue, Form } from '../model'
import { FormValuesContainer, Suggestion } from '../../generic'

// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { defaultTranslationProvider, languages } from '../../utils/languages'

/**
 * Form element
 */
export class IcureForm extends LitElement {
	@property() form?: Form
	@property() renderer = 'form'
	@property() visible = true
	@property() readonly = false
	@property() displayMetadata = false
	@property() labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float' | undefined = undefined
	@property() language?: string
	@property() languages?: { [iso: string]: string } = languages
	@property() formValuesContainer?: FormValuesContainer<FieldValue, FieldMetadata> = undefined
	@property() translationProvider?: (language: string, text: string) => string
	@property() ownersProvider?: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]>
	@property() optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>
	@property() actionListener?: (event: string, payload: unknown) => void = () => undefined

	@state() selectedTab = 0

	constructor() {
		super()
	}

	static get styles() {
		return [baseCss]
	}

	render() {
		const variant = this.renderer?.split(':')
		const renderer: Renderer | undefined = variant[0] === 'form' ? renderAsForm : undefined

		if (!this.form) {
			return html`<p>missing form</p>`
		}
		if (!renderer) {
			return html`<p>unknown renderer</p>`
		}

		const sectionWrapper =
			variant[1] === 'tab'
				? (index: number, section: TemplateResult) => {
						return html`<div class="tab ${index == this.selectedTab ? 'active' : ''}">${section}</div>`
				  }
				: undefined
		console.log('Render metadata', this.displayMetadata)

		if (!this.visible) {
			return html``
		}
		const translationTables = this.form?.translations

		const render = renderer(
			this.form,
			{ labelPosition: this.labelPosition, language: this.language },
			this.formValuesContainer,
			this.translationProvider ?? (translationTables ? defaultTranslationProvider(translationTables) : undefined),
			this.ownersProvider,
			this.optionsProvider,
			this.actionListener,
			this.languages,
			this.readonly,
			this.displayMetadata,
			sectionWrapper,
		)

		return variant[1] === 'tab'
			? html`<div class="tab-container">
					<div class="tab-bar">
						<ul>
							${this.form.sections.map((s, idx) => html`<li class="${this.selectedTab === idx ? 'active' : ''}" @click="${() => (this.selectedTab = idx)}">${s.section}</li>`)}
						</ul>
					</div>
					<div class="tab-content">${render}</div>
			  </div>`
			: render
	}
}
