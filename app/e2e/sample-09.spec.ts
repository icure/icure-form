import { test, ConsoleMessage } from '@playwright/test'
import { expect, openSample } from './_helpers'

test.describe('09-legacy-json', () => {
	test('renders without throwing', async ({ page }) => {
		const errors: string[] = []
		page.on('pageerror', (e) => errors.push(e.message))
		await openSample(page, '09-legacy-json')
		expect(errors).toEqual([])
	})

	test('icure-convert emits a fallback warning for the unknown MedicationTableEditor', async ({ page }) => {
		const warnings: string[] = []
		page.on('console', (msg: ConsoleMessage) => {
			if (msg.text().includes('[icure-convert]')) warnings.push(msg.text())
		})
		await openSample(page, '09-legacy-json')
		// We need at least one warning mentioning the unknown editor key.
		expect(warnings.some((w) => w.includes('MedicationTableEditor'))).toBe(true)
	})

	test('section header reflects the converted form', async ({ page }) => {
		await openSample(page, '09-legacy-json')
		// The legacy form's default section is named "Main".
		const tabs = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			return Array.from(icureForm?.shadowRoot?.querySelectorAll('.tab-bar li') ?? []).map((li) => (li.textContent ?? '').trim())
		})
		expect(tabs).toContain('Main')
	})
})
