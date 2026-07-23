# Invalid date/time value validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn the user (inline) and block Continue in the card renderer when a `date`/`time`/`date-time` field holds an unparseable value.

**Architecture:** Invalid input is discarded by the primitive extractors (returns `undefined`), so the container cannot see it — the signal originates in `icure-text-field`, which still holds the raw text in its live ProseMirror doc. The field computes a field-local `invalidValue` predicate on commit, renders an inline warning, and dispatches a composed `field-validity-changed` event. The card renderer listens, recomputes whether the current card has any invalid field, and folds that into its Continue-block predicate.

**Tech Stack:** TypeScript, Lit (LitElement), ProseMirror, date-fns, Jest (ts-jest, node env) for unit tests, Playwright for e2e.

## Global Constraints

- No semicolons; single quotes; trailing commas; `printWidth: 200` (enforced by ESLint/Prettier — run `npx eslint --fix` on touched files).
- `strictNullChecks: true`, `noImplicitAny: true`; `any` is allowed.
- The card renderer's `date` field is a calendar popup and cannot be typed invalid — only `time` and `date-time` produce an `icure-text-field` in the card. The inline warning still applies to `date` in other renderers/themes.
- Empty passes; only non-empty-unparseable blocks. A partially-filled `date-time` (has digits, does not parse to a complete value) counts as invalid — deliberate.
- Block-Continue is card-input-stage only.

---

### Task 1: Pure invalid-input predicate + unit tests

**Files:**
- Modify: `src/components/icure-text-field/primitive-extractors.ts`
- Test: `test/icure-form/primitive-extractors.spec.ts`

**Interfaces:**
- Consumes: existing `extractDatePrimitive`, `extractTimePrimitive`, `extractDateTimePrimitive`, and `PrimitiveType`.
- Produces:
  - `isDateTimeSchemaName(schema: string): schema is 'date' | 'time' | 'date-time'`
  - `hasEnteredValue(text: string | undefined): boolean`
  - `isInvalidDateTimeInput(schema: string, firstText: string | undefined, lastText: string | undefined, extracted: PrimitiveType | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `test/icure-form/primitive-extractors.spec.ts` (inside the top-level `describe`, after the existing blocks):

```ts
import {
	extractDatePrimitive,
	extractDateTimePrimitive,
	extractTimePrimitive,
	isDateTimeSchemaName,
	hasEnteredValue,
	isInvalidDateTimeInput,
} from '../../src/components/icure-text-field/primitive-extractors'

describe('isDateTimeSchemaName', () => {
	it('recognises the three date/time schemas', () => {
		expect(isDateTimeSchemaName('date')).toBe(true)
		expect(isDateTimeSchemaName('time')).toBe(true)
		expect(isDateTimeSchemaName('date-time')).toBe(true)
	})
	it('rejects other schemas', () => {
		expect(isDateTimeSchemaName('measure')).toBe(false)
		expect(isDateTimeSchemaName('styled-text-with-codes')).toBe(false)
	})
})

describe('hasEnteredValue', () => {
	it('is false for the empty mask and empty/undefined input', () => {
		expect(hasEnteredValue('--/--/----')).toBe(false)
		expect(hasEnteredValue('--:--:--')).toBe(false)
		expect(hasEnteredValue('')).toBe(false)
		expect(hasEnteredValue(undefined)).toBe(false)
	})
	it('is true once any digit is entered', () => {
		expect(hasEnteredValue('25/--/----')).toBe(true)
		expect(hasEnteredValue('14:30:15')).toBe(true)
	})
})

