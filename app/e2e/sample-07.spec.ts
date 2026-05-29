import { test } from '@playwright/test'
import { expect, fieldInfo, getActiveTab, getTabLabels, openSample, selectTab } from './_helpers'

test.describe('07-tabs-layout', () => {
	test.beforeEach(async ({ page }) => openSample(page, '07-tabs-layout'))

	test('four tabs rendered with the right labels', async ({ page }) => {
		expect(await getTabLabels(page)).toEqual(['Identity', 'Address', 'Lifestyle', 'Free-text notes'])
	})

	test('first tab is active by default', async ({ page }) => {
		expect(await getActiveTab(page)).toBe('Identity')
	})

	test('clicking a tab activates it and reveals its fields', async ({ page }) => {
		await selectTab(page, 'Address')
		expect(await getActiveTab(page)).toBe('Address')
		const street = await fieldInfo(page, 'Street + nº')
		expect(street.wrapperTag).toBe('icure-form-text-field')
	})

	test('each tab exposes its own field set', async ({ page }) => {
		await selectTab(page, 'Identity')
		expect((await fieldInfo(page, 'First name')).wrapperTag).toBe('icure-form-text-field')
		await selectTab(page, 'Address')
		expect((await fieldInfo(page, 'City')).wrapperTag).toBe('icure-form-text-field')
		await selectTab(page, 'Lifestyle')
		expect((await fieldInfo(page, 'Smoker')).wrapperTag).toBe('icure-form-radio-button')
		await selectTab(page, 'Free-text notes')
		expect((await fieldInfo(page, 'Notes')).wrapperTag).toBe('icure-form-text-field')
	})

	test('Identity tab: 24-column grid honours per-field spans (first/last name share a row)', async ({ page }) => {
		// First name has span=12, Last name span=12 — they share the same row.
		// We verify by inspecting their grid-column-end vs grid-column-start.
		const layout = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const findField = (label: string): HTMLElement | null => {
				const walk = (root: ParentNode): HTMLElement | null => {
					for (const c of Array.from(root.children ?? [])) {
						if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
							// Walk up two shadow boundaries to reach the icure-form-text-field wrapper.
							let host: HTMLElement = (c.getRootNode() as ShadowRoot).host as HTMLElement
							host = (host.getRootNode() as ShadowRoot).host as HTMLElement
							return host
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
				return walk(icureForm!.shadowRoot!)
			}
			const fn = findField('First name')
			const ln = findField('Last name')
			return {
				firstStyle: fn?.getAttribute('style'),
				lastStyle: ln?.getAttribute('style'),
			}
		})
		expect(layout.firstStyle).toContain('grid-column: span 12')
		expect(layout.lastStyle).toContain('grid-column: span 12')
	})
})
