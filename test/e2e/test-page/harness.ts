// Import the default theme to register all custom elements
import '../../../src/components/themes/default/index'

import { Form, Field, Group, Subform, FieldMetadata, Validator } from '../../../src/components/model'
import { ContactFormValuesContainer, BridgedFormValuesContainer } from '../../../src/icure'
import { Version } from '../../../src/generic'
import { makeInterpreter } from '../../../src/utils/interpreter'
import { getRevisionsFilter } from '../../../src/utils/fields-values-provider'
import { defaultTranslationProvider } from '../../../src/utils/languages'

import YAML from 'yaml'
import { CodeStub, Contact, normalizeCode, Service, Form as ICureForm } from '@icure/api'

let formCounter = 0

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0
		const v = c === 'x' ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

interface InitFormOptions {
	yaml: string
	language?: string
}

interface InitFormResult {
	fieldCount: number
	fieldLabels: string[]
}

const findForm = (form: Form, anchorId: string | undefined, templateId: string | undefined): Form | undefined => {
	if (anchorId === undefined || templateId === undefined) {
		return form
	}
	return form.sections
		.flatMap((s) => s.fields)
		.map((fg) => {
			if (fg.clazz === 'subform') {
				if (fg.id === anchorId) {
					return fg.forms[templateId]
				} else {
					const candidate = Object.values(fg.forms)
						.map((f) => findForm(f, anchorId, templateId))
						.find((f) => !!f)
					if (candidate) {
						return candidate
					}
				}
			}
			return undefined
		})
		.find((f) => !!f)
}

const extractFormulas = (
	fieldGroupOrSubForms: (Field | Group | Subform)[],
	property: (fg: Field) => string | undefined,
): {
	metadata: FieldMetadata
	revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
	formula: string
}[] =>
	fieldGroupOrSubForms.flatMap((fg) => {
		if (fg.clazz === 'group') {
			return extractFormulas(fg.fields ?? [], property)
		} else if (fg.clazz === 'field') {
			const formula = property(fg)
			return formula
				? [
						{
							metadata: {
								label: fg.label(),
								tags: fg.tags?.map((id) => ({ ...normalizeCode(new CodeStub({ id: id })), id: id!, label: {} })),
							},
							revisionsFilter: getRevisionsFilter(fg),
							formula,
						},
				  ]
				: []
		} else {
			return []
		}
	}) ?? []

