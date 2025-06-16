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

	@state() latestRender?: TemplateResult = undefined

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
					? async (index: number, section: () => Promise<TemplateResult>) => {
							return html`<div class="tab ${index === this.selectedTab ? 'active' : ''}">${index === this.selectedTab ? await section() : nothing}</div>`
					  }
					: undefined

			const gen = renderer(
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

			let latest: TemplateResult | typeof nothing = nothing
			while (true) {
				const next = await gen.next()
				if (next.done) {
					break
				}
				const [render, isStale] = next.value
				latest = render
				this.latestRender = render
				if (isStale) {
					break
				}
			}

			return latest
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
			pending: () => this.latestRender ?? html`<p>Loading...</p>`,
			complete: (render: TemplateResult) => (this.latestRender = render),
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
