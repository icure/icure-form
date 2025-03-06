// @ts-ignore
import validators from './samples/000-validators.yaml'
// @ts-ignore
import tokenFields from './samples/01-token-fields.yaml'
// @ts-ignore
import bmi from './samples/1-BMI.yaml'
// @ts-ignore
import time_of_appointment from './samples/1-time-of-appointment.yaml'
// @ts-ignore
import preliminary_psycho_social_interview from './samples/2-preliminary-psycho-social-interview.yaml'
// @ts-ignore
import preliminary_medical_interview from './samples/3-preliminary-medical-interview.yaml'
// @ts-ignore
import termination_of_pregnancy_curetage from './samples/4-termination-of-pregnancy-curetage.yaml'
// @ts-ignore
import interruption_of_pregnancy_medical_part_1 from './samples/5-interruption-of-pregnancy-medical-part-1.yaml'
// @ts-ignore
import interruption_of_pregnancy_medical_part_2 from './samples/6-interruption-of-pregnancy-medical-part-2.yaml'
// @ts-ignore
import note from './samples/9-note.yaml'
// @ts-ignore
import extra from './samples/8-extra.yaml'
// @ts-ignore
import control from './samples/7-control.yaml'
import obstetrics from './samples/obstetrics.json'
import prescription from './samples/prescription.json'
import obstetrics_followup_long from './samples/obstetrics-followup-long.json'
import obstetrics_followup_short from './samples/obstetrics-followup-short.json'
import obstetrics_followup_midwife from './samples/obstetrics-followup-midwife.json'
import incapacity from './samples/incapacity.json'
import { css, html, LitElement } from 'lit'
// @ts-ignore
import { convertLegacy } from '../src/conversion/icure-convert'
// @ts-ignore
const legacyForms = [obstetrics, incapacity, prescription, obstetrics_followup_short, obstetrics_followup_long, obstetrics_followup_midwife] as FormLayout[]

// @ts-ignore
import okido from './samples/okido.yaml'
// @ts-ignore
import okido_treatment from './samples/okido_treatment.yaml'
// @ts-ignore
import okido_anamnesis from './samples/okido_anamnesis.yaml'
// @ts-ignore
import okido_search from './samples/okido_search.yaml'
// @ts-ignore
import okido_measure from './samples/okido_measure.yaml'
// @ts-ignore
import okido_evaluation from './samples/okido_evaluation.yaml'
// @ts-ignore
import okido_planification from './samples/okido_planification.yaml'
// @ts-ignore
import okido_diagnostic from './samples/okido_diagnostic.yaml'
// @ts-ignore
import okido_closure from './samples/okido_closure.yaml'
// @ts-ignore
import okido_functional_disorder from './samples/okido_functional_disorder.yaml'
// @ts-ignore
import okido_complementary_exam from './samples/oki_complementary_exam.yaml'
// @ts-ignore
import okido_external_factor from './samples/okido_external_factor.yaml'
// @ts-ignore
import okido_individual_factor from './samples/okido_individual_factor.yaml'
// @ts-ignore
import okido_medical_data from './samples/okido_medical_data.yaml'
// @ts-ignore
import okido_severity_disorder from './samples/okido_severity_disorder.yaml'
// @ts-ignore
import okido_surgical_data from './samples/okido_surgical_data.yaml'
// @ts-ignore
import okido_medical_care from './samples/okido_medical_care.yaml'
// @ts-ignore
import okido_physiotherapy_care from './samples/okido_physiotherapy_care.yaml'
// @ts-ignore
import okido_paramedical_care from './samples/okido_paramedical_care.yaml'

import { Form } from '../src/components/model'
import { state } from 'lit/decorators.js'
import YAML from 'yaml'

import './decorated-form'

import { DecoratedForm } from './decorated-form'
import { AuthenticationMethod, CardinalBaseSdk } from '@icure/cardinal-sdk'
import UsingCredentials = AuthenticationMethod.UsingCredentials

