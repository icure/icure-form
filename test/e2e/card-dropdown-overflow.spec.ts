import { test, expect, Page } from '@playwright/test'

// ============================================================
// Opening a dropdown inside the card renderer must not grow scrollbars
// on the card: the options menu is promoted to the browser top layer
// (Popover API) so it escapes the card's overflow ancestors.
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCard(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'card' }), yaml)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(() => !!(document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any)?.shadowRoot?.querySelector('.card'), { timeout: 15_000 })
}

async function clickByClass(page: Page, cls: string) {
	await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		;(internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null)?.click()
	}, cls)
	await page.waitForTimeout(150)
}

async function openDropdown(page: Page) {
	await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const dd = internal?.shadowRoot?.querySelector('icure-form-dropdown-field') as any
		const inner = dd?.shadowRoot?.querySelector('icure-dropdown-field') as any
		;(inner?.shadowRoot?.querySelector('#test') as HTMLElement | null)?.click()
	})
	await page.waitForTimeout(400)
}

// Overflow flags for the card's scroll container plus whether the menu is top-layer.
async function state(page: Page) {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const body = internal?.shadowRoot?.querySelector('.card__card-body') as HTMLElement | null
		const dd = internal?.shadowRoot?.querySelector('icure-form-dropdown-field') as any
		const inner = dd?.shadowRoot?.querySelector('icure-dropdown-field') as any
		const menu = inner?.shadowRoot?.querySelector('#menu') as HTMLElement | null
		return {
			bodyXOverflow: !!body && body.scrollWidth > body.clientWidth + 1,
			bodyYOverflow: !!body && body.scrollHeight > body.clientHeight + 1,
			menuOpen: !!menu,
			menuIsPopover: !!menu && menu.matches(':popover-open'),
			optionCount: inner?.shadowRoot?.querySelectorAll('.option').length ?? 0,
		}
	})
}

// A dropdown with many wide options — enough to overflow the card both horizontally
// (long labels) and vertically (more rows than the card body height) if it were in-flow.
const options = Array.from({ length: 14 }, (_, i) => `          o${i}: "Option ${i} with a fairly long descriptive label that is quite wide indeed"`).join('\n')
const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Pick
        type: dropdown
        span: 24
        options:
${options}
      - field: Note
        type: text-field
`

test.describe('Dropdown in card renderer does not grow scrollbars', () => {
	test('opening the dropdown promotes the menu to the top layer and leaves the card scroll-free', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')

		const before = await state(page)
		expect(before.menuOpen).toBe(false)
		expect(before.bodyXOverflow).toBe(false)
		expect(before.bodyYOverflow).toBe(false)

		await openDropdown(page)

		const after = await state(page)
		expect(after.menuOpen).toBe(true)
		expect(after.optionCount).toBeGreaterThan(0)
		// The menu escaped the card via the Popover API...
		expect(after.menuIsPopover).toBe(true)
		// ...so the card's scroll container gains neither a horizontal nor a vertical scrollbar.
		expect(after.bodyXOverflow).toBe(false)
		expect(after.bodyYOverflow).toBe(false)
	})
})
