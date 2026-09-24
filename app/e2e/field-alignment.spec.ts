import { test, expect, Page } from '@playwright/test'
import { openSample, selectTab } from './_helpers'

// Checkboxes and action buttons sit at the bottom of their grid cell (align-self:
// self-end) so they line up with the input boxes of the text fields next to them,
// whose labels take up the top of the cell.
async function alignSelfOf(page: Page, tag: string): Promise<string[]> {
	return page.evaluate((tag) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const elements = Array.from(icureForm?.shadowRoot?.querySelectorAll(tag) ?? []) as HTMLElement[]
		return elements.map((el) => getComputedStyle(el).alignSelf)
	}, tag)
}

test.describe('demo-app — field alignment in the grid', () => {
	test('checkboxes align to the end of their cell', async ({ page }) => {
		await openSample(page, '01-components-gallery')
		await selectTab(page, 'Choices')
		const values = await alignSelfOf(page, 'icure-form-checkbox')
		expect(values.length).toBeGreaterThan(0)
		values.forEach((v) => expect(v).toBe('self-end'))
	})

	test('buttons align to the end of their cell, like checkboxes', async ({ page }) => {
		await openSample(page, '01-components-gallery')
		await selectTab(page, 'Label & action')
		const values = await alignSelfOf(page, 'icure-form-button')
		expect(values.length).toBeGreaterThan(0)
		values.forEach((v) => expect(v).toBe('self-end'))
	})
})
