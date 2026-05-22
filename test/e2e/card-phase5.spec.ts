import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 5: auto fast-forward resume
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCardWithPrefill(page: Page, yaml: string, prefill: Array<{ label: string; value: string }>) {
	return await page.evaluate(
		async ({ yaml, prefill }: { yaml: string; prefill: any[] }) =>
			(window as any).initForm({ yaml, language: 'en', renderer: 'card', prefill }),
		{ yaml, prefill },
	)
}

async function initCardEmpty(page: Page, yaml: string) {
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

async function getStageAndIndex(page: Page) {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const wrapper = internal?.shadowRoot?.querySelector('.card')
		return {
			stage: wrapper?.getAttribute('data-stage') ?? null,
			currentCardIndex: parseInt(wrapper?.getAttribute('data-current-card-index') ?? '-1', 10),
			totalCards: parseInt(wrapper?.getAttribute('data-total-cards') ?? '-1', 10),
		}
	})
}

// Wait for the async reflatten + fast-forward pass to settle.
async function waitForFastForward(page: Page) {
	await page.waitForTimeout(500)
}

// ============================================================
// Empty container -> welcome (no fast-forward)
// ============================================================
test.describe('Phase 5 / empty container stays on welcome', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
`

	test('first-time use: stage remains "welcome"', async ({ page }) => {
		await gotoHarness(page)
		await initCardEmpty(page, yaml)
		await waitForInternal(page)
		await waitForFastForward(page)
		expect((await getStageAndIndex(page)).stage).toBe('welcome')
	})
})

// ============================================================
// Partial fill -> first unanswered card
// ============================================================
test.describe('Phase 5 / partial fill jumps to first unanswered card', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
      - field: Q3
        type: text-field
`

	test('with only Q1 filled, fast-forward lands on Q2 (idx 1)', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [{ label: 'Q1', value: 'one' }])
		await waitForInternal(page)
		await waitForFastForward(page)
		const s = await getStageAndIndex(page)
		expect(s.stage).toBe('input')
		expect(s.currentCardIndex).toBe(1)
	})

	test('with Q1 and Q2 filled, fast-forward lands on Q3 (idx 2)', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [
			{ label: 'Q1', value: 'one' },
			{ label: 'Q2', value: 'two' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		const s = await getStageAndIndex(page)
		expect(s.stage).toBe('input')
		expect(s.currentCardIndex).toBe(2)
	})

	test('with Q1 filled but Q2 missing in the middle, fast-forward stops at Q2 (idx 1) — order preserved', async ({ page }) => {
		await gotoHarness(page)
		// Q1 and Q3 filled; Q2 missing.
		await initCardWithPrefill(page, yaml, [
			{ label: 'Q1', value: 'one' },
			{ label: 'Q3', value: 'three' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		const s = await getStageAndIndex(page)
		expect(s.stage).toBe('input')
		expect(s.currentCardIndex).toBe(1)
	})
})

// ============================================================
// All filled -> straight to review
// ============================================================
test.describe('Phase 5 / fully completed forms land at review', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
`

	test('with all fields filled, fast-forward lands at the review stage', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [
			{ label: 'Q1', value: 'one' },
			{ label: 'Q2', value: 'two' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		expect((await getStageAndIndex(page)).stage).toBe('review')
	})
})

// ============================================================
// Validators interact with fast-forward
// ============================================================
test.describe('Phase 5 / fast-forward stops at the first invalid card', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
        validators:
          - validation: |
              return text(self['Q1'])?.length >= 3
            message: Q1 must be at least 3 characters
      - field: Q2
        type: text-field
`

	test('a previously-answered field whose validator now fails halts fast-forward at that card', async ({ page }) => {
		await gotoHarness(page)
		// Q1 was filled with a short value that fails the >=3 chars validator. Q2 has a value too.
		await initCardWithPrefill(page, yaml, [
			{ label: 'Q1', value: 'ab' },
			{ label: 'Q2', value: 'two' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		const s = await getStageAndIndex(page)
		expect(s.stage).toBe('input')
		expect(s.currentCardIndex).toBe(0)
	})

	test('validators that pass do not halt fast-forward', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [
			{ label: 'Q1', value: 'longenough' },
			{ label: 'Q2', value: 'two' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		expect((await getStageAndIndex(page)).stage).toBe('review')
	})
})

// ============================================================
// Fast-forward respects conditional re-evaluation (Phase 4 composition)
// ============================================================
test.describe('Phase 5 / fast-forward composes with conditional hiding', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Mode
        type: text-field
      - field: Conditional
        type: text-field
        computedProperties:
          hidden: |
            return text(self['Mode']) !== 'show'
      - field: Tail
        type: text-field
`

	test('with Mode=hide and Tail filled but Conditional empty, fast-forward sees 2 cards and lands at review', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [
			{ label: 'Mode', value: 'hide' },
			{ label: 'Tail', value: 'tail-value' },
		])
		await waitForInternal(page)
		await waitForFastForward(page)
		// Conditional is hidden (Mode != show), so total cards = 2 and both are filled => review.
		const s = await getStageAndIndex(page)
		expect(s.stage).toBe('review')
		expect(s.totalCards).toBe(2)
	})
})

// ============================================================
// Fast-forward runs at most once
// ============================================================
test.describe('Phase 5 / fast-forward is one-shot', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
`

	test('navigating back to welcome does NOT re-trigger fast-forward', async ({ page }) => {
		await gotoHarness(page)
		await initCardWithPrefill(page, yaml, [{ label: 'Q1', value: 'one' }])
		await waitForInternal(page)
		await waitForFastForward(page)
		// Initially fast-forwarded to Q2 (idx 1).
		expect((await getStageAndIndex(page)).currentCardIndex).toBe(1)
		// Press Back to go back to Q1.
		await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const btn = internal?.shadowRoot?.querySelector('.card__back') as HTMLElement | null
			btn?.click()
		})
		await page.waitForTimeout(200)
		expect((await getStageAndIndex(page)).currentCardIndex).toBe(0)
		// Press Back again to go to welcome.
		await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const btn = internal?.shadowRoot?.querySelector('.card__back') as HTMLElement | null
			btn?.click()
		})
		await page.waitForTimeout(300)
		// Stage is welcome and stays there — fast-forward must not re-fire.
		expect((await getStageAndIndex(page)).stage).toBe('welcome')
	})
})
