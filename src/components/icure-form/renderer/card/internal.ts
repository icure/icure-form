import { html, LitElement, nothing, PropertyValues, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

import { Field, FieldMetadata, FieldValue, Form, SortOptions } from '../../../model'
import { FormValuesContainer, Suggestion, Version } from '../../../../generic'
import { fieldValuesProvider, getValidationErrorProvider, handleMetadataChangedProvider, handleValueChangedProvider } from '../../../../utils/fields-values-provider'
import { defaultTranslationProvider } from '../../../../utils/languages'
import { getLabels } from '../../../common/utils'
import { filterAndSortOptionsFromFieldDefinition, sortSuggestions } from '../../../../utils/code-utils'
import { currentDate, currentDateTime, currentTime } from '../../../../utils/dates'
import { parsePrimitive } from '../../../../utils/primitive'

import { Card, flatten, flattenWithVisibility } from './flatten'
import { resolveChrome } from './translation-keys'

type Stage = 'welcome' | 'input' | 'review' | 'confirmation'

const CARD_DIGIT_HINTS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// @ts-ignore
import baseCss from './card.scss'

type TranslationProvider = (language: string, text: string) => string
type RevisionsFilter = (field: Field, id: string, history: Version<FieldMetadata>[]) => string[]
type OwnersProvider = (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]>
type OptionsProvider = (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>
type ActionListener = (event: string, payload: unknown) => void

/**
 * Phase 1 stateful card element. Owns the current-card index and Continue/Back navigation.
 *
 * Re-renders when the form, the container, or the language change (Lit @property reactivity).
 * `currentCardIndex` survives container updates because the parent <icure-form> reuses the same
 * element instance across asyncTask re-runs.
 */
export class IcureCardInternal extends LitElement {
	@property({ attribute: false }) form?: Form
	@property({ attribute: false }) formValuesContainer?: FormValuesContainer<FieldValue, FieldMetadata>
	@property({ attribute: false }) translationProvider?: TranslationProvider
	@property({ attribute: false }) revisionsFilter?: RevisionsFilter
	@property({ attribute: false }) ownersProvider?: OwnersProvider
	@property({ attribute: false }) optionsProvider?: OptionsProvider
	@property({ attribute: false }) actionListener?: ActionListener
	@property({ attribute: false }) languages?: { [iso: string]: string }
	@property() language?: string
	@property({ type: Boolean }) readonly = false
	@property({ type: Boolean }) displayMetadata = false
	@property() labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float'
	@property({ type: Number }) questionsPerCard = 1
	// Mirror HTMLElement's ARIA `role` typing (string | null) to allow the attribute form.
	@property() override role: string | null = null

	@state() private currentCardIndex = 0
	@state() private stage: Stage = 'welcome'
	@state() private cameFromReview = false

	// Phase 3 validation state.
	@state() private evaluating = false
	@state() private blockingFailures: Array<{ fieldLabel: string; message: string }> = []
	@state() private reviewFailures: Array<{ fieldLabel: string; cardIndex: number; message: string }> = []
	private validationVersion = 0

	// Phase 4 conditional-re-evaluation state.
	@state() private cards: Card[] = []
	private cardsVersion = 0

	// Phase 5 fast-forward resume state — only attempted once per element instance.
	private fastForwardChecked = false

	static get styles() {
		return [baseCss]
	}

	override connectedCallback(): void {
		super.connectedCallback()
		// Document-level capture: catches keystrokes even when focus is outside this element's
		// subtree (e.g. after the patient clicked on the page background). Capture phase ensures we
		// intercept Enter before inner editors (ProseMirror) consume it.
		document.addEventListener('keydown', this.onKeyDown, { capture: true })
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback()
		document.removeEventListener('keydown', this.onKeyDown, { capture: true })
	}

	protected firstUpdated(): void {
		// Phase 8: ensure focus lands on the appropriate target on initial mount as well.
		this.scheduleFocus()
	}

	protected updated(changedProps: PropertyValues): void {
		// Phase 8: move focus to the most appropriate control after a stage/card transition.
		if (changedProps.has('stage') || changedProps.has('currentCardIndex')) {
			this.scheduleFocus()
		}
		// Phase 4 / 7: seed cards synchronously when the form or chunking changes.
		if (changedProps.has('form') || changedProps.has('questionsPerCard') || changedProps.has('role')) {
			this.cards = this.form ? flatten(this.form, { questionsPerCard: this.questionsPerCard, role: this.role ?? undefined }) : []
		}
		// Phase 4: re-flatten asynchronously (computed `hidden`) on form/container/chunking changes.
		if (changedProps.has('formValuesContainer') || changedProps.has('form') || changedProps.has('questionsPerCard') || changedProps.has('role')) {
			const cardsV = ++this.cardsVersion
			this.reflatten(cardsV)
		}
		const watching: Array<keyof IcureCardInternal> = ['formValuesContainer', 'form', 'currentCardIndex', 'stage', 'language', 'cards' as any]
		if (watching.some((k) => changedProps.has(k as string))) {
			const myVersion = ++this.validationVersion
			if (this.stage === 'input') {
				this.evaluateCurrentCardValidators(myVersion)
			} else if (this.stage === 'review') {
				this.evaluateReviewValidators(myVersion)
			} else {
				this.blockingFailures = []
				this.reviewFailures = []
				this.evaluating = false
			}
		}
	}

	private async reflatten(version: number): Promise<void> {
		if (!this.form) return
		// Remember the field-label currently at the focus position so we can preserve "logical position"
		// across visibility changes (PRD: "stay" semantics on the navigation index).
		const prev = this.cards
		const prevIdx = Math.min(this.currentCardIndex, prev.length - 1)
		const prevFieldLabel = prev[prevIdx]?.fields[0]?.field
		let next: Card[]
		try {
			next = await flattenWithVisibility(this.form, this.formValuesContainer, { questionsPerCard: this.questionsPerCard, role: this.role ?? undefined })
		} catch (e) {
			console.warn('[card] flattenWithVisibility threw; falling back to sync flatten', e)
			next = flatten(this.form, { questionsPerCard: this.questionsPerCard, role: this.role ?? undefined })
		}
		if (version !== this.cardsVersion) return
		this.cards = next
		// Re-align currentCardIndex against the new sequence.
		if (this.stage === 'input' && prevFieldLabel) {
			const found = next.findIndex((c) => c.fields.some((f) => f.field === prevFieldLabel))
			if (found >= 0) {
				this.currentCardIndex = found
			} else {
				// Field went away. Clamp forward — keep the same numeric index where possible, capped.
				this.currentCardIndex = Math.min(prevIdx, Math.max(0, next.length - 1))
			}
		}
		// Phase 5: after the first successful flatten, attempt to fast-forward into the right stage.
		if (!this.fastForwardChecked) {
			this.fastForwardChecked = true
			await this.maybeFastForward(next)
		}
	}

	private fieldHasValue(field: Field): boolean {
		if (!this.formValuesContainer) return false
		try {
			const versioned = fieldValuesProvider(this.formValuesContainer, field, this.revisionsFilter)()
			const ids = Object.keys(versioned)
			if (!ids.length) return false
			const fv = versioned[ids[0]]?.[0]?.value
			const lang = this.language ?? 'en'
			const primitive = fv?.content?.[lang] ?? fv?.content?.['*']
			if (!primitive) return false
			if (primitive.type === 'string') return primitive.value !== undefined && primitive.value !== ''
			return true
		} catch {
			return false
		}
	}

	private async maybeFastForward(cards: Card[]): Promise<void> {
		// Resume only when there's at least one previously-entered value, the patient hasn't navigated yet,
		// and a container is available.
		if (this.stage !== 'welcome') return
		if (!this.formValuesContainer || !cards.length) return
		const anyValue = cards.some((c) => c.fields.some((f) => this.fieldHasValue(f)))
		if (!anyValue) return

		const labelToCard = this.buildLabelToCardIndex(cards)
		let firstUncovered = -1
		for (let i = 0; i < cards.length; i++) {
			const card = cards[i]
			const allHave = card.fields.every((f) => this.fieldHasValue(f))
			if (!allHave) {
				firstUncovered = i
				break
			}
			// Check currently-evaluable validators on this card. Cross-card validators don't block fast-forward.
			let blocked = false
			for (const field of card.fields) {
				for (const validator of field.validators ?? []) {
					let result: { value?: unknown; dependencies?: string[] } | undefined
					try {
						result = await (this.formValuesContainer as any).compute?.(validator.validation)
					} catch {
						continue
					}
					if (result?.value) continue
					const deps = result?.dependencies ?? []
					const isCrossCard = deps.some((d) => {
						const dc = labelToCard.get(d)
						return dc !== undefined && dc > i
					})
					if (!isCrossCard) {
						blocked = true
						break
					}
				}
				if (blocked) break
			}
			if (blocked) {
				firstUncovered = i
				break
			}
		}
		if (firstUncovered === -1) {
			// All input cards complete & valid -> go straight to review.
			this.stage = 'review'
		} else {
			this.stage = 'input'
			this.currentCardIndex = firstUncovered
		}
	}

	render(): TemplateResult {
		if (!this.form) {
			return html`<p>missing form</p>`
		}
		const cards = this.cards
		if (!cards.length) {
			return html`<div class="card card--empty">
				<p>This form has no patient-facing questions.</p>
			</div>`
		}

		if (this.stage === 'welcome') {
			return this.renderWelcome(cards.length)
		}
		if (this.stage === 'review') {
			return this.renderReview(cards)
		}
		if (this.stage === 'confirmation') {
			return this.renderConfirmation()
		}
		// 'input'
		const idx = Math.min(this.currentCardIndex, cards.length - 1)
		return this.renderInput(cards, idx)
	}

	private renderWelcome(totalCards: number): TemplateResult {
		const tp = this.translation()
		const title = this.form?.form ?? ''
		const description = this.form?.description ?? ''
		const translatedTitle = tp && this.language ? tp(this.language, title) : title
		const translatedDescription = tp && this.language && description ? tp(this.language, description) : description
		const startLabel = resolveChrome(tp, this.language, 'start')
		return html`
			<div class="card card--stage-welcome" data-stage="welcome" data-total-cards="${totalCards}">
				<div class="card__card">
					<div class="card__card-body">
						<h1 class="card__welcome-title">${translatedTitle}</h1>
						${translatedDescription ? html`<p class="card__welcome-description">${translatedDescription}</p>` : nothing}
					</div>
				</div>
				<div class="card__nav">
					<span class="card__back-placeholder"></span>
					<button class="card__start" type="button" @click="${this.onStart}">
						<span class="card__action-label">${startLabel}</span>
						<span class="card__key-hint" aria-hidden="true">↵</span>
					</button>
				</div>
			</div>
		`
	}

	private renderInput(cards: Card[], idx: number): TemplateResult {
		const card = cards[idx]
		const total = cards.length
		const isLast = idx === total - 1
		const blocked = this.evaluating || this.blockingFailures.length > 0
		const tp = this.translation()
		const continueLabel = resolveChrome(tp, this.language, 'continue')
		const backLabel = resolveChrome(tp, this.language, 'back')
		const progressLabel = resolveChrome(tp, this.language, 'progress', { current: idx + 1, total })
		const localisedSectionTitle = this.localiseChromeText(card.sectionTitle)
		const localisedGroupTitle = card.groupTitle ? this.localiseGroupTitle(card.groupTitle) : undefined
		return html`
			<div class="card card--stage-input" data-stage="input" data-current-card-index="${idx}" data-total-cards="${total}" data-blocking-failures="${this.blockingFailures.length}">
				<div class="card__progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${idx + 1}" aria-label="${progressLabel}">
					<div class="card__progress-bar" style="width: ${((idx + 1) / total) * 100}%"></div>
					<div class="card__progress-text" aria-live="polite">${progressLabel}</div>
				</div>
				<div class="card__card" data-card-section="${card.sectionTitle}">
					<div class="card__card-header">
						<div class="card__section-title">${localisedSectionTitle}</div>
						${localisedGroupTitle ? html`<div class="card__group-title">${localisedGroupTitle}</div>` : nothing}
					</div>
					<div class="card__card-body">${card.fields.map((f) => this.renderField(f))}</div>
				</div>
				<div class="card__nav">
					<button class="card__back" type="button" @click="${this.onBack}">${backLabel}</button>
					${this.cameFromReview
						? html`<button class="card__continue card__continue--return-to-review" type="button" ?disabled="${blocked}" @click="${this.onContinueReturnToReview}">
								<span class="card__action-label">${continueLabel}</span>
								<span class="card__key-hint" aria-hidden="true">↵</span>
						  </button>`
						: isLast
						? html`<button class="card__continue card__continue--to-review" type="button" ?disabled="${blocked}" @click="${this.onContinueToReview}">
								<span class="card__action-label">${continueLabel}</span>
								<span class="card__key-hint" aria-hidden="true">↵</span>
						  </button>`
						: html`<button class="card__continue" type="button" ?disabled="${blocked}" @click="${this.onContinue}">
								<span class="card__action-label">${continueLabel}</span>
								<span class="card__key-hint" aria-hidden="true">↵</span>
						  </button>`}
				</div>
			</div>
		`
	}

	private renderReview(cards: Card[]): TemplateResult {
		const tp = this.translation()
		const language = this.language ?? 'en'
		// Group cards by their section title to preserve PRD-mandated grouping in review chrome.
		const groupedBySection: { sectionTitle: string; entries: { card: Card; index: number }[] }[] = []
		cards.forEach((card, index) => {
			const last = groupedBySection[groupedBySection.length - 1]
			if (last && last.sectionTitle === card.sectionTitle) {
				last.entries.push({ card, index })
			} else {
				groupedBySection.push({ sectionTitle: card.sectionTitle, entries: [{ card, index }] })
			}
		})

		const submitBlocked = this.evaluating || this.reviewFailures.length > 0
		const reviewHeading = resolveChrome(tp, this.language, 'reviewHeading')
		const editLabel = resolveChrome(tp, this.language, 'reviewEdit')
		const backLabel = resolveChrome(tp, this.language, 'back')
		const submitLabel = resolveChrome(tp, this.language, 'submit')
		const reviewErrorsTitle = resolveChrome(tp, this.language, 'reviewErrorsTitle')
		const reviewEmpty = resolveChrome(tp, this.language, 'reviewEmpty')
		return html`
			<div class="card card--stage-review" data-stage="review" data-total-cards="${cards.length}" data-review-failures="${this.reviewFailures.length}">
				<div class="card__card">
					<div class="card__card-body">
						<h2 class="card__review-heading">${reviewHeading}</h2>
						${this.reviewFailures.length
							? html`
									<div class="card__review-errors" role="alert">
										<h3 class="card__review-errors-title">${reviewErrorsTitle}</h3>
										<ul class="card__review-errors-list">
											${this.reviewFailures.map(
												(f) => html`
													<li class="card__review-errors-item" data-error-field-label="${f.fieldLabel}" data-error-card-index="${f.cardIndex}">
														<span class="card__review-errors-message">${f.message}</span>
														<button class="card__review-errors-jump" type="button" @click="${() => this.onEditJump(f.cardIndex)}">${editLabel}</button>
													</li>
												`,
											)}
										</ul>
									</div>
							  `
							: nothing}
						${groupedBySection.map(
							(g) => html`
								<div class="card__review-section">
									<h3 class="card__review-section-title">${this.localiseChromeText(g.sectionTitle)}</h3>
									<ul class="card__review-list" role="list">
										${g.entries.map(
											(e) =>
												html`${e.card.fields.map((field) => {
													const value = this.extractDisplayValue(field, language)
													const labelText = field.shortLabel ?? field.field
													const localisedLabel = field.translate && tp && this.language ? tp(this.language, labelText) : labelText
													return html`
														<li class="card__review-row" data-field-label="${field.field}" data-card-index="${e.index}">
															<span class="card__review-label" title="${localisedLabel}">${localisedLabel}</span>
															<span class="card__review-value">${value || html`<span class="card__review-empty">${reviewEmpty}</span>`}</span>
															<button class="card__review-edit" type="button" aria-label="${editLabel} ${localisedLabel}" @click="${() => this.onEditJump(e.index)}">${editLabel}</button>
														</li>
													`
												})}`,
										)}
									</ul>
								</div>
							`,
						)}
					</div>
				</div>
				<div class="card__nav">
					<button class="card__back" type="button" @click="${this.onBackFromReview}">${backLabel}</button>
					<button class="card__submit" type="button" ?disabled="${submitBlocked}" @click="${this.onSubmit}">
						<span class="card__action-label">${submitLabel}</span>
						<span class="card__key-hint" aria-hidden="true">↵</span>
					</button>
				</div>
			</div>
		`
	}

	private renderConfirmation(): TemplateResult {
		const tp = this.translation()
		const heading = resolveChrome(tp, this.language, 'confirmationHeading')
		const body = resolveChrome(tp, this.language, 'confirmationBody')
		return html`
			<div class="card card--stage-confirmation" data-stage="confirmation">
				<div class="card__card card__card--confirmation">
					<div class="card__card-body">
						<div class="card__confirmation-check" aria-hidden="true">✓</div>
						<h2 class="card__confirmation-heading">${heading}</h2>
						<p class="card__confirmation-body">${body}</p>
					</div>
				</div>
			</div>
		`
	}

	// ---- Navigation handlers ----

	private onStart = () => {
		this.stage = 'input'
		this.currentCardIndex = 0
	}

	private onContinue = () => {
		const cards = this.cards
		if (this.currentCardIndex < cards.length - 1) {
			this.currentCardIndex = this.currentCardIndex + 1
		}
	}

	private onContinueToReview = () => {
		this.stage = 'review'
	}

	private onContinueReturnToReview = () => {
		this.cameFromReview = false
		this.stage = 'review'
	}

	private onBack = () => {
		if (this.currentCardIndex > 0) {
			this.currentCardIndex = this.currentCardIndex - 1
		} else {
			this.stage = 'welcome'
		}
	}

	private onBackFromReview = () => {
		this.stage = 'input'
		this.currentCardIndex = Math.max(0, this.cards.length - 1)
	}

	private onEditJump = (cardIndex: number) => {
		this.stage = 'input'
		this.currentCardIndex = cardIndex
		this.cameFromReview = true
	}

	private onSubmit = () => {
		this.stage = 'confirmation'
		this.dispatchEvent(new CustomEvent('card-form-submit', { detail: { submittedAt: new Date() }, bubbles: true, composed: true }))
	}

	// ---- Keyboard navigation ----

	private onKeyDown = (e: KeyboardEvent): void => {
		// Capturing-phase listener: runs before any inner editor sees the keystroke.
		if (e.altKey || e.metaKey || e.ctrlKey) return
		const path = e.composedPath()
		if (!this.isOurKeyboardContext(path)) return
		const editing = this.classifyEditingTarget(path)
		if (e.key === 'Enter') {
			// Let Enter through for multi-line editors and for native button activation.
			if (editing.multiline || editing.isButton) return
			const advanced = this.advanceForCurrentStage()
			if (advanced) {
				e.preventDefault()
				e.stopImmediatePropagation()
			}
			return
		}
		if (/^[1-9]$/.test(e.key) && !editing.anyText) {
			const handled = this.activateOptionByDigit(parseInt(e.key, 10))
			if (handled) {
				e.preventDefault()
				e.stopImmediatePropagation()
			}
		}
	}

	/**
	 * Are we the card instance that should respond to this keystroke? True if the event
	 * originates within our DOM subtree, or if focus has dropped to the document body (typical when
	 * the patient clicks the form's background).
	 */
	private isOurKeyboardContext(path: EventTarget[]): boolean {
		if (path.includes(this)) return true
		const active = document.activeElement
		return !active || active === document.body || active === document.documentElement
	}

	private classifyEditingTarget(path: EventTarget[]): { anyText: boolean; multiline: boolean; isButton: boolean } {
		const target = path[0] as Element | undefined
		if (!target) return { anyText: false, multiline: false, isButton: false }
		const tag = (target as Element).tagName
		if (tag === 'BUTTON') return { anyText: false, multiline: false, isButton: true }
		if (tag === 'TEXTAREA') return { anyText: true, multiline: true, isButton: false }
		if (tag === 'INPUT') {
			const type = (target as HTMLInputElement).type
			const textTypes = ['text', 'email', 'tel', 'url', 'number', 'search', 'password', 'date', 'time', 'datetime-local']
			if (textTypes.includes(type)) return { anyText: true, multiline: false, isButton: false }
			return { anyText: false, multiline: false, isButton: false }
		}
		if ((target as HTMLElement).isContentEditable) {
			const textField = path.find((n) => (n as Element).tagName?.toLowerCase() === 'icure-form-text-field') as HTMLElement | undefined
			const ml = textField ? !!(textField as any).multiline : false
			return { anyText: true, multiline: ml, isButton: false }
		}
		return { anyText: false, multiline: false, isButton: false }
	}

	private advanceForCurrentStage(): boolean {
		switch (this.stage) {
			case 'welcome':
				this.onStart()
				return true
			case 'input': {
				if (this.evaluating || this.blockingFailures.length > 0) return false
				const cards = this.cards
				if (!cards.length) return false
				const isLast = this.currentCardIndex === cards.length - 1
				if (this.cameFromReview) this.onContinueReturnToReview()
				else if (isLast) this.onContinueToReview()
				else this.onContinue()
				return true
			}
			case 'review':
				if (this.evaluating || this.reviewFailures.length > 0) return false
				this.onSubmit()
				return true
			default:
				return false
		}
	}

	private activateOptionByDigit(digit: number): boolean {
		if (this.stage !== 'input') return false
		const cards = this.cards
		if (!cards.length) return false
		const idx = Math.min(this.currentCardIndex, cards.length - 1)
		const card = cards[idx]
		const field = card.fields.find((f) => f.type === 'radio-button' || f.type === 'checkbox')
		if (!field) return false
		const root = this.shadowRoot
		if (!root) return false
		const fieldTag = field.type === 'radio-button' ? 'icure-form-radio-button' : 'icure-form-checkbox'
		const fieldEl = root.querySelector(fieldTag) as HTMLElement | null
		if (!fieldEl) return false
		const buttonGroup = this.queryDeep(fieldEl, 'icure-button-group') as HTMLElement | null
		const buttonGroupShadow = buttonGroup?.shadowRoot
		if (!buttonGroupShadow) return false
		const inputs = Array.from(buttonGroupShadow.querySelectorAll('input.icure-checkbox')) as HTMLInputElement[]
		const input = inputs[digit - 1]
		if (!input || input.disabled) return false
		input.click()
		return true
	}

	// ---- Phase 8: focus management ----

	private scheduleFocus(): void {
		// Defer past Lit's commit and one paint cycle so nested custom elements have a chance to
		// upgrade and expose their internal contenteditable.
		requestAnimationFrame(() => requestAnimationFrame(() => this.moveFocusForCurrentStage()))
	}

	private moveFocusForCurrentStage(): void {
		const root = this.shadowRoot
		if (!root) return
		// Preferred focus targets per stage. Input-stage focus aims at the first interactive form field;
		// other stages focus their primary action button.
		const selectorByStage: Record<Stage, string[]> = {
			welcome: ['.card__start'],
			input: ['.card__field input', '.card__field textarea', '.card__field select', '.card__field [contenteditable="true"]', '.card__continue'],
			review: ['.card__submit'],
			confirmation: ['.card__confirmation-heading'],
		}
		const candidates = selectorByStage[this.stage] ?? []
		for (const sel of candidates) {
			const target = this.queryDeep(root, sel)
			if (target && typeof (target as HTMLElement).focus === 'function') {
				try {
					;(target as HTMLElement).focus({ preventScroll: false })
				} catch {
					/* ignore */
				}
				return
			}
		}
	}

	/**
	 * shadow-DOM-aware querySelector that pierces nested shadow roots so we can focus the first
	 * actual editable element inside a custom field component (e.g. the contenteditable inside
	 * icure-form-text-field).
	 */
	private queryDeep(root: DocumentFragment | ShadowRoot | Element, selector: string): Element | null {
		const direct = root.querySelector(selector)
		if (direct) return direct
		const allElements = root.querySelectorAll('*')
		for (const el of [root, ...Array.from(allElements)]) {
			const sr = (el as Element).shadowRoot
			if (sr) {
				const found = this.queryDeep(sr, selector)
				if (found) return found
			}
		}
		return null
	}

	// ---- Phase 3: validation classification ----

	private buildLabelToCardIndex(cards: Card[]): Map<string, number> {
		const out = new Map<string, number>()
		cards.forEach((c, i) => {
			for (const f of c.fields) {
				if (!out.has(f.field)) out.set(f.field, i)
			}
		})
		return out
	}

	private async evaluateCurrentCardValidators(version: number): Promise<void> {
		if (!this.formValuesContainer || !this.form) return
		const cards = this.cards
		if (!cards.length) return
		const idx = Math.min(this.currentCardIndex, cards.length - 1)
		const card = cards[idx]
		const labelToCard = this.buildLabelToCardIndex(cards)
		this.evaluating = true
		const blocking: Array<{ fieldLabel: string; message: string }> = []
		try {
			for (const field of card.fields) {
				for (const validator of field.validators ?? []) {
					let result: { value?: unknown; dependencies?: string[] } | undefined
					try {
						result = await (this.formValuesContainer as any).compute?.(validator.validation)
					} catch (e) {
						console.warn('[card] validator threw', validator.validation, e)
						continue
					}
					if (version !== this.validationVersion) return
					if (result?.value) continue // passes
					const deps = result?.dependencies ?? []
					const isCrossCard = deps.some((d) => {
						const depCard = labelToCard.get(d)
						return depCard !== undefined && depCard > idx
					})
					if (!isCrossCard) {
						blocking.push({ fieldLabel: field.field, message: validator.message })
					}
				}
			}
		} finally {
			if (version === this.validationVersion) {
				this.evaluating = false
				this.blockingFailures = blocking
			}
		}
	}

	private async evaluateReviewValidators(version: number): Promise<void> {
		if (!this.formValuesContainer || !this.form) return
		const cards = this.cards
		this.evaluating = true
		const failures: Array<{ fieldLabel: string; cardIndex: number; message: string }> = []
		try {
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i]
				for (const field of card.fields) {
					for (const validator of field.validators ?? []) {
						let result: { value?: unknown; dependencies?: string[] } | undefined
						try {
							result = await (this.formValuesContainer as any).compute?.(validator.validation)
						} catch (e) {
							console.warn('[card] validator threw at review', validator.validation, e)
							continue
						}
						if (version !== this.validationVersion) return
						if (!result?.value) {
							failures.push({ fieldLabel: field.field, cardIndex: i, message: validator.message })
						}
					}
				}
			}
		} finally {
			if (version === this.validationVersion) {
				this.evaluating = false
				this.reviewFailures = failures
			}
		}
	}

	// ---- Review value extraction ----

	private extractDisplayValue(field: Field, language: string): string {
		const fvc = this.formValuesContainer
		if (!fvc) return ''
		const versioned = fieldValuesProvider(fvc, field, this.revisionsFilter)()
		// versioned is { [id]: Version<FieldValue>[] } where versions are most recent first.
		const ids = Object.keys(versioned)
		if (!ids.length) return ''
		// Take the first id's most recent version's value.
		const versions = versioned[ids[0]]
		if (!versions?.length) return ''
		const fv = versions[0]?.value
		const primitive = fv?.content?.[language] ?? fv?.content?.['*']
		if (!primitive) return ''
		// Radio/checkbox values arrive as a compound primitive whose entries are `true` per selected
		// option id. `parsePrimitive` on those just yields ["true", ...]; the human-readable choice
		// labels live on `fv.codes` (populated by IcureButtonGroup.checkboxChange).
		if (primitive.type === 'compound') {
			const codes = fv?.codes ?? []
			if (!codes.length) return ''
			const tp = this.translation()
			const translate = field.translate !== false
			const labels = codes.map((c) => {
				const raw = c.label?.[language] ?? c.label?.['*'] ?? c.id
				return translate && tp && this.language ? tp(this.language, raw) : raw
			})
			return labels.join(', ')
		}
		const parsed = parsePrimitive(primitive, true, language)
		return parsed === undefined ? '' : String(parsed)
	}

	// ---- Field rendering ----

	private composedOptionsProvider(): ((language: string, codifications: string[], terms?: string[], sortOptions?: SortOptions) => Promise<Suggestion[]>) | undefined {
		const optionsProvider = this.optionsProvider
		const form = this.form
		if (!optionsProvider) return undefined
		if (!form?.codifications) {
			return (language: string, codifications: string[], terms?: string[], sortOptions?: SortOptions) =>
				optionsProvider(language, codifications, terms).then((codes) => sortSuggestions(codes, language, sortOptions))
		}
		return async (language: string, codifications: string[], terms?: string[], sortOptions?: SortOptions): Promise<Suggestion[]> => {
			const originalOptions = await optionsProvider(language, codifications, terms)
			return sortSuggestions(
				originalOptions.concat(
					form.codifications
						?.filter((c) => codifications.includes(c.type))
						?.flatMap((c) =>
							c.codes
								.filter((c) => (terms ?? []).map((st) => st.toLowerCase()).every((st) => (c.label?.[language] ?? c.id).toLowerCase().includes(st)))
								.map((c) => ({ id: c.id, label: c.label ?? { [language]: c.id }, text: c.label?.[language] ?? c.id, terms: terms ?? [] })),
						) ?? [],
				),
				language,
				sortOptions,
			)
		}
	}

	private translation(): TranslationProvider | undefined {
		return this.translationProvider ?? (this.form?.translations ? defaultTranslationProvider(this.form.translations) : undefined)
	}

	/**
	 * Run a raw author-provided string (Section.section, Group.group, etc.) through the same
	 * translation pipeline the clinician renderer uses. When no provider/language is available
	 * or the provider returns the key unchanged, the original string is returned untouched.
	 */
	private localiseChromeText(raw: string | undefined): string {
		if (!raw) return ''
		const tp = this.translation()
		if (!tp || !this.language) return raw
		const translated = tp(this.language, raw)
		return translated ?? raw
	}

	/**
	 * Group titles are emitted as "Outer / Inner" by the flatten step when groups nest. Translate
	 * each segment individually so the joiner is preserved.
	 */
	private localiseGroupTitle(raw: string): string {
		return raw
			.split(' / ')
			.map((part) => this.localiseChromeText(part))
			.join(' / ')
	}

	private renderField(fg: Field): TemplateResult | typeof nothing {
		const fvc = this.formValuesContainer
		const tp = this.translation()
		const composedOpts = this.composedOptionsProvider()
		const readonly = this.readonly || fg.readonly
		const optsForCodifiable =
			composedOpts && fg.codifications?.length
				? (language: string, terms?: string[]) => composedOpts(language, fg.codifications ?? [], terms, fg.sortOptions)
				: (language: string, terms?: string[]) => filterAndSortOptionsFromFieldDefinition(language, fg, this.translationProvider, terms)
		const common = {
			class: 'icure-form-field card__field',
			label: fg.field,
			displayedLabels: getLabels(fg),
			displayMetadata: this.displayMetadata,
			defaultLanguage: this.language,
			translationProvider: tp,
			validationErrorsProvider: getValidationErrorProvider(fvc, fg),
			valueProvider: fvc && fieldValuesProvider(fvc, fg, this.revisionsFilter),
			metadataProvider: fvc && fvc.getMetadata.bind(fvc),
			handleValueChanged: handleValueChangedProvider(fvc, fg),
			handleMetadataChanged: handleMetadataChangedProvider(fvc),
			styleOptions: fg.styleOptions,
			readonly,
		}
		switch (fg.type) {
			case 'text-field':
				return html`<icure-form-text-field
					class="${common.class}"
					label="${common.label}"
					value="${fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.multiline="${fg.multiline || false}"
					.lines=${fg.rowSpan ?? 1}
					.defaultLanguage="${common.defaultLanguage}"
					.languages="${this.languages}"
					.linksProvider=${fg.options?.linksProvider}
					.suggestionProvider=${fg.options?.suggestionProvider}
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.codeColorProvider=${fg.options?.codeColorProvider}
					.linkColorProvider=${fg.options?.linkColorProvider}
					.codeContentProvider=${fg.options?.codeContentProvider}
					.defaultValueProvider=${fvc?.getDefaultValueProvider?.(fg.field)}
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-text-field>`
			case 'measure-field':
				return html`<icure-form-measure-field
					class="${common.class}"
					label="${common.label}"
					value="${fg.value ?? ''}"
					unit="${fg.unit ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-measure-field>`
			case 'number-field':
				return html`<icure-form-number-field
					class="${common.class}"
					label="${common.label}"
					value="${fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-number-field>`
			case 'token-field':
				return html`<icure-form-token-field
					class="${common.class}"
					label="${common.label}"
					value="${fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.multiline="${fg.multiline || false}"
					.lines=${fg.rowSpan ?? 1}
					.defaultLanguage="${common.defaultLanguage}"
					.suggestionProvider=${fg.options?.suggestionProvider}
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-token-field>`
			case 'items-list-field':
				return html`<icure-form-items-list-field
					class="${common.class}"
					label="${common.label}"
					value="${fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.multiline="${fg.multiline || false}"
					.lines=${fg.rowSpan ?? 1}
					.defaultLanguage="${common.defaultLanguage}"
					.suggestionProvider=${fg.options?.suggestionProvider}
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-items-list-field>`
			case 'date-picker':
				return html`<icure-form-date-picker
					class="${common.class}"
					label="${common.label}"
					value="${fg.now ? currentDate() : fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-date-picker>`
			case 'time-picker':
				return html`<icure-form-time-picker
					class="${common.class}"
					label="${common.label}"
					value="${fg.now ? currentTime() : fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-time-picker>`
			case 'date-time-picker':
				return html`<icure-form-date-time-picker
					class="${common.class}"
					label="${common.label}"
					value="${fg.now ? currentDateTime() : fg.value ?? ''}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-date-time-picker>`
			case 'dropdown-field':
			case 'dropdown' as any:
				return html`<icure-form-dropdown-field
					class="${common.class}"
					.label=${common.label}
					.displayedLabels=${common.displayedLabels}
					.defaultLanguage="${common.defaultLanguage}"
					.translate="${fg.translate}"
					.sortOptions="${fg.sortOptions}"
					value="${fg.value ?? ''}"
					.codifications="${fg.codifications}"
					.optionsProvider="${optsForCodifiable}"
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
				></icure-form-dropdown-field>`
			case 'radio-button':
				return html`<icure-form-radio-button
					class="${common.class}"
					.label="${common.label}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translate="${fg.translate}"
					.sortOptions="${fg.sortOptions}"
					.codifications="${fg.codifications}"
					.optionsProvider="${optsForCodifiable}"
					.ownersProvider=${this.ownersProvider}
					.translationProvider=${common.translationProvider}
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider=${common.metadataProvider}
					.handleValueChanged=${common.handleValueChanged}
					.handleMetadataChanged=${common.handleMetadataChanged}
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
					.keyboardHints=${CARD_DIGIT_HINTS}
				></icure-form-radio-button>`
			case 'checkbox':
				return html`<icure-form-checkbox
					class="${common.class}"
					.label="${common.label}"
					.displayedLabels="${common.displayedLabels}"
					.displayMetadata="${common.displayMetadata}"
					.defaultLanguage="${common.defaultLanguage}"
					.translate="${fg.translate}"
					.sortOptions="${fg.sortOptions}"
					value="${fg.value ?? ''}"
					.codifications="${fg.codifications}"
					.optionsProvider="${optsForCodifiable}"
					.ownersProvider="${this.ownersProvider}"
					.translationProvider="${common.translationProvider}"
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.valueProvider="${common.valueProvider}"
					.metadataProvider="${common.metadataProvider}"
					.handleValueChanged="${common.handleValueChanged}"
					.handleMetadataChanged="${common.handleMetadataChanged}"
					.styleOptions="${common.styleOptions}"
					.readonly="${common.readonly}"
					.keyboardHints=${CARD_DIGIT_HINTS}
				></icure-form-checkbox>`
			case 'label':
				return html`<icure-form-label
					class="${common.class} card__label-field"
					.defaultLanguage="${common.defaultLanguage}"
					labelPosition=${this.labelPosition}
					label="${fg.shortLabel ?? fg.field}"
					.translationProvider="${common.translationProvider}"
					.validationErrorsProvider="${common.validationErrorsProvider}"
					.styleOptions="${common.styleOptions}"
				></icure-form-label>`
			default:
				// Defensive: any future field type that isn't explicitly handled is silently skipped.
				// Button (type=action) is filtered before this point by the flatten step.
				return nothing
		}
	}
}

// Expose a helper for tests / hosts to peek at the flatten result without instantiating the element.
export { flatten } from './flatten'