describe('isInvalidDateTimeInput', () => {
	it('is false for non-date/time schemas', () => {
		expect(isInvalidDateTimeInput('measure', 'abc', undefined, undefined)).toBe(false)
	})
	it('is false for the empty mask (empty, not invalid)', () => {
		expect(isInvalidDateTimeInput('date', '--/--/----', undefined, extractDatePrimitive('--/--/----'))).toBe(false)
		expect(isInvalidDateTimeInput('time', '--:--:--', undefined, extractTimePrimitive('--:--:--'))).toBe(false)
		expect(isInvalidDateTimeInput('date-time', '--/--/----', '--:--:--', extractDateTimePrimitive('--/--/----', '--:--:--'))).toBe(false)
	})
	it('is false for valid entered values', () => {
		expect(isInvalidDateTimeInput('date', '25/12/2023', undefined, extractDatePrimitive('25/12/2023'))).toBe(false)
		expect(isInvalidDateTimeInput('time', '14:30:15', undefined, extractTimePrimitive('14:30:15'))).toBe(false)
		expect(isInvalidDateTimeInput('date-time', '25/12/2023', '14:30:15', extractDateTimePrimitive('25/12/2023', '14:30:15'))).toBe(false)
	})
	it('is true for non-empty unparseable values', () => {
		expect(isInvalidDateTimeInput('date', '99/99/9999', undefined, extractDatePrimitive('99/99/9999'))).toBe(true)
		expect(isInvalidDateTimeInput('time', '25:59:99', undefined, extractTimePrimitive('25:59:99'))).toBe(true)
	})
	it('treats a partially-filled date-time as invalid', () => {
		expect(isInvalidDateTimeInput('date-time', '25/12/2023', '--:--:--', extractDateTimePrimitive('25/12/2023', '--:--:--'))).toBe(true)
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/icure-form/primitive-extractors.spec.ts`
Expected: FAIL — `isDateTimeSchemaName`, `hasEnteredValue`, `isInvalidDateTimeInput` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/components/icure-text-field/primitive-extractors.ts`:

```ts
export type DateTimeSchemaName = 'date' | 'time' | 'date-time'

/** True for the three schemas whose text is parsed into a datetime primitive. */
export const isDateTimeSchemaName = (schema: string): schema is DateTimeSchemaName => schema === 'date' || schema === 'time' || schema === 'date-time'

/**
 * True when the text carries at least one entered digit, i.e. it is more than
 * the empty mask (`--/--/----`, `--:--:--`). This is what separates an empty
 * field (passes) from one the user typed into.
 */
export const hasEnteredValue = (text: string | undefined): boolean => /\d/.test(text ?? '')

/**
 * True when a date/time field has been typed into but its text does not parse
 * to a value. `extracted` is the result the field already computed with the
 * matching `extract*Primitive` helper. Empty/all-mask input is not invalid.
 * For `date-time`, either part carrying a digit counts as "entered".
 */
export const isInvalidDateTimeInput = (schema: string, firstText: string | undefined, lastText: string | undefined, extracted: PrimitiveType | undefined): boolean => {
	if (!isDateTimeSchemaName(schema)) return false
	const entered = schema === 'date-time' ? hasEnteredValue(firstText) || hasEnteredValue(lastText) : hasEnteredValue(firstText)
	return entered && extracted === undefined
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/icure-form/primitive-extractors.spec.ts`
Expected: PASS (all blocks).

- [ ] **Step 5: Lint and commit**

```bash
npx eslint --fix src/components/icure-text-field/primitive-extractors.ts test/icure-form/primitive-extractors.spec.ts
git add src/components/icure-text-field/primitive-extractors.ts test/icure-form/primitive-extractors.spec.ts
git commit -m "Add invalid date/time input predicate helpers"
```

---

### Task 2: Field-local invalid state, event, and inline warning

**Files:**
- Modify: `src/components/icure-text-field/index.ts`

**Interfaces:**
- Consumes: `isInvalidDateTimeInput` from `./primitive-extractors` (Task 1).
- Produces:
  - Public getter `IcureTextField.hasInvalidValue: boolean` (read by Task 3).
  - Emits `CustomEvent('field-validity-changed', { bubbles: true, composed: true, detail: { label: string, invalid: boolean } })` (consumed by Task 3).

- [ ] **Step 1: Import the predicate**

In `src/components/icure-text-field/index.ts`, the import for the extractors already exists:

```ts
import { extractDatePrimitive, extractDateTimePrimitive, extractTimePrimitive } from './primitive-extractors'
```

Replace it with:

```ts
import { extractDatePrimitive, extractDateTimePrimitive, extractTimePrimitive, isInvalidDateTimeInput } from './primitive-extractors'
```

- [ ] **Step 2: Add reactive state + public getter**

Find (near line 79):

```ts
	@state() private pasteWarning = false
```

Add immediately after it:

```ts
	@state() private invalidValue = false

	/** Whether this field currently holds a non-empty date/time value that cannot be parsed. */
	public get hasInvalidValue(): boolean {
		return this.invalidValue
	}
```

- [ ] **Step 3: Compute invalid state on commit**

In `updateValue`, find the single-value `else` branch:

```ts
		} else {
			const [valueId] = extractSingleValue(this.valueProvider?.())
			const value = this.primitiveTypeExtractor?.(tr.doc)
			this.handleValueChanged?.(
```

Insert the invalid-state update right after `value` is computed (before `this.handleValueChanged?.(`):

```ts
		} else {
			const [valueId] = extractSingleValue(this.valueProvider?.())
			const value = this.primitiveTypeExtractor?.(tr.doc)
			this.updateInvalidValueState(tr.doc, value)
			this.handleValueChanged?.(
```

- [ ] **Step 4: Add the update method and the localized message helper**

Add these two private methods to the `IcureTextField` class (place them just above `private makePrimitiveExtractor(...)`):

```ts
	private updateInvalidValueState(doc: ProsemirrorNode, value: PrimitiveType | undefined): void {
		const invalid = isInvalidDateTimeInput(this.schema, doc?.firstChild?.textContent, doc?.lastChild?.textContent, value)
		if (invalid === this.invalidValue) return
		this.invalidValue = invalid
		this.dispatchEvent(new CustomEvent('field-validity-changed', { bubbles: true, composed: true, detail: { label: this.label, invalid } }))
	}

	private invalidValueMessage(): string {
		const messages: Record<string, string> = { date: 'Invalid date', time: 'Invalid time', 'date-time': 'Invalid date and time' }
		const msg = messages[this.schema] ?? 'Invalid value'
		return this.translationProvider?.(this.language(), msg) ?? msg
	}
```

- [ ] **Step 5: Render the inline warning**

Find the error slot in `renderSync` (near line 324):

```ts
					<div class="error">${validationErrors.map(([, error]) => html`<div>${this.translationProvider?.(this.language(), error) ?? error}</div>`)}</div>
```

Add the invalid-value warning immediately before it:

```ts
					${this.invalidValue ? html`<div class="error invalid-value-error"><div>${this.invalidValueMessage()}</div></div>` : nothing}
					<div class="error">${validationErrors.map(([, error]) => html`<div>${this.translationProvider?.(this.language(), error) ?? error}</div>`)}</div>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no errors.

- [ ] **Step 7: Lint and commit**

```bash
npx eslint --fix src/components/icure-text-field/index.ts
git add src/components/icure-text-field/index.ts
git commit -m "Flag invalid date/time input in icure-text-field with inline warning"
```

---

### Task 3: Block Continue in the card renderer

**Files:**
- Modify: `src/components/icure-form/renderer/card/internal.ts`

**Interfaces:**
- Consumes: `IcureTextField.hasInvalidValue` and the `field-validity-changed` event (Task 2); the existing `queryDeep` helper on the class.
- Produces: card wrapper attribute `data-invalid-format="0" | "1"` (read by Task 4 e2e).

- [ ] **Step 1: Add reactive state**

Find (near line 60):

```ts
	@state() private blockingFailures: Array<{ fieldLabel: string; message: string }> = []
```

Add immediately after it:

```ts
	@state() private hasInvalidFormat = false
```

- [ ] **Step 2: Add the block predicate getter**

Add this getter to the class (place it just above `private buildLabelToCardIndex(...)`):

```ts
	/** Continue/advance is blocked while validators are running, a self-validator fails, or a field holds an invalid date/time value. */
	private get inputBlocked(): boolean {
		return this.evaluating || this.blockingFailures.length > 0 || this.hasInvalidFormat
	}
```

- [ ] **Step 3: Listen for field-validity-changed**

In `connectedCallback`, after the existing `document.addEventListener('keydown', ...)` line, add:

```ts
		this.addEventListener('field-validity-changed', this.onFieldValidityChanged)
```

In `disconnectedCallback`, after the existing `document.removeEventListener('keydown', ...)` line, add:

```ts
		this.removeEventListener('field-validity-changed', this.onFieldValidityChanged)
```

Then add the handler and the compute method to the class (place them just above `buildLabelToCardIndex`, next to `inputBlocked`):

```ts
	private onFieldValidityChanged = (): void => {
		this.computeInvalidFormat()
	}

	/**
	 * Recompute whether any field on the currently-mounted card holds an invalid date/time value.
	 * Only `time` and `date-time` render an `icure-text-field` in the card; `date` is a calendar.
	 * Scoped to `.card__field` hosts so navigation leaves no stale state.
	 */
	private computeInvalidFormat(): void {
		if (this.stage !== 'input') {
			this.hasInvalidFormat = false
			return
		}
		const root = this.shadowRoot
		if (!root) return
		let invalid = false
		for (const host of Array.from(root.querySelectorAll('.card__field'))) {
			const tf = this.queryDeep(host, 'icure-text-field') as (Element & { hasInvalidValue?: boolean }) | null
			if (tf?.hasInvalidValue) {
				invalid = true
				break
			}
		}
		this.hasInvalidFormat = invalid
	}
```

- [ ] **Step 4: Recompute in the watched updated() block**

Find the watched block in `updated` (near line 107):

```ts
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
```

Add a `computeInvalidFormat()` call inside the `if (watching...)` block, after the `if/else if/else` chain:

```ts
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
			this.computeInvalidFormat()
		}
```

- [ ] **Step 5: Use the predicate in renderInput and expose the attribute**

In `renderInput`, find:

```ts
		const blocked = this.evaluating || this.blockingFailures.length > 0
```

Replace with:

```ts
		const blocked = this.inputBlocked
```

In the same method, find the input wrapper opening tag:

```ts
				<div class="card card--stage-input" data-stage="input" data-current-card-index="${idx}" data-total-cards="${total}" data-blocking-failures="${this.blockingFailures.length}">
```

Replace with (append `data-invalid-format`):

```ts
				<div class="card card--stage-input" data-stage="input" data-current-card-index="${idx}" data-total-cards="${total}" data-blocking-failures="${this.blockingFailures.length}" data-invalid-format="${this.hasInvalidFormat ? '1' : '0'}">
```

- [ ] **Step 6: Guard the keyboard advance path**

In `advanceForCurrentStage`, find the `input` case guard:

```ts
				case 'input': {
					if (this.evaluating || this.blockingFailures.length > 0) return false
```

Replace with:

```ts
				case 'input': {
					if (this.inputBlocked) return false
```

- [ ] **Step 7: Guard the click handlers**

Find `onContinue`, `onContinueToReview`, and `onContinueReturnToReview` and add an `inputBlocked` guard at the top of each:

```ts
	private onContinue = () => {
		if (this.inputBlocked) return
		const cards = this.cards
		if (this.currentCardIndex < cards.length - 1) {
			this.currentCardIndex = this.currentCardIndex + 1
		}
	}

	private onContinueToReview = () => {
		if (this.inputBlocked) return
		this.stage = 'review'
	}

	private onContinueReturnToReview = () => {
		if (this.inputBlocked) return
		this.cameFromReview = false
		this.stage = 'review'
	}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no errors.

- [ ] **Step 9: Run the existing card tests do not regress at unit level**

Run: `npx jest`
Expected: PASS — 8 suites (jest only; e2e is separate). No new failures.

- [ ] **Step 10: Lint and commit**

```bash
npx eslint --fix src/components/icure-form/renderer/card/internal.ts
git add src/components/icure-form/renderer/card/internal.ts
git commit -m "Block card Continue while a field holds an invalid date/time value"
```

---

### Task 4: End-to-end test for the card block-Continue flow

**Files:**
- Create: `test/e2e/card-invalid-datetime.spec.ts`

**Interfaces:**
- Consumes: the `data-invalid-format` attribute (Task 3), the `.invalid-value-error` inline warning (Task 2), and the existing test harness (`window.initForm`, `renderer: 'card'`).

- [ ] **Step 1: Write the e2e test**

Create `test/e2e/card-invalid-datetime.spec.ts`:

```ts
import { test, expect, Page } from '@playwright/test'

// ============================================================
// Invalid date/time value blocks Continue in the card renderer
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCard(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'card' }), yaml)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(
		() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			return !!internal?.shadowRoot?.querySelector('.card')
		},
		{ timeout: 15_000 },
	)
}

async function clickByClass(page: Page, cls: string) {
	const ok = await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		if (!btn || (btn as HTMLButtonElement).disabled) return false
		btn.click()
		return true
	}, cls)
	if (!ok) throw new Error(`Button .${cls} not clickable`)
	await page.waitForTimeout(100)
}

// Focus the ProseMirror editor of the time field on the current card.
// Chain: icure-form > icure-card-internal > icure-form-time-picker > icure-text-field > .ProseMirror
async function focusTimeEditor(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const picker = internal?.shadowRoot?.querySelector('icure-form-time-picker') as any
		const textField = picker?.shadowRoot?.querySelector('icure-text-field') as any
		const editor = textField?.shadowRoot?.querySelector('.ProseMirror[contenteditable="true"]') as HTMLElement | null
		if (!editor) return false
		editor.focus()
		return true
	})
}

async function blurActive(page: Page) {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
	await page.waitForTimeout(300)
}

async function invalidFormatFlag(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		return internal?.shadowRoot?.querySelector('.card')?.getAttribute('data-invalid-format') ?? null
	})
}

async function isContinueDisabled(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const btn = internal?.shadowRoot?.querySelector('[class*="card__continue"]') as HTMLButtonElement | null
		return !!btn && btn.disabled
	})
}

async function currentCardIndex(page: Page): Promise<number> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const card = internal?.shadowRoot?.querySelector('.card--stage-input')
		return parseInt(card?.getAttribute('data-current-card-index') ?? '-1', 10)
	})
}

async function invalidWarningVisible(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const picker = internal?.shadowRoot?.querySelector('icure-form-time-picker') as any
		const textField = picker?.shadowRoot?.querySelector('icure-text-field') as any
		return !!textField?.shadowRoot?.querySelector('.invalid-value-error')
	})
}

const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: When
        type: time-picker
      - field: Note
        type: text-field
`

test.describe('Invalid date/time value blocks Continue (card renderer)', () => {
	test('typing an unparseable time shows a warning, disables Continue and blocks Enter; fixing it unblocks', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')

		// On the first input card (the time field). Continue starts enabled (empty passes).
		expect(await currentCardIndex(page)).toBe(0)
		expect(await isContinueDisabled(page)).toBe(false)

		// Type an out-of-range time (mask formats 6 digits to 25:59:99) and blur to commit.
		expect(await focusTimeEditor(page)).toBe(true)
		await page.keyboard.type('255999')
		await page.waitForTimeout(200)
		await blurActive(page)

		expect(await invalidFormatFlag(page)).toBe('1')
		expect(await invalidWarningVisible(page)).toBe(true)
		expect(await isContinueDisabled(page)).toBe(true)

		// Enter must not advance while blocked.
		await page.keyboard.press('Enter')
		await page.waitForTimeout(200)
		expect(await currentCardIndex(page)).toBe(0)

		// Fix the value: select-all, type a valid time, blur.
		expect(await focusTimeEditor(page)).toBe(true)
		await page.keyboard.press('Control+a')
		await page.keyboard.type('143015')
		await page.waitForTimeout(200)
		await blurActive(page)

		expect(await invalidFormatFlag(page)).toBe('0')
		expect(await invalidWarningVisible(page)).toBe(false)
		expect(await isContinueDisabled(page)).toBe(false)
	})
})
```

- [ ] **Step 2: Run the e2e test**

Run: `yarn test:e2e test/e2e/card-invalid-datetime.spec.ts`
Expected: PASS. (If the dev server is not already handled by the Playwright config's `webServer`, the config starts it automatically — see `test/e2e/playwright.config.ts`.)

- [ ] **Step 3: Commit**

```bash
git add test/e2e/card-invalid-datetime.spec.ts
git commit -m "Add e2e test for invalid date/time blocking Continue in card renderer"
```

---

## Final verification

- [ ] Run full unit suite: `npx jest` → all suites PASS.
- [ ] Run full e2e card suite (guards against regression): `yarn test:e2e test/e2e/card-invalid-datetime.spec.ts test/e2e/card-phase3.spec.ts` → PASS.
- [ ] `npx eslint . --ext .ts` → no errors on touched files.
- [ ] `npx tsc --noEmit -p tsconfig.json` → exit 0.

## Notes for the implementer

- Do **not** merge `hasInvalidFormat` into `blockingFailures`: `blockingFailures` is produced by an async `compute`-driven pass guarded by `validationVersion`; the invalid-format signal is synchronous/event-driven and would be clobbered by that lifecycle.
- The inline warning uses the existing `.error` CSS class (already styled) plus an `.invalid-value-error` marker class for test targeting — no SCSS changes are required.
- The card `date` field is a calendar and never produces an `icure-text-field`, so `computeInvalidFormat`'s `querySelectorAll('.card__field')` → `queryDeep(host, 'icure-text-field')` simply finds nothing for date cards. No special-casing needed.
```
