import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 6: i18n patient-renderer chrome translation keys
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
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
	await page.waitForTimeout(150)
}

async function readChromeStrings(page: Page) {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const root = internal?.shadowRoot
		return {
			start: root?.querySelector('.card__start')?.textContent?.trim() ?? null,
			continue: root?.querySelector('[class*="card__continue"]')?.textContent?.trim() ?? null,
			back: root?.querySelector('.card__back')?.textContent?.trim() ?? null,
			submit: root?.querySelector('.card__submit')?.textContent?.trim() ?? null,
			progress: root?.querySelector('.card__progress-text')?.textContent?.trim() ?? null,
			reviewHeading: root?.querySelector('.card__review-heading')?.textContent?.trim() ?? null,
			reviewEdit: root?.querySelector('.card__review-edit')?.textContent?.trim() ?? null,
			confirmationHeading: root?.querySelector('.card__confirmation-heading')?.textContent?.trim() ?? null,
			confirmationBody: root?.querySelector('.card__confirmation-body')?.textContent?.trim() ?? null,
		}
	})
}

const simpleYaml = `
form: F
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
`

// ============================================================
// English defaults when no provider / no translation
// ============================================================
test.describe('Phase 6 / English defaults', () => {
	test('without a translationProvider, English defaults render', async ({ page }) => {
		await gotoHarness(page)
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'card' }), simpleYaml)
		await waitForInternal(page)
		const chrome = await readChromeStrings(page)
		expect(chrome.start).toBe('Start')
		await clickByClass(page, 'card__start')
		const inputChrome = await readChromeStrings(page)
		expect(inputChrome.continue).toBe('Continue')
		// On the first input card Back returns to welcome (Phase 2). The Back button exists.
		expect(inputChrome.back).toBe('Back')
		expect(inputChrome.progress).toBe('1 / 1')
	})
})

// ============================================================
// translationProvider returning translated chrome strings
// ============================================================
test.describe('Phase 6 / translationProvider supplies chrome translations', () => {
	test('French translations replace defaults at every stage', async ({ page }) => {
		await gotoHarness(page)
		// initForm doesn't take a translationProvider directly. We use the Form translations field instead.
		const yaml = `
form: F
translations:
  - language: fr
    translations:
      card-renderer.start: Commencer
      card-renderer.continue: Continuer
      card-renderer.back: Retour
      card-renderer.submit: Envoyer
      card-renderer.progress: Question {current} sur {total}
      card-renderer.review-heading: Vérifiez vos réponses
      card-renderer.review-edit: Modifier
      card-renderer.review-empty: vide
      card-renderer.review-errors-title: Veuillez corriger avant d'envoyer
      card-renderer.confirmation-heading: Merci
      card-renderer.confirmation-body: Vos réponses ont été envoyées.
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
`
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'fr', renderer: 'card' }), yaml)
		await waitForInternal(page)
		// Welcome
		expect((await readChromeStrings(page)).start).toBe('Commencer')
		// Input
		await clickByClass(page, 'card__start')
		let chrome = await readChromeStrings(page)
		expect(chrome.continue).toBe('Continuer')
		expect(chrome.back).toBe('Retour')
		expect(chrome.progress).toBe('Question 1 sur 1')
		// Continue (single card -> review)
		await clickByClass(page, 'card__continue--to-review')
		chrome = await readChromeStrings(page)
		expect(chrome.reviewHeading).toBe('Vérifiez vos réponses')
		expect(chrome.reviewEdit).toBe('Modifier')
		expect(chrome.submit).toBe('Envoyer')
		// Submit -> confirmation
		await clickByClass(page, 'card__submit')
		chrome = await readChromeStrings(page)
		expect(chrome.confirmationHeading).toBe('Merci')
		expect(chrome.confirmationBody).toBe('Vos réponses ont été envoyées.')
	})
})

// ============================================================
// Partial translations: only some keys translated, others fall back
// ============================================================
test.describe('Phase 6 / partial translations fall back per-key', () => {
	test('keys with no translation fall back to English defaults', async ({ page }) => {
		await gotoHarness(page)
		const yaml = `
form: F
translations:
  - language: fr
    translations:
      card-renderer.start: Commencer
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
`
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'fr', renderer: 'card' }), yaml)
		await waitForInternal(page)
		expect((await readChromeStrings(page)).start).toBe('Commencer')
		await clickByClass(page, 'card__start')
		const chrome = await readChromeStrings(page)
		// No translation registered for continue/back/progress — fall back to English defaults.
		expect(chrome.continue).toBe('Continue')
		expect(chrome.back).toBe('Back')
		expect(chrome.progress).toBe('1 / 1')
	})
})

// ============================================================
// Substitution tokens in progress key
// ============================================================
test.describe('Phase 6 / progress substitutions', () => {
	test('progress translation can re-order tokens via {current} / {total}', async ({ page }) => {
		await gotoHarness(page)
		const yaml = `
form: F
translations:
  - language: nl
    translations:
      card-renderer.progress: Vraag {current} van {total}
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
`
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'nl', renderer: 'card' }), yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const chrome = await readChromeStrings(page)
		expect(chrome.progress).toBe('Vraag 1 van 2')
	})
})

// ============================================================
// `translate` flag on Group/Field still respected (no regression)
// ============================================================
test.describe('Phase 6 / existing translate flag continues to work', () => {
	test('Field labels are still translated via translationProvider when translate=true', async ({ page }) => {
		await gotoHarness(page)
		const yaml = `
form: F
translations:
  - language: nl
    translations:
      Q1: Eerste vraag
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
`
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'nl', renderer: 'card' }), yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		// Field label is translated on the input card via the underlying field component.
		// The review card should also use the translation for the field's display label.
		await clickByClass(page, 'card__continue--to-review')
		const reviewLabels = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			return Array.from(internal?.shadowRoot?.querySelectorAll('.card__review-label') ?? []).map((el) => (el as HTMLElement).textContent?.trim())
		})
		expect(reviewLabels).toContain('Eerste vraag')
	})
})
