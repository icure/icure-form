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

	test('pressing Enter on an unparseable value without blurring shows the warning and does not advance; a valid value advances', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')

		expect(await currentCardIndex(page)).toBe(0)

		// Type an invalid time and press Enter WITHOUT blurring first.
		expect(await focusTimeEditor(page)).toBe(true)
		await page.keyboard.type('255999')
		await page.waitForTimeout(200)
		await page.keyboard.press('Enter')
		await page.waitForTimeout(300)

		// The Enter handler must commit the field, surface the warning, and refuse to advance.
		expect(await currentCardIndex(page)).toBe(0)
		expect(await invalidFormatFlag(page)).toBe('1')
		expect(await invalidWarningVisible(page)).toBe(true)

		// Fix to a valid time and press Enter (still without an explicit blur): it advances.
		expect(await focusTimeEditor(page)).toBe(true)
		await page.keyboard.press('Control+a')
		await page.keyboard.type('143015')
		await page.waitForTimeout(200)
		await page.keyboard.press('Enter')
		await page.waitForTimeout(300)

		expect(await currentCardIndex(page)).toBe(1)
	})
})