async function initForm(options: InitFormOptions): Promise<InitFormResult> {
	const { yaml: yamlContent, language = 'en' } = options

	// Parse the form
	let parsed: any
	try {
		parsed = YAML.parse(yamlContent)
	} catch {
		parsed = JSON.parse(yamlContent)
	}
	const form = Form.parse(parsed)

	// Count fields in the form definition
	const countFields = (fields: (Field | Group | Subform)[]): number =>
		fields.reduce((acc, fg) => {
			if (fg.clazz === 'field') return acc + 1
			if (fg.clazz === 'group') return acc + countFields(fg.fields ?? [])
			return acc
		}, 0)

	const fieldCount = form.sections.reduce((acc, s) => acc + countFields(s.fields), 0)

	const collectLabels = (fields: (Field | Group | Subform)[]): string[] =>
		fields.flatMap((fg) => {
			if (fg.clazz === 'field') return [fg.shortLabel ?? fg.label()]
			if (fg.clazz === 'group') return collectLabels(fg.fields ?? [])
			return []
		})

	const fieldLabels = form.sections.flatMap((s) => collectLabels(s.fields))

	// Create empty contacts
	const formId = `f-${++formCounter}`
	const rootForm = new ICureForm({
		id: formId,
		rev: uuid(),
		formTemplateId: form.id ?? 'test',
	})

	const currentContact = new Contact({
		id: uuid(),
		created: +new Date(),
		subContacts: [],
		services: [],
	})

	const observedForms: Record<string, ICureForm> = {}
	const now = +new Date()

	const contactFormValuesContainer = await ContactFormValuesContainer.fromFormsHierarchy(
		rootForm,
		currentContact,
		[],
		(label, serviceId) => new Service({ label, id: serviceId ?? uuid(), created: now, modified: now, responsible: '1' }),
		async () => [],
		async (parentId: string, anchorId: string, fti) => {
			const id = uuid()
			return (observedForms[id] = new ICureForm({
				id,
				created: +new Date(),
				modified: +new Date(),
				formTemplateId: fti,
				parent: parentId,
				descr: anchorId,
			}))
		},
		async (formId: string) => {
			delete observedForms[formId]
		},
	)

	const bridgedFormValuesContainer = new BridgedFormValuesContainer(
		'1',
		contactFormValuesContainer,
		makeInterpreter(),
		undefined,
		(anchorId, templateId) => {
			const f = findForm(form, anchorId, templateId)
			return f ? extractFormulas(f.sections?.flatMap((s) => s.fields) ?? [], (fg) => fg.computedProperties?.['defaultValue']) : []
		},
		(anchorId, templateId) => {
			const f = findForm(form, anchorId, templateId)
			return f ? extractFormulas(f.sections?.flatMap((s) => s.fields) ?? [], (fg) => fg.computedProperties?.['value']) : []
		},
		(anchorId, templateId) => {
			const f = findForm(form, anchorId, templateId)
			const extractValidators = (fgss: (Field | Group | Subform)[]): { metadata: FieldMetadata; validators: Validator[] }[] =>
				fgss.flatMap((fg) => {
					if (fg.clazz === 'group') return extractValidators(fg.fields ?? [])
					if (fg.clazz === 'field') {
						const validators = fg.validators
						return validators?.length ? [{ metadata: { label: fg.label(), tags: fg.tags?.map((id) => ({ ...normalizeCode(new CodeStub({ id: id })), id: id!, label: {} })) }, validators }] : []
					}
					return []
				}) ?? []
			return f ? extractValidators(f.sections?.flatMap((s) => s.fields) ?? []) : []
		},
		language,
		undefined,
		{
			language: () => language,
			delay: () => (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
			summarize: () => (_domain: string, _status: string, questions: [string, string][]) =>
				new Promise((resolve) => {
					setTimeout(() => resolve(`${_domain}\n${questions.map(([q, a]) => `${q}: ${a}`).join('\n')}`), 100)
				}),
			translate: () => async (lang: string, text: string) => form.translations ? defaultTranslationProvider(form.translations)(lang, text) : text,
		},
	)

	await bridgedFormValuesContainer.init()

	// Remove any previous form
	const container = document.getElementById('form-container')!
	while (container.firstChild) {
		container.removeChild(container.firstChild)
	}

	// Create and configure icure-form element
	const icureFormEl = document.createElement('icure-form') as any
	icureFormEl.form = form
	icureFormEl.formValuesContainer = bridgedFormValuesContainer

	// Register change listener to update icure-form when the container changes (e.g., subform add/remove)
	bridgedFormValuesContainer.registerChangeListener((newValue: BridgedFormValuesContainer) => {
		icureFormEl.formValuesContainer = newValue
		;(window as any).__currentFvc = newValue
	})
	icureFormEl.language = language
	icureFormEl.readonly = false
	icureFormEl.displayMetadata = false
	icureFormEl.renderer = 'form'
	icureFormEl.labelPosition = 'above'

	const translationTables = form.translations
	if (translationTables) {
		icureFormEl.translationProvider = defaultTranslationProvider(translationTables)
	}

	icureFormEl.ownersProvider = async () => []
	icureFormEl.optionsProvider = async () => []

	container.appendChild(icureFormEl)

	// Store references for later access
	;(window as any).__currentForm = form
	;(window as any).__currentFvc = bridgedFormValuesContainer
	;(window as any).__currentElement = icureFormEl

	return { fieldCount, fieldLabels }
}

// Expose on window for Playwright
;(window as any).initForm = initForm
;(window as any).getFormValues = () => {
	const fvc = (window as any).__currentFvc as BridgedFormValuesContainer | undefined
	if (!fvc) return null
	const values = fvc.getValues(() => [null])
	return values
}
