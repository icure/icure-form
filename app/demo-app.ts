// @ts-ignore
import componentsGallery from './samples/01-components-gallery.yaml'
// @ts-ignore
import formulas from './samples/02-formulas.yaml'
// @ts-ignore
import asyncFormulas from './samples/03-async-formulas.yaml'
// @ts-ignore
import validation from './samples/04-validation.yaml'
// @ts-ignore
import conditionalActions from './samples/05-conditional-actions.yaml'
// @ts-ignore
import subforms from './samples/06-subforms.yaml'
// @ts-ignore
import tabsLayout from './samples/07-tabs-layout.yaml'
// @ts-ignore
import richText from './samples/08-rich-text.yaml'
import legacyPrescription from './samples/09-legacy-prescription.json'
// @ts-ignore
import clinicalWorkflow from './samples/10-clinical-workflow.yaml'
// @ts-ignore
import delegatedEdition from './samples/11-delegated-edition.yaml'

import { FormLayout } from '@icure/api'
import { css, html, LitElement } from 'lit'
// @ts-ignore
import { convertLegacy } from '../src/conversion/icure-convert'

import { Form, Label as LabelField } from '../src/components/model'
import { state } from 'lit/decorators.js'
import YAML from 'yaml'

import './decorated-form'
import './theme-language-picker'

import { DecoratedForm } from './decorated-form'

type Sample = {
	slug: string
	title: string
	description: string
	form: Form
}

class DemoApp extends LitElement {
	private samples: Sample[] = [
		{
			slug: '01-components-gallery',
			title: '01 — Components gallery',
			description: 'Every field type once.',
			form: Form.parse(YAML.parse(componentsGallery)),
		},
		{
			slug: '02-formulas',
			title: '02 — Formulas',
			description: 'Sync cross-field computed properties (BMI, age, totals).',
			form: Form.parse(YAML.parse(formulas)),
		},
		{
			slug: '03-async-formulas',
			title: '03 — Async formulas',
			description: 'Computed properties that return Promises.',
			form: Form.parse(YAML.parse(asyncFormulas)),
		},
		{
			slug: '04-validation',
			title: '04 — Validation',
			description: 'Required, range, regex and cross-field validators.',
			form: Form.parse(YAML.parse(validation)),
		},
		{
			slug: '05-conditional-actions',
			title: '05 — Conditional logic & actions',
			description: 'Show/hide, readonly, action button + payload.',
			form: Form.parse(YAML.parse(conditionalActions)),
		},
		{
			slug: '06-subforms',
			title: '06 — Subforms',
			description: 'Parent form with repeatable child encounters.',
			form: Form.parse(YAML.parse(subforms)),
		},
		{
			slug: '07-tabs-layout',
			title: '07 — Tabs & layout',
			description: 'Multi-tab form on the 24-column grid.',
			form: Form.parse(YAML.parse(tabsLayout)),
		},
		{
			slug: '08-rich-text',
			title: '08 — Rich text schemas',
			description: 'One text-field per ProseMirror schema.',
			form: Form.parse(YAML.parse(richText)),
		},
		{
			slug: '09-legacy-json',
			title: '09 — Legacy JSON form',
			description: 'Converted from the pre-YAML iCure format.',
			form: ((): Form => {
				const f = convertLegacy(legacyPrescription as unknown as FormLayout, []) as Form
				// The source is JSON, not YAML — append the explainer here instead.
				const last = f.sections[f.sections.length - 1]
				last?.fields.push(
					new LabelField(
						'Demonstrates convertLegacy(): the legacy Mac iCure JSON format (TKMedicationTable, StringEditor, …) is mapped into the modern Form model. Unknown editor keys log a [icure-convert] warning and fall back to a text-field, so unsupported widgets never crash the converter. Test: open the browser DevTools console — you should see one icure-convert warning for the unmapped MedicationTableEditor.',
						{ span: 24 },
					),
				)
				return f
			})(),
		},
		{
			slug: '10-clinical-workflow',
			title: '10 — Clinical workflow',
			description: 'End-to-end consultation form using every feature.',
			form: Form.parse(YAML.parse(clinicalWorkflow)),
		},
		{
			slug: '11-delegated-edition',
			title: '11 — Delegated edition',
			description: 'Token field that delegates clicks to a host action.',
			form: Form.parse(YAML.parse(delegatedEdition)),
		},
	]

