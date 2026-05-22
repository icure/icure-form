// Import the default theme and register all custom elements
import { registerTheme } from '../../../src/components/themes/default/index'
registerTheme()
// Side-effect import: register the card internal element.
import '../../../src/components/icure-form/renderer/card/register'

import { Form, Field, Group, Subform, FieldMetadata, Validator } from '../../../src/components/model'
import { flatten as cardFlatten } from '../../../src/components/icure-form/renderer/card/flatten'
import { ContactFormValuesContainer, BridgedFormValuesContainer } from '../../../src/icure'
import { Version } from '../../../src/generic'
import { makeInterpreter } from '../../../src/utils/interpreter'
import { getRevisionsFilter } from '../../../src/utils/fields-values-provider'
import { normalizeCode } from '../../../src/utils/code-utils'
import { defaultTranslationProvider } from '../../../src/utils/languages'
import { CodeStub, DecryptedContact, DecryptedForm, DecryptedService } from '@icure/cardinal-sdk'
import YAML from 'yaml'

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
	renderer?: string
	/** Card renderer only: max interactive fields per card (1 or 2). */
	questionsPerCard?: number
	/** Active viewer role. Sections/groups/fields/subforms whose `roles` does not include it are hidden. */
	role?: string
	/**
	 * Optional pre-fill: values set on the BridgedFormValuesContainer BEFORE the renderer is mounted.
	 * Used by Phase 5 tests to simulate "resume" scenarios where the patient is returning to a
	 * partially-completed form.
	 */
	prefill?: Array<{ label: string; language?: string; value: string }>
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
	const { yaml: yamlContent, language = 'en', renderer = 'form', prefill, questionsPerCard, role } = options

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
	const rootForm = new DecryptedForm({
		id: formId,
		rev: uuid(),
		formTemplateId: form.id ?? 'test',
	})

	const currentContact = new DecryptedContact({
		id: uuid(),
		created: +new Date(),
		subContacts: [],
		services: [],
	})

	const observedForms: Record<string, DecryptedForm> = {}
	const now = +new Date()

	const contactFormValuesContainer = await ContactFormValuesContainer.fromFormsHierarchy(
		rootForm,
		currentContact,
		[],
		(label, serviceId) => new DecryptedService({ label, id: serviceId ?? uuid(), created: now, modified: now, responsible: '1' }),
		async () => [],
		async (parentId: string, anchorId: string, fti) => {
			const id = uuid()
			return (observedForms[id] = new DecryptedForm({
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
					setTimeout(() => resolve(`${_domain}\n${(questions ?? []).map(([q, a]) => `${q}: ${a}`).join('\n')}`), 100)
				}),
			translate: () => async (lang: string, text: string) => form.translations ? defaultTranslationProvider(form.translations)(lang, text) : text,
		},
	)

	await bridgedFormValuesContainer.init()

	// Phase 5: apply prefill values BEFORE the renderer mounts. BridgedFormValuesContainer requires
	// at least one registered listener for its setValue mutations to propagate (otherwise the new
	// container is silently dropped). Register a tracking listener to capture each mutation.
	let currentFvc: BridgedFormValuesContainer = bridgedFormValuesContainer
	const prefillListener = (newValue: BridgedFormValuesContainer) => {
		currentFvc = newValue
	}
	bridgedFormValuesContainer.registerChangeListener(prefillListener)
	if (prefill?.length) {
		for (const p of prefill) {
			currentFvc.setValue(p.label, p.language ?? language, { content: { [p.language ?? language]: { type: 'string', value: p.value } as any } } as any)
		}
	}

	// Remove any previous form
	const container = document.getElementById('form-container')!
	while (container.firstChild) {
		container.removeChild(container.firstChild)
	}

	// Create and configure icure-form element
	const icureFormEl = document.createElement('icure-form') as any
	icureFormEl.form = form
	// Use `currentFvc` so that any prefill applied above is reflected in the renderer's initial container.
	icureFormEl.formValuesContainer = currentFvc
	;(window as any).__currentFvc = currentFvc

	// Register change listener to update icure-form when the container changes (e.g., subform add/remove).
	// Shares the same listener array as `prefillListener`, so further mutations propagate here too.
	currentFvc.registerChangeListener((newValue: BridgedFormValuesContainer) => {
		icureFormEl.formValuesContainer = newValue
		;(window as any).__currentFvc = newValue
	})
	icureFormEl.language = language
	icureFormEl.readonly = false
	icureFormEl.displayMetadata = false
	icureFormEl.renderer = renderer
	icureFormEl.labelPosition = 'above'
	if (questionsPerCard !== undefined) {
		icureFormEl.questionsPerCard = questionsPerCard
	}
	if (role !== undefined) {
		icureFormEl.role = role
	}

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

// Card helpers exposed for Playwright tests:
;(window as any).cardFlatten = (formJson: any, role?: string) => {
	const f = Form.parse(formJson)
	return cardFlatten(f, { role }).map((c) => ({
		sectionTitle: c.sectionTitle,
		groupTitle: c.groupTitle,
		fieldLabels: c.fields.map((field) => field.field),
	}))
}
;(window as any).parseForm = (formJson: any) => Form.parse(formJson)
;(window as any).formToJson = (formJson: any) => Form.parse(formJson).toJson()

// Cycle-detection test helper. Builds a Form whose Subform tree cycles via mutation
// (Form.parse rejects duplicate subform ids, so this can't be constructed from JSON).
import { Section as ModelSection } from '../../../src/components/model'
;(window as any).testCyclicSubformFlatten = () => {
	const warnings: string[] = []
	const origWarn = console.warn
	console.warn = (...args: unknown[]) => {
		warnings.push(String(args[0] ?? ''))
	}
	try {
		const formA = new Form('A', [])
		const formB = new Form('B', [])
		// Subform from A pointing to B, and from B pointing to A — mutual reference.
		const subformAToB = new Subform('SubB', { b: formB }, { id: 'subB' })
		const subformBToA = new Subform('SubA', { a: formA }, { id: 'subA' })
		formA.sections = [new ModelSection('SecA', [subformAToB])]
		formB.sections = [new ModelSection('SecB', [subformBToA])]
		const cards = cardFlatten(formA)
		return { cardCount: cards.length, warnings }
	} finally {
		console.warn = origWarn
	}
}
