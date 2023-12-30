import { css, html, LitElement } from 'lit'
import { CodeStub, IccHcpartyXApi, sleep } from '@icure/api'
import * as YAML from 'yaml'
import '../src/components/icure-form/fields/text-field/icure-text-field'
import '../src/components/icure-form/fields/dropdown/icure-dropdown'
import '../src/components/icure-date-picker'
import '../src/components/icure-form'
import MiniSearch, { SearchResult } from 'minisearch'
import { DatePicker, DateTimePicker, Form, Group, MeasureField, MultipleChoice, NumberField, Section, TextField, TimePicker } from '../src/components/icure-form/model'
import { codes } from './codes'
// @ts-ignore
import yamlForm from './gp.yaml'
import { makeFormValuesContainer } from './form-values-container'
import { property } from 'lit/decorators.js'
import { ContactFormValuesContainer, ActionManager } from '../src/models'

const icd10 = [
	['I', new RegExp('^[AB][0–9]')],
	['II', new RegExp('^C[0-9]–D[0-4]')],
	['III', new RegExp('^D[5–9]')],
	['IV', new RegExp('^E[0–9]')],
	['V', new RegExp('^F[0–9]')],
	['VI', new RegExp('^G[0–9]')],
	['VII', new RegExp('^H[0–5]')],
	['VIII', new RegExp('^H[6–9]')],
	['IX', new RegExp('^I[0–9]')],
	['X', new RegExp('^J[0–9]')],
	['XI', new RegExp('^K[0–9]')],
	['XII', new RegExp('^L[0–9]')],
	['XIII', new RegExp('^M[0–9]')],
	['XIV', new RegExp('^N[0–9]')],
	['XV', new RegExp('^O[0–9]')],
	['XVI', new RegExp('^P[0–9]')],
	['XVII', new RegExp('^Q[0–9]')],
	['XVIII', new RegExp('^R[0–9]')],
	['XIX', new RegExp('^[ST][0–9]')],
	['XX', new RegExp('^[VY][0–9]')],
	['XXI', new RegExp('^Z[0–9]')],
	['XXII', new RegExp('^U[0–9]')],
]

const icpc2 = {
	B: 'XX',
	D: 'XI',
	F: 'VI',
	H: 'VII',
	K: 'IX',
	L: 'XIII',
	N: 'VI',
	P: 'V',
	R: 'X',
	S: 'XII',
	T: 'VI',
	U: 'XIV',
	W: 'XV',
	X: 'XVI',
	Y: 'XVIII',
	Z: 'XXI',
}

