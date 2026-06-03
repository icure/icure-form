import { test } from '@playwright/test'
import { expect, getFieldText, openSample, selectTab, setFieldText } from './_helpers'

test.describe('03-async-formulas', () => {
	test.beforeEach(async ({ page }) => openSample(page, '03-async-formulas'))

	test('Postal code → city after async delay', async ({ page }) => {
		await selectTab(page, 'Postal code → city')
		await setFieldText(page, 'Postal code', '1000')
		// The resolver awaits delay(500). Give it room.
		await page.waitForTimeout(1500)
		expect(await getFieldText(page, 'City')).toBe('Brussels')
	})

	test('Unknown postal code → "Unknown postal code"', async ({ page }) => {
		await selectTab(page, 'Postal code → city')
		await setFieldText(page, 'Postal code', '9999')
		await page.waitForTimeout(1500)
		expect(await getFieldText(page, 'City')).toBe('Unknown postal code')
	})

	test('BMI → delayed category', async ({ page }) => {
		await selectTab(page, 'BMI category (delayed)')
		await setFieldText(page, 'Weight', '70')
		await setFieldText(page, 'Height', '170')
		await page.waitForTimeout(1500)
		expect(await getFieldText(page, 'Category')).toBe('healthy')
	})

	test('BMI overweight category', async ({ page }) => {
		await selectTab(page, 'BMI category (delayed)')
		// 80 kg / 1.70² = 27.7 → overweight (25–30).
		await setFieldText(page, 'Weight', '80')
		await setFieldText(page, 'Height', '170')
		await page.waitForTimeout(1500)
		expect(await getFieldText(page, 'Category')).toBe('overweight')
	})

	test('BMI obese category', async ({ page }) => {
		await selectTab(page, 'BMI category (delayed)')
		// 95 kg / 1.70² = 32.9 → obese (≥30).
		await setFieldText(page, 'Weight', '95')
		await setFieldText(page, 'Height', '170')
		await page.waitForTimeout(1500)
		expect(await getFieldText(page, 'Category')).toBe('obese')
	})

	test('AI-style summary fires after both inputs filled', async ({ page }) => {
		await selectTab(page, 'AI-style summary')
		await setFieldText(page, 'Chief complaint', 'Headache')
		await setFieldText(page, 'History notes', 'Two days')
		await page.waitForTimeout(1500)
		const summary = await getFieldText(page, 'Auto-summary')
		// The fake summariser produces "clinical-summary\nComplaint: Headache\nHistory: Two days"
		expect(summary).toContain('clinical-summary')
		expect(summary).toContain('Headache')
		expect(summary).toContain('Two days')
	})
})
