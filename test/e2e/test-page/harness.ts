// Import the default theme to register all custom elements
import '../../../src/components/themes/default/index'

import { Form, Field, Group, Subform, FieldMetadata, Validator, Code, PrimitiveType } from '../../../src/components/model'
import { ContactFormValuesContainer, BridgedFormValuesContainer } from '../../../src/icure'
import { Suggestion, Version } from '../../../src/generic'
import { makeInterpreter } from '../../../src/utils/interpreter'
import { getRevisionsFilter } from '../../../src/utils/fields-values-provider'
import { defaultTranslationProvider } from '../../../src/utils/languages'

import YAML from 'yaml'
import { CodeStub, Contact, normalizeCode, Service, Form as ICureForm } from '@icure/api'
import { fixtureProvider } from './suggestion-fixtures'

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
	/**
	 * Name of a tree in test/e2e/test-page/suggestion-fixtures.ts served as the form's `optionsProvider` for every
	 * codification (dropdown popover tests). Functions cannot cross the Playwright boundary, hence named fixtures.
	 */
	optionsFixture?: string
	/**
	 * Name of a tree in test/e2e/test-page/suggestion-fixtures.ts served as the form's host-level `suggestionProvider`
	 * (with a matching `linksProvider`); fields opt in through `codifications` or `suggestions: true` (palette tests).
	 */
	suggestionsFixture?: string
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
	const { yaml: yamlContent, language = 'en', renderer = 'form', prefill, readonly, hideEmptyFields, optionsFixture, suggestionsFixture } = options

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
	icureFormEl.optionsProvider = optionsFixture ? async (_language: string, _codifications: string[], terms?: string[]) => fixtureProvider(optionsFixture)(terms ?? []) : async () => []
	// Suggestion palette tests: the named fixture is the host-level provider; the fixture form opts fields in through
	// `codifications` or `suggestions: true`. A links provider goes with it so insertions carry a link.
	if (suggestionsFixture) {
		icureFormEl.suggestionProvider = async (terms: string[], _codifications: string[]) => fixtureProvider(suggestionsFixture)(terms)
		icureFormEl.linksProvider = async (sug: Suggestion) => ({ href: `c-FIXTURE://${sug.id}`, title: sug.text })
		// A colour category outside the built-in table is echoed verbatim into the code's style, which the spec asserts.
		icureFormEl.codeColorProvider = (_type: string, _code: string) => '#123456'
	}

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
// ---- Hierarchical-suggestions specs -------------------------------------------------------------------------------
// The shadow root of the first dropdown's inner <icure-dropdown-field>, where the popover (#menu), its search box
// (#editor) and its click target (#test) live.
const dropdownRoot = (): ShadowRoot | null => {
	const dd = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-form-dropdown-field') as HTMLElement | null
	const inner = dd?.shadowRoot?.querySelector('icure-dropdown-field') as HTMLElement | null
	return inner?.shadowRoot ?? null
}
// The shadow root of the n-th text field's inner <icure-text-field>, where the ProseMirror editor and its palette live.
const textFieldRoot = (index = 0): ShadowRoot | null => {
	const tf = document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('icure-form-text-field')[index] as HTMLElement | undefined
	const inner = tf?.shadowRoot?.querySelector('icure-text-field') as HTMLElement | null
	return inner?.shadowRoot ?? null
}
// Focuses that editor so `page.keyboard` types into it. Returns false while it is not mounted yet.
const focusEditor = (index = 0): boolean => {
	const editor = textFieldRoot(index)?.querySelector('.ProseMirror[contenteditable="true"]') as HTMLElement | null
	if (!editor) return false
	editor.focus()
	return true
}
// A snapshot of the palette: visibility, focus, one entry per row in display order, and the editor's content.
const paletteSnapshot = (index = 0) => {
	const root = textFieldRoot(index)
	const palette = root?.querySelector('.suggestion-palette') as HTMLElement | null
	if (!palette) return null
	const lis = Array.from(palette.querySelectorAll('li'))
	const editor = root?.querySelector('.ProseMirror') as HTMLElement | null
	return {
		visible: palette.style.display !== 'none',
		ulFocused: !!palette.querySelector('ul.focused'),
		focus: lis.findIndex((li) => li.classList.contains('focused')),
		rows: lis.map((li) => ({
			kind: li.classList.contains('more') ? 'more' : 'node',
			text: (li.classList.contains('more')
				? li.textContent ?? ''
				: Array.from(li.childNodes)
						.filter((n) => n.nodeType === Node.TEXT_NODE)
						.map((n) => n.textContent ?? '')
						.join('')
			).trim(),
			depth: Number(li.style.getPropertyValue('--depth') || 0),
			expanded: li.querySelector('.chevron')?.getAttribute('aria-expanded') ?? null,
			hasChevron: !!li.querySelector('.chevron'),
			path: li.dataset.path ?? null,
			id: li.id || null,
		})),
		editorText: editor?.textContent ?? '',
		editorHtml: editor?.innerHTML ?? '',
	}
}
// Viewport centre of a palette row (by text) or of its chevron, for real pointer events.
const paletteRect = (text: string, part: 'row' | 'chevron', index = 0) => {
	const palette = textFieldRoot(index)?.querySelector('.suggestion-palette') as HTMLElement | null
	const li = Array.from(palette?.querySelectorAll('li') ?? []).find((el) => (el.textContent ?? '').trim().startsWith(text))
	const target = part === 'chevron' ? li?.querySelector('.chevron') : li
	if (!target) return null
	const r = target.getBoundingClientRect()
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
// Viewport centre of the n-th text field's editor, for a real pointer click back into it.
const editorRect = (index = 0) => {
	const r = textFieldRoot(index)?.querySelector('.ProseMirror')?.getBoundingClientRect()
	return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}
Object.assign(window as any, { __dropdownRoot: dropdownRoot, __focusEditor: focusEditor, __palette: paletteSnapshot, __paletteRect: paletteRect, __editorRect: editorRect })
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