const ultrasound = [
	{ id: 'ULTRASOUND-EVALUATION|01|1', code: '01', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.EMPTY-CAVITY' } },
	{ id: 'ULTRASOUND-EVALUATION|02|1', code: '02', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.CLOTS' } },
	{ id: 'ULTRASOUND-EVALUATION|03|1', code: '03', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.RETENTION' } },
	{ id: 'ULTRASOUND-EVALUATION|04|1', code: '04', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.NON-PROGRESSIVE-PREGNANCY' } },
	{ id: 'ULTRASOUND-EVALUATION|05|1', code: '05', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.PROGRESSIVE-PREGNANCY' } },
	{ id: 'ULTRASOUND-EVALUATION|06|1', code: '06', type: 'ULTRASOUND_EVALUATION', version: '1', label: { en: 'abortion-forms.field-options.DIFFUSE-IMAGE' } },
]

const stopWords = new Set(['du', 'au', 'le', 'les', 'un', 'la', 'des', 'sur', 'de'])

class DemoApp extends LitElement {
	private hcpApi: IccHcpartyXApi = new IccHcpartyXApi('https://kraken.svc.icure.cloud/rest/v1', { Authorization: 'Basic YWJkZW1vQGljdXJlLmNsb3VkOmtuYWxvdQ==' })
	@property() formValuesContainer: ContactFormValuesContainer = makeFormValuesContainer()

	private miniSearch: MiniSearch = new MiniSearch({
		fields: ['text'], // fields to index for full-text search
		storeFields: ['code', 'text', 'links'], // fields to return with search results
		processTerm: (term) =>
			term.length === 1 || stopWords.has(term)
				? null
				: term
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '')
						.toLowerCase(),
	})

	static get styles() {
		return css`
			icure-text-field {
				display: block;
			}

			h2 {
				width: 100%;
				font-size: 2em;
				margin-top: 1em;
				margin-bottom: 0;
				font-family: 'Roboto', Helvetica, sans-serif;
			}

			* {
				box-sizing: border-box;
			}
		`
	}
	async firstUpdated() {
		this.miniSearch.addAll(codes.map((x) => ({ id: x.id, code: x.code, text: x.label?.fr, links: x.links })))
	}

	codeColorProvider(type: string, code: string) {
		if (!code) {
			return 'XXII'
		}
		return type === 'ICD' ? (icd10.find((x) => code.match(x[1])) || [])[0] || 'XXII' : icpc2[code.substring(0, 1)] || 'XXII'
	}

	async suggestionProvider(terms: string[]) {
		let normalisedTerms = terms.map((x) =>
			x
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.toLowerCase(),
		)
		const res: (SearchResult & { terms: string[] })[] = []
		if (this.miniSearch) {
			while (normalisedTerms.length && res.length < 20) {
				res.push(
					...this.miniSearch
						.search(normalisedTerms.join(' '))
						.filter((x) => {
							return normalisedTerms.every((t) => x.terms.includes(t))
						})
						.map((s) => Object.assign(s, { terms }))
						.filter((t) => !res.some((x) => x.text === t.text)),
				)
				res.length < 20 &&
					res.push(
						...this.miniSearch
							.search(normalisedTerms.join(' '), { prefix: true })
							.filter((x) => normalisedTerms.every((t) => x.terms.some((mt) => mt.startsWith(t))))
							.map((s) => Object.assign(s, { terms }))
							.filter((t) => !res.some((x) => x.text === t.text)),
					)
				normalisedTerms = normalisedTerms.slice(1)
				terms = terms.slice(1)
			}
		}
		return res
	}

	async linksProvider(sug: { id: string; code: string; text: string; terms: string[]; links: string[] }) {
		const links = (await Promise.all((sug.links || []).map((id) => codes.find((c) => c.id === id))))
			.map((c) => ({ id: c?.id, code: c?.code, text: c?.label?.fr, type: c?.type }))
			.concat([Object.assign({ type: sug.id.split('|')[0] }, sug)])
		return { href: links.map((c) => `c-${c.type}://${c.code}`).join(','), title: links.map((c) => c.text).join('; ') }
	}

	async ownersProvider(terms: string[]) {
		const longestTerm = terms.reduce((w, t) => (w.length >= t.length ? w : t), '')
		const candidates = await this.hcpApi.findByName(longestTerm)
		return (candidates.rows || []).map((x) => ({
			id: x.id,
			text: [x.firstName, x.lastName].filter((x) => x?.length).join(' '),
		}))
	}
	async sleep(ms: number): Promise<any> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	async optionsProvider() {
		await sleep(5000)
		return Promise.resolve([
			{
				id: 1,
				text: 'Dylan Friedrich',
			},
		])
	}

	translationProvider(stringToTranslate: string) {
		return stringToTranslate
	}
	async codesProvider(codifications: string[]): Promise<CodeStub[]> {
		const codes: CodeStub[] = []
		if (codifications.find((code) => code === 'ULTRASOUND-EVALUATION')) {
			ultrasound.map((x) => codes.push(new CodeStub(x)))
		}
		return codes
	}

	render() {
		// noinspection DuplicatedCode
		// @ts-ignore
		const form = new Form(
			'Waiting room GP',
			[
				new Section('All fields', [
					new TextField('This field is a TextField', {
						shortLabel: 'allTextField',
						rows: 1,
						grows: true,
						columns: 1,
					}),
					new NumberField('This field is a NumberField', {
						shortLabel: 'allNumberField',
						rows: 1,
						grows: true,
						columns: 1,
					}),
					new MeasureField('This field is a MeasureField', {
						shortLabel: 'allMeasureField',
						rows: 1,
						grows: true,
						columns: 1,
					}),
					new DatePicker('This field is a DatePicker', {
						shortLabel: 'allDatePicker',
						rows: 2,
						grows: true,
						columns: 1,
					}),
					new TimePicker('This field is a TimePicker', {
						shortLabel: 'allTimePicker',
						rows: 2,
						grows: true,
						columns: 1,
					}),
					new DateTimePicker('This field is a DateTimePicker', {
						shortLabel: 'allDateTimePicker',
						rows: 3,
						grows: true,
						columns: 1,
					}),
					new MultipleChoice('This field is a MultipleChoice', {
						shortLabel: 'allMultipleChoice',
						rows: 3,
						grows: true,
						columns: 1,
					}),
				]),
				new Section('Grouped fields', [
					new Group('You can group fields together', {
						fields: [
							new TextField('This field is a TextField', {
								shortLabel: 'groupTextField',
								rows: 1,
								grows: true,
								columns: 2,
								schema: undefined,
								tags: undefined,
								codifications: ['CD-ITEM|diagnosis|1'],
							}),
							new NumberField('This field is a NumberField', {
								shortLabel: 'groupNumberField',
								rows: 1,
								grows: true,
								columns: 2,
							}),
							new MeasureField('This field is a MeasureField', {
								shortLabel: 'groupMeasureField',
								rows: 1,
								grows: true,
								columns: 2,
							}),
							new DatePicker('This field is a DatePicker', {
								shortLabel: 'groupDatePicker',
								rows: 3,
								grows: true,
								columns: 2,
							}),
							new TimePicker('This field is a TimePicker', {
								shortLabel: 'groupTimePicker',
								rows: 3,
								grows: true,
								columns: 2,
							}),
							new DateTimePicker('This field is a DateTimePicker', {
								shortLabel: 'groupDateTimePicker',
								rows: 3,
								grows: true,
								columns: 2,
							}),
							new MultipleChoice('This field is a MultipleChoice', {
								shortLabel: 'groupMultipleChoice',
								rows: 4,
								grows: true,
								columns: 2,
							}),
						],
						rows: 1,
						columns: 1,
					}),
					new Group('And you can add tags and codes', {
						fields: [
							new TextField('This field is a TextField with rows and columns', {
								shortLabel: 'tagTextField',
								rows: 1,
								grows: true,
								columns: 1,
								schema: 'text-document',
								tags: ['CD-ITEM|diagnosis|1'],
								codifications: ['BE-THESAURUS', 'ICD10'],
								options: {
									option: 'blink',
								},
							}),
							new NumberField('This field is a NumberField', {
								shortLabel: 'tagNumberField',
								rows: 1,
								grows: true,
								columns: 1,
								tags: ['CD-ITEM|parameter|1', 'CD-PARAMETER|bmi|1'],
								codifications: [],
								options: { option: 'bang' },
							}),
							new MeasureField('This field is a MeasureField', {
								shortLabel: 'tagMeasureField',
								rows: 1,
								grows: true,
								columns: 1,
								tags: ['CD-ITEM|parameter|1', 'CD-PARAMETER|heartbeat|1'],
								codifications: [],
								options: { unit: 'bpm' },
							}),
							new MultipleChoice('This field is a MultipleChoice', {
								shortLabel: 'tagMultipleChoice',
								rows: 4,
								grows: true,
								columns: 4,
								tags: [],
								codifications: ['KATZ'],
								options: { many: 'no' },
							}),
						],
						rows: 1,
						columns: 1,
						hideCondition: '',
					}),
				]),
			],
			'Fill in the patient information inside the waiting room',
		)

		const editable = true
		const gpForm = Form.parse(YAML.parse(yamlForm))
		const actionManager: ActionManager = new ActionManager(gpForm, this.formValuesContainer, editable)

		return html`
			<icure-form
				.form="${gpForm}"
				.editable="${editable}"
				labelPosition="above"
				skin="kendo"
				theme="gray"
				renderer="form"
				.formValuesContainer="${this.formValuesContainer}"
				.actionManager="${actionManager}"
				.formValuesContainerChanged="${(newVal: ContactFormValuesContainer) => {
					console.log(newVal)
				}}"
				.ownersProvider="${this.ownersProvider.bind(this)}"
				.translationProvider="${this.translationProvider.bind(this)}"
				.codesProvider="${this.codesProvider.bind(this)}"
				.optionsProvider="${this.optionsProvider.bind(this)}"
			></icure-form>
		`
	}
}

customElements.define('demo-app', DemoApp)
