import { test, expect, Page } from '@playwright/test'

// Regression coverage for radio/checkbox state restoration on back-navigation, edit-jumps, and
// after re-flatten (Phase 4 conditional re-evaluation).

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
	await page.waitForTimeout(150)
}

async function clickOption(page: Page, fieldTag: string, optionId: string) {
	const ok = await page.evaluate(
		({ fieldTag, optionId }: { fieldTag: string; optionId: string }) => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const fieldEl = internal?.shadowRoot?.querySelector(fieldTag)
			const buttonGroup = fieldEl?.shadowRoot?.querySelector('icure-button-group')
			const input = buttonGroup?.shadowRoot?.querySelector(`input[id="${optionId}"]`) as HTMLInputElement | null
			if (!input) return false
			input.click()
			return true
		},
		{ fieldTag, optionId },
	)
	if (!ok) throw new Error(`Option ${optionId} on ${fieldTag} not clickable`)
	await page.waitForTimeout(300)
}

async function isOptionChecked(page: Page, fieldTag: string, optionId: string): Promise<boolean> {
	return await page.evaluate(
		({ fieldTag, optionId }: { fieldTag: string; optionId: string }) => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const fieldEl = internal?.shadowRoot?.querySelector(fieldTag)
			const buttonGroup = fieldEl?.shadowRoot?.querySelector('icure-button-group')
			const input = buttonGroup?.shadowRoot?.querySelector(`input[id="${optionId}"]`) as HTMLInputElement | null
			return !!input && input.checked
		},
		{ fieldTag, optionId },
	)
}

const simpleYaml = `
form: F
sections:
  - section: S
    fields:
      - field: gender
        type: radio-button
        options:
          GENDER|male|1: Male
          GENDER|female|1: Female
      - field: allergies
        type: checkbox
        options:
          ALLERGIES|milk|1: Milk
          ALLERGIES|eggs|1: Eggs
      - field: notes
        type: text-field
`

const threeRadiosYaml = `
form: F
sections:
  - section: S
    fields:
      - field: R1
        type: radio-button
        options:
          R1|1|1: Yes
          R1|2|1: No
      - field: R2
        type: radio-button
        options:
          R2|1|1: Yes
          R2|2|1: No
      - field: R3
        type: radio-button
        options:
          R3|1|1: Yes
          R3|2|1: No
`

test.describe('Radio / checkbox back-restore', () => {
	test('radio selection survives Continue → Back', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, simpleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(500)
		await clickOption(page, 'icure-form-radio-button', 'GENDER|female|1')
		await page.waitForTimeout(500)
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'GENDER|female|1')).toBe(true)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(300)
		await clickByClass(page, 'card__back')
		await page.waitForTimeout(1500)
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'GENDER|female|1')).toBe(true)
	})

	test('checkbox selection survives Continue → Back (control)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, simpleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(500)
		await clickOption(page, 'icure-form-checkbox', 'ALLERGIES|milk|1')
		await page.waitForTimeout(300)
		expect(await isOptionChecked(page, 'icure-form-checkbox', 'ALLERGIES|milk|1')).toBe(true)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(300)
		await clickByClass(page, 'card__back')
		await page.waitForTimeout(1500)
		expect(await isOptionChecked(page, 'icure-form-checkbox', 'ALLERGIES|milk|1')).toBe(true)
	})

	test('three consecutive radios all restore correctly on back-navigation', async ({ page }) => {
		// Reproduces a user-reported pattern: 1 → 2 → 3 forward, then 3 → 2 → 1 back. Each radio
		// has DIFFERENT option ids, so an "options stuck on first field" bug surfaces as
		// unchecked-or-missing inputs on the middle card(s).
		await gotoHarness(page)
		await initCard(page, threeRadiosYaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(500)

		// Card 0: R1 = Yes (R1|1|1)
		await clickOption(page, 'icure-form-radio-button', 'R1|1|1')
		await page.waitForTimeout(400)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(400)
		// Card 1: R2 = No (R2|2|1)
		await clickOption(page, 'icure-form-radio-button', 'R2|2|1')
		await page.waitForTimeout(400)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(400)
		// Card 2: R3 = Yes (R3|1|1)
		await clickOption(page, 'icure-form-radio-button', 'R3|1|1')
		await page.waitForTimeout(400)

		// Verify R3 is checked at its own card.
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'R3|1|1')).toBe(true)

		// Back to card 1 (R2). It should still show R2|2|1 checked.
		await clickByClass(page, 'card__back')
		await page.waitForTimeout(800)
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'R2|2|1')).toBe(true)

		// Back to card 0 (R1). It should still show R1|1|1 checked.
		await clickByClass(page, 'card__back')
		await page.waitForTimeout(800)
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'R1|1|1')).toBe(true)
	})

	test('radio selection survives review → edit-jump back to its card', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, simpleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(500)
		await clickOption(page, 'icure-form-radio-button', 'GENDER|male|1')
		await page.waitForTimeout(500)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(300)
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(300)
		await clickByClass(page, 'card__continue--to-review')
		await page.waitForTimeout(500)
		await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const row = internal?.shadowRoot?.querySelector('.card__review-row[data-card-index="0"]')
			const btn = row?.querySelector('.card__review-edit') as HTMLElement | null
			btn?.click()
		})
		await page.waitForTimeout(800)
		expect(await isOptionChecked(page, 'icure-form-radio-button', 'GENDER|male|1')).toBe(true)
	})
})