class DemoApp extends LitElement {
	private hcpApi = CardinalBaseSdk.initialize('com.icure.form-sample', 'https://kraken.svc.icure.cloud/rest/v1', new UsingCredentials.UsernamePassword('abdemo@icure.cloud', 'knalou')).then(
		(sdk) => sdk.healthcareParty,
	)
	private samples = [
		...[
			{ title: 'OKIDO', form: Form.parse(YAML.parse(okido)) } /*
			{ title: '2 - Preliminary psycho-social interview', form: Form.parse(YAML.parse(preliminary_psycho_social_interview)) },
			{ title: 'OKIDO - Recherche', form: Form.parse(YAML.parse(okido_search)) },
			{ title: '000 - Validators', form: Form.parse(YAML.parse(validators)) },
			{ title: '01 - Token fields', form: Form.parse(YAML.parse(tokenFields)) },
			{ title: '1 - BMI', form: Form.parse(YAML.parse(bmi)) },
			// { title: '1 - Time of appointment', form: Form.parse(YAML.parse(time_of_appointment)) },
			{ title: 'Obstetrics', form: convertLegacy(obstetrics as FormLayout, legacyForms) },
			{ title: '2 - Preliminary psycho-social interview', form: Form.parse(YAML.parse(preliminary_psycho_social_interview)) },
			{ title: '3 - Preliminary medical interview', form: Form.parse(YAML.parse(preliminary_medical_interview)) },
			{ title: '4 - Termination of pregnancy curetage', form: Form.parse(YAML.parse(termination_of_pregnancy_curetage)) },
			{ title: '5 - Interuption of pregnancy medical part 1', form: Form.parse(YAML.parse(interruption_of_pregnancy_medical_part_1)) },
			{ title: '6 - Interuption of pregnancy medical part 2', form: Form.parse(YAML.parse(interruption_of_pregnancy_medical_part_2)) },
			{ title: '7 - Control', form: Form.parse(YAML.parse(control)) },
			{ title: '8 - Extra', form: Form.parse(YAML.parse(extra)) },
			{ title: '9 - Note', form: Form.parse(YAML.parse(note)) },
			{ title: 'OKIDO - Anamnèse', form: Form.parse(YAML.parse(okido_anamnesis)) },
			{ title: 'OKIDO - Recherche', form: Form.parse(YAML.parse(okido_measure)) },
			{ title: 'OKIDO - Evaluation', form: Form.parse(YAML.parse(okido_evaluation)) },
			{ title: 'OKIDO - Planification', form: Form.parse(YAML.parse(okido_planification)) },
			{ title: 'OKIDO - Traitement', form: Form.parse(YAML.parse(okido_treatment)) },
			{ title: 'OKIDO - Diagnostique', form: Form.parse(YAML.parse(okido_diagnostic)) },
			{ title: 'OKIDO - Clôture', form: Form.parse(YAML.parse(okido_closure)) },
			{ title: 'OKIDO - Anamnèse - Trouble fonctionnel', form: Form.parse(YAML.parse(okido_functional_disorder)) },
			{ title: 'OKIDO - Anamnèse - Répercution / Sévérité', form: Form.parse(YAML.parse(okido_severity_disorder)) },
			{ title: 'OKIDO - Anamnèse - Facteur externe', form: Form.parse(YAML.parse(okido_external_factor)) },
			{ title: 'OKIDO - Anamnèse - Facteur individuel / personnel', form: Form.parse(YAML.parse(okido_individual_factor)) },
			{ title: 'OKIDO - Anamnèse - Donnée médicale', form: Form.parse(YAML.parse(okido_medical_data)) },
			{ title: 'OKIDO - Anamnèse - Donnée chirurgicale', form: Form.parse(YAML.parse(okido_surgical_data)) },
			{ title: 'OKIDO - Anamnèse - Soin médical', form: Form.parse(YAML.parse(okido_medical_care)) },
			{ title: 'OKIDO - Anamnèse - Soin paramédical', form: Form.parse(YAML.parse(okido_paramedical_care)) },
			{ title: 'OKIDO - Anamnèse - Soin kinésithérapeutique', form: Form.parse(YAML.parse(okido_physiotherapy_care)) },*/,
		], //.filter((x, idx) => idx === 0),
	]

	@state() private selectedForm: Form = this.samples[0].form
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

				&.selected {
					background-color: #dce7f2;
					border-color: #dce7f2;
				}
			}

			.master ul li:hover {
				background-color: #dce7f2;
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
		window.onkeydown = (event) => {
			if ((event.key === 'Z' || event.key === 'z') && event.metaKey) {
				console.log(event.key)
				const target = this.shadowRoot?.getElementById(this.selectedForm.id ?? this.selectedForm.form)
				if (!target) {
					return
				}
				if (event.key === 'Z') {
					console.log('redo')
					event.preventDefault()
					;(target as DecoratedForm).redo()
				} else if (event.key === 'z') {
					console.log('undo')
					event.preventDefault()
					;(target as DecoratedForm).undo()
				}
			}
		}
	}
	async ownersProvider(terms: string[], ids?: string[], specialties?: string[]) {
		const longestTerm = terms.reduce((w, t) => (w.length >= t.length ? w : t), '')
		const candidates = await (await this.hcpApi).findHealthcarePartiesByName({ name: longestTerm })
		return (candidates.rows || []).map((x) => ({
			id: x.id,
			text: [x.firstName, x.lastName].filter((x) => x?.length).join(' '),
		}))
	}

	render() {
		return html`
			<div class="container">
				<div class="master">
					<ul>
						${this.samples.map((s) => {
							return html`<li class="${s.form === this.selectedForm ? 'selected' : ''}" @click="${() => (this.selectedForm = s.form)}">${s.title}</li>`
						})}
					</ul>
				</div>
				<div class="detail">
					${this.samples.map((s) => {
						return html`<div style="${s.form === this.selectedForm ? '' : 'display: none;'}">
							<decorated-form id="${s.form.id ?? s.form.form}" .form="${s.form}"></decorated-form>
						</div>`
					})}
				</div>
			</div>
		`
	}
}

customElements.define('demo-app', DemoApp)