	@state() private selectedSlug: string = this.initialSlug()

	private initialSlug(): string {
		const fromHash = location.hash.replace(/^#/, '')
		if (this.samples?.find((s) => s.slug === fromHash)) {
			return fromHash
		}
		// `samples` isn't initialised yet when this runs from the field initialiser;
		// fall back to the first sample's slug, then sync to the hash after mount.
		return fromHash || '01-components-gallery'
	}

	private get selected(): Sample {
		return this.samples.find((s) => s.slug === this.selectedSlug) ?? this.samples[0]
	}

	private selectSample(slug: string) {
		this.selectedSlug = slug
		if (location.hash.replace(/^#/, '') !== slug) {
			history.replaceState(null, '', `#${slug}`)
		}
	}

	private onHashChange = () => {
		const slug = location.hash.replace(/^#/, '')
		if (slug && this.samples.find((s) => s.slug === slug)) {
			this.selectedSlug = slug
		}
	}

	static get styles() {
		return css`
			.container {
				display: flex;
				border: 1px solid #cad0d5;
			}

			.master {
				flex: 2;
				padding: 6px;
				border-right: 1px solid #cad0d5;
			}

			.master ul {
				list-style-type: none;
				padding: 0;
				display: flex;
				flex-direction: column;
				gap: 4px;
				margin: 8px 0;
			}

			.master ul li {
				font-family: 'Roboto', Helvetica, sans-serif;
				font-size: 12px;
				padding: 8px;
				background-color: #fcfcfd;
				border: 1px solid #dde3e7;
				cursor: pointer;
				border-radius: 2px;
			}

			.master ul li.selected,
			.master ul li:hover {
				background-color: #dce7f2;
				border-color: #dce7f2;
			}

			.master ul li .title {
				font-weight: 600;
				display: block;
			}

			.master ul li .description {
				display: block;
				color: #586069;
				margin-top: 2px;
			}

			.detail {
				background-color: #ffffff;
				flex: 9;
				padding: 10px;
			}
		`
	}

	connectedCallback() {
		super.connectedCallback()
		// Sync once after construction in case the hash matched a slug only known after `samples` was assigned.
		this.onHashChange()
		window.addEventListener('hashchange', this.onHashChange)
		window.onkeydown = (event) => {
			if ((event.key === 'Z' || event.key === 'z') && event.metaKey) {
				const target = this.shadowRoot?.getElementById(this.selected.form.id ?? this.selected.form.form)
				if (!target) {
					return
				}
				if (event.key === 'Z') {
					event.preventDefault()
					;(target as DecoratedForm).redo()
				} else if (event.key === 'z') {
					event.preventDefault()
					;(target as DecoratedForm).undo()
				}
			}
		}
	}

	disconnectedCallback() {
		window.removeEventListener('hashchange', this.onHashChange)
		super.disconnectedCallback()
	}

	render() {
		const selected = this.selected
		return html`
			<div class="container">
				<div class="master">
					<theme-language-picker></theme-language-picker>
					<ul>
						${this.samples.map(
							(s) => html`
								<li class="${s.slug === selected.slug ? 'selected' : ''}" @click="${() => this.selectSample(s.slug)}">
									<span class="title">${s.title}</span>
									<span class="description">${s.description}</span>
								</li>
							`,
						)}
					</ul>
				</div>
				<div class="detail">
					${this.samples.map(
						(s) => html`
							<div style="${s.slug === selected.slug ? '' : 'display: none;'}">
								<decorated-form id="${s.form.id ?? s.form.form}" .form="${s.form}" renderer="form:tab"></decorated-form>
							</div>
						`,
					)}
				</div>
			</div>
		`
	}
}

customElements.define('demo-app', DemoApp)
