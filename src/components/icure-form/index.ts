// Import the LitElement base class and html helper function
import { html, LitElement, nothing, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

import { Renderer } from './renderer'
import { render as renderAsForm } from './renderer/form/form'
import { render as renderAsCard } from './renderer/card'
import { Field, FieldMetadata, FieldValue, Form } from '../model'
import { FormValuesContainer, Suggestion, Version } from '../../generic'

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
	// `role` clashes with HTMLElement's ARIA `role` (typed `string | null`); match its shape so the
	// attribute form `<icure-form role="patient">` and the JS form `el.role = 'patient'` both work.
	@property() override role: string | null = null
	@property() labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float' | undefined = undefined
	@property() language?: string
	@property() languages?: { [iso: string]: string } = languages
	@property() formValuesContainer?: FormValuesContainer<FieldValue, FieldMetadata> = undefined
	@property() translationProvider?: (language: string, text: string) => string
	@property() revisionsFilter?: (field: Field, id: string, history: Version<FieldMetadata>[]) => string[]
	@property() ownersProvider?: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]>
	@property() optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>
	@property() actionListener?: (event: string, payload: unknown) => void = () => undefined
	@property({ type: Number }) questionsPerCard = 1

	@state() selectedTab = 0

	latestRender?: TemplateResult = undefined

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
			const renderer: Renderer | undefined = variant[0] === 'form' ? renderAsForm : variant[0] === 'card' ? renderAsCard : undefined

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
				{ labelPosition: this.labelPosition, language, questionsPerCard: this.questionsPerCard, role: this.role ?? undefined },
				formValuesContainer,
				this.translationProvider ?? (translationTables ? defaultTranslationProvider(translationTables) : undefined),
				this.revisionsFilter,
				this.ownersProvider,
				this.optionsProvider,
				this.actionListener,
				this.languages,
				this.readonly,
				this.displayMetadata,
				sectionWrapper,
			)
		},
		args: () => [this.form, this.formValuesContainer, this.language, this.selectedTab, this.renderer, this.questionsPerCard, this.role],
	})

	render() {
		if (!this.visible) {
			return nothing
		}

		const variant = this.renderer?.split(':')

		const render = this._asyncTask.render({
			pending: () => this.latestRender ?? html`<p>Loading...</p>`,
			complete: (render: TemplateResult) => (this.latestRender = render),
			error: () => html`<p>Error</p>`,
		})

		return variant[1] === 'tab'
			? html`<div class="tab-container">
					<div class="tab-bar">
						<ul>
							${(this.form?.sections ?? []).map((s, idx) => {
								const tp = this.translationProvider ?? (this.form?.translations ? defaultTranslationProvider(this.form.translations) : undefined)
								const sectionTitle = tp && this.language ? tp(this.language, s.section) : s.section
								return html`<li
									class="${this.selectedTab === idx ? 'active' : ''}"
									@click="${() => {
										this.selectedTab = idx
										setTimeout(() => this.shadowRoot?.querySelectorAll('.tab-bar li.active')[0].scrollIntoView({ inline: 'center' }), 100)
									}}"
								>
									${sectionTitle}
								</li>`
							})}
						</ul>
					</div>
					<div class="tab-content">${render}</div>
			  </div>`
			: render
	}
}
