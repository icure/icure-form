// Import the default theme to register all custom elements
import '../../../src/components/themes/default/index'

import { Form, Field, Group, Subform, FieldMetadata, Validator, Code, PrimitiveType } from '../../../src/components/model'
import { ContactFormValuesContainer, BridgedFormValuesContainer } from '../../../src/icure'
import { Version } from '../../../src/generic'
import { makeInterpreter } from '../../../src/utils/interpreter'
import { getRevisionsFilter } from '../../../src/utils/fields-values-provider'
import { defaultTranslationProvider } from '../../../src/utils/languages'

import YAML from 'yaml'
import { CodeStub, Contact, normalizeCode, Service, Form as ICureForm } from '@icure/api'

let formCounter = 0

/** Every formula passed to the current container's `compute`, in call order. See `installComputeSpy`. */
const computedFormulas: string[] = []

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
	/** Render the form in read-only (review) mode. */
	readonly?: boolean
	/** Omit fields with no displayable answer. Only takes effect together with `readonly`. */
	hideEmptyFields?: boolean
	/**
	 * Optional pre-fill: values set on the BridgedFormValuesContainer BEFORE the renderer is mounted,
	 * so a test can mount a form that already holds answers without driving the editors.
	 *
	 * `value` fills a plain string primitive; pass `primitive` instead for any other content type
	 * (a measure, a timestamp…), and `codes` for the coded answer of a dropdown / radio / checkbox.
	 */
	prefill?: Array<{ label: string; language?: string; value?: string; primitive?: PrimitiveType; codes?: Code[] }>
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
	const { yaml: yamlContent, language = 'en', renderer = 'form', prefill, readonly, hideEmptyFields } = options

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
					setTimeout(() => resolve(`${_domain}\n${(questions ?? []).map(([q, a]) => `${q}: ${a}`).join('\n')}`), 100)
				}),
			translate: () => async (lang: string, text: string) => form.translations ? defaultTranslationProvider(form.translations)(lang, text) : text,
		},
	)

	await bridgedFormValuesContainer.init()

	// Pre-fill: apply prefill values BEFORE the renderer mounts. BridgedFormValuesContainer requires
	// at least one registered listener for its setValue mutations to propagate (otherwise the new
	// container is silently dropped). Register a tracking listener to capture each mutation.
	let currentFvc: BridgedFormValuesContainer = bridgedFormValuesContainer
	const prefillListener = (newValue: BridgedFormValuesContainer) => {
		currentFvc = newValue
	}
	bridgedFormValuesContainer.registerChangeListener(prefillListener)
	if (prefill?.length) {
		for (const p of prefill) {
			const prefillLanguage = p.language ?? language
			const primitive: PrimitiveType = p.primitive ?? { type: 'string', value: p.value ?? '' }
			currentFvc.setValue(p.label, prefillLanguage, { content: { [prefillLanguage]: primitive }, codes: p.codes ?? [] })
		}
	}

	// Formula-evaluation spy (Phase 3 / ADR 0001). `compute` is the single entry point every computed
	// property goes through, so recording its argument records exactly which formulas a render pass
	// evaluated. Installed here, after `init()` and the prefill, so the list only ever describes what
	// rendering asked for. It wraps the *instance*, and a mutation swaps in a fresh container, hence
	// the re-install in the change listener below.
	const installComputeSpy = (fvc: BridgedFormValuesContainer) => {
		const orig = fvc.compute.bind(fvc)
		;(fvc as any).compute = (formula: string) => {
			computedFormulas.push(formula)
			return orig(formula)
		}
	}
	// Cleared per mount, so a test that calls `initForm` twice starts from a known state.
	computedFormulas.length = 0
	installComputeSpy(currentFvc)

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
		// Wrapped first: the assignment below schedules a Lit update, so the next render pass has to see
		// a spied container. Without this the count would stop at the first value change.
		installComputeSpy(newValue)
		icureFormEl.formValuesContainer = newValue
		;(window as any).__currentFvc = newValue
	})
	icureFormEl.language = language
	icureFormEl.readonly = readonly ?? false
	icureFormEl.hideEmptyFields = hideEmptyFields ?? false
	icureFormEl.displayMetadata = false
	icureFormEl.renderer = renderer
	icureFormEl.labelPosition = 'above'

	const translationTables = form.translations
	if (translationTables) {
		icureFormEl.translationProvider = defaultTranslationProvider(translationTables)
	}

	icureFormEl.ownersProvider = async () => []
	icureFormEl.optionsProvider = async () => []

	container.appendChild(icureFormEl)

	// Store references for later access. `__currentFvc` is deliberately not reassigned here: it was
	// already pointed at the post-prefill `currentFvc` above, and the change listener keeps it current.
	// Resetting it to `bridgedFormValuesContainer` would hand tests the stale pre-prefill container,
	// so a later `__currentFvc.setValue` would mutate that one and drop every prefilled value.
	;(window as any).__currentForm = form
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

// Subform helpers exposed for Playwright tests. Assigned through a local alias so that neither
// statement has to start with `(`, which would need a leading `;` that the `semi: never` rule flags.
const harnessWindow = window as any
// `addChild` is what the renderer's own <form-selection-button> calls; the `formFactory` above stores
// `anchorId` as the child form's `descr`, which is what the renderer matches against the Subform's id
// when it collects the children to render.
harnessWindow.__addSubformInstance = async (anchorId: string, templateId: string, label: string) => {
	await (harnessWindow.__currentFvc as BridgedFormValuesContainer).addChild(anchorId, templateId, label)
}
// Sets a plain string value inside one subform instance. Children come back in insertion order, and a
// child's mutation bubbles up to the root container, so `__currentFvc` stays current.
harnessWindow.__setChildValue = async (childIndex: number, label: string, language: string, value: string) => {
	const children = await (harnessWindow.__currentFvc as BridgedFormValuesContainer).getChildren()
	children[childIndex].setValue(label, language, { content: { [language]: { type: 'string', value } }, codes: [] })
}

// Formula-evaluation accessors for Playwright tests. `__computedFormulas` is what the no-evaluation
// proof asserts on: a render pass may run more than once, so the *set* of formulas evaluated is the
// stable signal, while the raw count stays available for reporting.
harnessWindow.__computeCount = () => computedFormulas.length
harnessWindow.__computedFormulas = () => [...computedFormulas]
harnessWindow.__resetComputeCount = () => {
	computedFormulas.length = 0
}
// `selectedTab` is a `@state()` on <icure-form>, so it is set directly rather than through an
// attribute. `updateComplete` covers the element's own update; the render task it kicks off settles
// afterwards, which the test waits for separately.
harnessWindow.__selectTab = async (idx: number) => {
	const el = harnessWindow.__currentElement
	el.selectedTab = idx
	await el.updateComplete
}
