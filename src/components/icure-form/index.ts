// Import the LitElement base class and html helper function
import { html, LitElement, nothing, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

import { Renderer } from './renderer'
import { render as renderAsForm } from './renderer/form/form'
import { FieldMetadata, FieldValue, Form } from '../model'
import { FormValuesContainer, Suggestion } from '../../generic'

// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { defaultTranslationProvider, languages } from '../../utils/languages'
import { Task } from '@lit/task'

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

	_asyncTask = new Task(this, {
		task: async ([form, formValuesContainer, language]) => {
			if (!form) {
				return html`<p>missing form</p>`
			}

			const variant = this.renderer?.split(':')
			const renderer: Renderer | undefined = variant[0] === 'form' ? renderAsForm : undefined

			if (!renderer) {
				return html`<p>unknown renderer</p>`
			}
			const translationTables = this.form?.translations

			const sectionWrapper =
				variant[1] === 'tab'
					? (index: number, section: () => TemplateResult) => {
							return html`<div class="tab ${index === this.selectedTab ? 'active' : ''}">${index === this.selectedTab ? section() : nothing}</div>`
					  }
					: undefined

			return renderer(
				form,
				{ labelPosition: this.labelPosition, language },
				formValuesContainer,
				this.translationProvider ?? (translationTables ? defaultTranslationProvider(translationTables) : undefined),
				this.ownersProvider,
				this.optionsProvider,
				this.actionListener,
				this.languages,
				this.readonly,
				this.displayMetadata,
				sectionWrapper,
			)
		},
		args: () => [this.form, this.formValuesContainer, this.language, this.selectedTab],
	})

	render() {
		console.log('Render metadata', this.displayMetadata)

		if (!this.visible) {
			return nothing
		}

		const variant = this.renderer?.split(':')

		const render = this._asyncTask.render({
			pending: () => html`<p>Loading...</p>`,
			complete: (render: TemplateResult) => render,
			error: () => html`<p>Error</p>`,
		})

		return variant[1] === 'tab'
			? html`<div class="tab-container">
					<div class="tab-bar">
						<ul>
							${(this.form?.sections ?? []).map(
								(s, idx) =>
									html`<li
										class="${this.selectedTab === idx ? 'active' : ''}"
										@click="${() => {
											this.selectedTab = idx
											setTimeout(() => this.shadowRoot?.querySelectorAll('.tab-bar li.active')[0].scrollIntoView({ inline: 'center' }), 100)
										}}"
									>
										${s.section}
									</li>`,
							)}
						</ul>
					</div>
					<div class="tab-content">${render}</div>
			  </div>`
			: render
	}
}
