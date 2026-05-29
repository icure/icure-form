import { test, Page } from '@playwright/test'
import { expect, openSample, selectTab, setFieldText, setFieldValueViaBridge } from './_helpers'

// Read the rendered error message of a field by its label.
async function getErrorFor(page: Page, label: string): Promise<string> {
	return page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const walk = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
					return (c.getRootNode() as ShadowRoot).host as HTMLElement
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const f = walk(c.shadowRoot)
					if (f) return f
				}
				const f = walk(c)
				if (f) return f
			}
			return null
		}
		const host = walk(icureForm!.shadowRoot!)
		const errorDiv = host?.shadowRoot?.querySelector('.error')
		return (errorDiv?.textContent ?? '').trim()
	}, label)
}

test.describe('04-validation', () => {
	test.beforeEach(async ({ page }) => openSample(page, '04-validation'))

	test('Required: empty fullName shows the required-message after touch', async ({ page }) => {
		await selectTab(page, 'Required & range')
		// Type then clear to ensure validation runs.
		await setFieldText(page, 'Full name', 'X')
		await setFieldText(page, 'Full name', '')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Full name')).toBe("Please enter the patient's full name.")
	})

	test('Range: 5 minutes triggers the 15-240 message', async ({ page }) => {
		await selectTab(page, 'Required & range')
		await setFieldText(page, 'Follow-up (min)', '5')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Follow-up (min)')).toBe('Follow-up must be between 15 and 240 minutes.')
	})

	test('Range: 60 minutes passes (no error)', async ({ page }) => {
		await selectTab(page, 'Required & range')
		await setFieldText(page, 'Follow-up (min)', '60')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Follow-up (min)')).toBe('')
	})

	test('Pattern: invalid email is flagged', async ({ page }) => {
		await selectTab(page, 'Pattern')
		await setFieldText(page, 'Email', 'not-an-email')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Email')).toBe('Please enter a valid email address.')
	})

	test('Pattern: valid email passes', async ({ page }) => {
		await selectTab(page, 'Pattern')
		await setFieldText(page, 'Email', 'jane@example.com')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Email')).toBe('')
	})

	test('Pattern: national ID with wrong digit count is flagged', async ({ page }) => {
		await selectTab(page, 'Pattern')
		await setFieldText(page, 'National ID (NN)', '123')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'National ID (NN)')).toBe('National ID must contain 11 digits.')
	})

	test('Cross-field: end before start triggers the message', async ({ page }) => {
		await selectTab(page, 'Custom cross-field')
		await setFieldValueViaBridge(page, 'startDate', { type: 'datetime', value: 20240601000000 })
		await setFieldValueViaBridge(page, 'endDate', { type: 'datetime', value: 20240501000000 })
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'End')).toBe('End date must be on or after the start date.')
	})

	test('Cross-field: end after start passes', async ({ page }) => {
		await selectTab(page, 'Custom cross-field')
		await setFieldValueViaBridge(page, 'startDate', { type: 'datetime', value: 20240501000000 })
		await setFieldValueViaBridge(page, 'endDate', { type: 'datetime', value: 20240601000000 })
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'End')).toBe('')
	})
})
