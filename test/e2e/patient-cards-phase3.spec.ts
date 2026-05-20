import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 3: per-card validation + cross-card deferred to review
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initPatientCards(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'patient-cards' }), yaml)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(
		() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards')
		},
		{ timeout: 15_000 },
	)
}

async function clickByClass(page: Page, cls: string) {
	const ok = await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		if (!btn || (btn as HTMLButtonElement).disabled) return false
		btn.click()
		return true
	}, cls)
	if (!ok) throw new Error(`Button .${cls} not clickable`)
	await page.waitForTimeout(100)
}

async function clickByClassEvenIfDisabled(page: Page, cls: string) {
	await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		btn?.click()
	}, cls)
	await page.waitForTimeout(100)
}

async function setStringValue(page: Page, label: string, value: string, language = 'en') {
	await page.evaluate(
		({ label, value, language }: { label: string; value: string; language: string }) => {
			const fvc = (window as any).__currentFvc
			fvc.setValue(label, language, { content: { [language]: { type: 'string', value } } })
		},
		{ label, value, language },
	)
	await page.waitForTimeout(250)
}

async function isContinueDisabled(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector('[class*="patient-cards__continue"]') as HTMLButtonElement | null
		return !!btn && btn.disabled
	})
}

async function isSubmitDisabled(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector('.patient-cards__submit') as HTMLButtonElement | null
		return !!btn && btn.disabled
	})
}

async function getBlockingFailureCount(page: Page): Promise<number> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const wrapper = internal?.shadowRoot?.querySelector('.patient-cards')
		return parseInt(wrapper?.getAttribute('data-blocking-failures') ?? '0', 10)
	})
}

async function getReviewFailureCount(page: Page): Promise<number> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const wrapper = internal?.shadowRoot?.querySelector('.patient-cards')
		return parseInt(wrapper?.getAttribute('data-review-failures') ?? '0', 10)
	})
}

// Wait until validator evaluation finishes for the current view: blocking-failures attribute
// stabilizes by being read at least once. We use a small idle delay.
async function waitForValidation(page: Page, ms = 400) {
	await page.waitForTimeout(ms)
}

// ============================================================
// Self-validator blocks Continue
// ============================================================
test.describe('Phase 3 / per-card self-validator blocks Continue', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Name
        type: text-field
        validators:
          - validation: |
              return validate.notBlank(self, 'Name')
            message: Name is required
      - field: Q2
        type: text-field
`

	test('Continue is disabled while a required self-validator on the current card fails', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await waitForValidation(page)
		expect(await isContinueDisabled(page)).toBe(true)
		expect(await getBlockingFailureCount(page)).toBe(1)
	})

	test('Continue becomes enabled after the required value is provided', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await waitForValidation(page)
		expect(await isContinueDisabled(page)).toBe(true)
		await setStringValue(page, 'Name', 'Alice')
		await waitForValidation(page)
		expect(await isContinueDisabled(page)).toBe(false)
		expect(await getBlockingFailureCount(page)).toBe(0)
	})

	test('Clicking a disabled Continue does NOT advance', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await waitForValidation(page)
		// Try to click the (disabled) Continue.
		await clickByClassEvenIfDisabled(page, 'patient-cards__continue')
		const idx = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return parseInt(internal?.shadowRoot?.querySelector('.patient-cards')?.getAttribute('data-current-card-index') ?? '-1', 10)
		})
		expect(idx).toBe(0)
	})
})

// ============================================================
// Cross-card validator: doesn't block per-card, surfaces at review
// ============================================================
test.describe('Phase 3 / cross-card validator deferred to review', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: A
        type: text-field
        validators:
          - validation: |
              return text(self['A']) === text(self['B'])
            message: A must equal B
      - field: B
        type: text-field
`

	test('cross-card validator does NOT block Continue on the earlier card', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await waitForValidation(page)
		// Validator on A references B which is on a later card -> classified as cross-card,
		// so Continue must NOT be disabled by it.
		expect(await isContinueDisabled(page)).toBe(false)
		expect(await getBlockingFailureCount(page)).toBe(0)
	})

	test('a failing cross-card validator surfaces on the review card and blocks Submit', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		// Enter different values on A and B so the cross-card validator fails at review.
		await setStringValue(page, 'A', 'one')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue')
		await setStringValue(page, 'B', 'two')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue--to-review')
		await waitForValidation(page)
		expect(await getReviewFailureCount(page)).toBeGreaterThanOrEqual(1)
		expect(await isSubmitDisabled(page)).toBe(true)
		const errorTexts = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return Array.from(internal?.shadowRoot?.querySelectorAll('.patient-cards__review-errors-message') ?? []).map((e) => (e as HTMLElement).textContent?.trim())
		})
		expect(errorTexts).toContain('A must equal B')
	})

	test('matching cross-card values clear the review failure and re-enable Submit', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await setStringValue(page, 'A', 'same')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue')
		await setStringValue(page, 'B', 'same')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue--to-review')
		await waitForValidation(page)
		expect(await getReviewFailureCount(page)).toBe(0)
		expect(await isSubmitDisabled(page)).toBe(false)
	})

	test('review error item Edit button jumps to the source card', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await setStringValue(page, 'A', 'one')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue')
		await setStringValue(page, 'B', 'two')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue--to-review')
		await waitForValidation(page)
		// Click the jump button on the first review error.
		await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const btn = internal?.shadowRoot?.querySelector('.patient-cards__review-errors-jump') as HTMLElement | null
			btn?.click()
		})
		await page.waitForTimeout(150)
		const stage = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards')?.getAttribute('data-stage') ?? null
		})
		expect(stage).toBe('input')
	})
})

// ============================================================
// Mixed: self-validator on later card still blocks navigation on that card
// ============================================================
test.describe('Phase 3 / self-validator on later card', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: A
        type: text-field
      - field: B
        type: text-field
        validators:
          - validation: |
              return validate.notBlank(self, 'B')
            message: B is required
`

	test('Self-validator on later card does NOT block Continue on the earlier card', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await waitForValidation(page)
		// We're on card 0 (A). B's validator is attached to B, not A, so blockingFailures = 0.
		expect(await isContinueDisabled(page)).toBe(false)
	})

	test('Self-validator blocks Continue when patient reaches the validator-owning card', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue')
		await waitForValidation(page)
		expect(await isContinueDisabled(page)).toBe(true)
	})
})

// ============================================================
// All-pass: Submit enabled when nothing fails
// ============================================================
test.describe('Phase 3 / all validators passing', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: A
        type: text-field
        validators:
          - validation: |
              return validate.notBlank(self, 'A')
            message: A is required
`

	test('Submit is enabled on review when all validators pass', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await setStringValue(page, 'A', 'value')
		await waitForValidation(page)
		await clickByClass(page, 'patient-cards__continue--to-review')
		await waitForValidation(page)
		expect(await getReviewFailureCount(page)).toBe(0)
		expect(await isSubmitDisabled(page)).toBe(false)
	})
})
