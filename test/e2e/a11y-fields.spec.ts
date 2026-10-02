import { test, expect, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'fs'
import * as path from 'path'
import { gotoHarness, waitForFormRender } from './hide-empty-helpers'

// ============================================================
// Issue #17: every field editor exposes a role and an accessible name taken from its label,
// `aria-required` / `aria-invalid` from its definition and validators, and icon buttons are named.
// Playwright's role locators pierce shadow roots, so they see what assistive technology sees.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'a11y-fields.yaml'), 'utf8')

async function initFixture(page: Page) {
	await gotoHarness(page)
	await page.evaluate(async (yaml: string) => await (window as any).initForm({ yaml, language: 'en' }), fixture)
	await waitForFormRender(page)
}

async function addNotes(page: Page, count: number) {
	for (let i = 0; i < count; i++) {
		await page.evaluate(async () => await (window as any).__addSubformInstance('notes', 'note', 'Notes'))
	}
	await page.waitForFunction((n: number) => (document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.subform__child').length ?? 0) === n, count, { timeout: 10_000 })
}

/** The string value of `label` in the `childIndex`-th subform instance, or null. */
async function childValue(page: Page, childIndex: number, label: string): Promise<string | null> {
	return await page.evaluate(
		async ({ childIndex, label }: { childIndex: number; label: string }) => {
			const children = await (window as any).__currentFvc.getChildren()
			const values = children[childIndex].getValues((_id: string, history: { revision: string | null; value?: { label?: string } }[]) =>
				history?.[0]?.value?.label === label ? [history[0].revision] : [],
			)
			const id = Object.keys(values)[0]
			return id ? values[id]?.[0]?.value?.content?.en?.value ?? null : null
		},
		{ childIndex, label },
	)
}

async function axeViolations(page: Page) {
	// `html-has-lang` is about the harness page's own <html>, not the library.
	const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['html-has-lang']).analyze()
	return results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))
}

test.describe('Issue #17 / field roles and accessible names', () => {
	test('each ProseMirror field is a textbox named by its label', async ({ page }) => {
		await initFixture(page)
		for (const name of ['Full name', 'Weight', 'Count', 'Visit']) {
			await expect(page.getByRole('textbox', { name, exact: true })).toHaveCount(1)
		}
	})

	test('the date-only field is a combobox named by its label', async ({ page }) => {
		await initFixture(page)
		const combobox = page.getByRole('combobox', { name: 'Birth date', exact: true })
		await expect(combobox).toHaveCount(1)
		await expect(combobox).toHaveAttribute('aria-expanded', 'false')
		await expect(combobox).toHaveAttribute('aria-required', 'true')
	})

	test('aria-required follows the field definition', async ({ page }) => {
		await initFixture(page)
		await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveAttribute('aria-required', 'true')
		await expect(page.getByRole('textbox', { name: 'Weight', exact: true })).not.toHaveAttribute('aria-required', /.*/)
	})

	test('aria-invalid follows the validators, and points to the error message', async ({ page }) => {
		await initFixture(page)
		const count = page.getByRole('textbox', { name: 'Count', exact: true })
		await expect(count).not.toHaveAttribute('aria-invalid', /.*/)

		await count.click()
		await page.keyboard.type('50')
		await page.keyboard.press('Tab')
		await expect(count).toHaveAttribute('aria-invalid', 'true')
		await expect(count).toHaveAccessibleDescription('Count must be between 1 and 10.')

		await count.click()
		await page.keyboard.press('ControlOrMeta+a')
		await page.keyboard.type('5')
		await page.keyboard.press('Tab')
		await expect(count).not.toHaveAttribute('aria-invalid', /.*/)
	})

	test('the date combobox opens with the keyboard and Escape gives the focus back', async ({ page }) => {
		await initFixture(page)
		const combobox = page.getByRole('combobox', { name: 'Birth date', exact: true })
		await combobox.focus()
		await page.keyboard.press('Enter')
		await expect(combobox).toHaveAttribute('aria-expanded', 'true')
		await expect(page.getByRole('dialog', { name: 'Birth date' })).toBeVisible()

		await page.keyboard.press('Escape')
		await expect(combobox).toHaveAttribute('aria-expanded', 'false')
		await expect(combobox).toBeFocused()
	})

	test('picking a day closes the calendar and gives the focus back; arrow keys keep it open', async ({ page }) => {
		await initFixture(page)
		const combobox = page.getByRole('combobox', { name: 'Birth date', exact: true })
		await combobox.focus()
		await page.keyboard.press('Enter')
		await expect(combobox).toHaveAttribute('aria-expanded', 'true')

		await page.keyboard.press('ArrowRight')
		await expect(combobox).toHaveAttribute('aria-expanded', 'true')

		await page.keyboard.press('Enter')
		await expect(combobox).toHaveAttribute('aria-expanded', 'false')
		await expect(combobox).toBeFocused()
		await expect(combobox).toHaveText(/^\s*\d{2}\/\d{2}\/\d{4}\s*$/)
	})

	test('clicking a day closes the calendar', async ({ page }) => {
		await initFixture(page)
		const combobox = page.getByRole('combobox', { name: 'Birth date', exact: true })
		await combobox.click()
		await expect(combobox).toHaveAttribute('aria-expanded', 'true')

		await page.locator('td.calendar-day:not([aria-disabled="true"])').nth(9).click()
		await expect(combobox).toHaveAttribute('aria-expanded', 'false')
		await expect(combobox).toHaveText(/^\s*\d{2}\/\d{2}\/\d{4}\s*$/)
	})

	test('axe reports no violations from the fields', async ({ page }) => {
		await initFixture(page)
		expect(await axeViolations(page)).toEqual([])
	})
})

test.describe('Issue #17 / repeated subform instances', () => {
	test('each instance has its own named textbox, and the label ids do not collide', async ({ page }) => {
		await initFixture(page)
		await addNotes(page, 2)

		const notes = page.getByRole('textbox', { name: 'Note', exact: true })
		await expect(notes).toHaveCount(2)

		await notes.nth(0).click()
		await page.keyboard.type('first')
		await page.keyboard.press('Tab')
		await notes.nth(1).click()
		await page.keyboard.type('second')
		await page.keyboard.press('Tab')

		await expect.poll(() => childValue(page, 0, 'noteText')).toBe('first')
		await expect.poll(() => childValue(page, 1, 'noteText')).toBe('second')

		const ids = (await axeViolations(page)).map((v) => v.id)
		expect(ids).not.toContain('duplicate-id')
		expect(ids).not.toContain('duplicate-id-aria')
		expect(ids).not.toContain('aria-valid-attr-value')
	})
})
