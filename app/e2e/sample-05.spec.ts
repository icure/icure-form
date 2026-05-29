import { test } from '@playwright/test'
import { captureAlerts, clickActionButton, clickOption, expect, fieldExists, openSample, selectTab, setFieldText } from './_helpers'

test.describe('05-conditional-actions', () => {
	test.beforeEach(async ({ page }) => openSample(page, '05-conditional-actions'))

	test('Patient contact: dependent fields are hidden initially', async ({ page }) => {
		await selectTab(page, 'Patient contact')
		expect(await fieldExists(page, 'Phone number')).toBe(false)
		expect(await fieldExists(page, 'Email address')).toBe(false)
		expect(await fieldExists(page, 'Postal address')).toBe(false)
	})

	test('Patient contact: selecting Phone reveals only phone number', async ({ page }) => {
		await selectTab(page, 'Patient contact')
		await clickOption(page, 'Preferred channel', 'DEMO-CONTACT-PREF|phone|1')
		expect(await fieldExists(page, 'Phone number')).toBe(true)
		expect(await fieldExists(page, 'Email address')).toBe(false)
		expect(await fieldExists(page, 'Postal address')).toBe(false)
	})

	test('Patient contact: selecting Email reveals only email address', async ({ page }) => {
		await selectTab(page, 'Patient contact')
		await clickOption(page, 'Preferred channel', 'DEMO-CONTACT-PREF|email|1')
		expect(await fieldExists(page, 'Phone number')).toBe(false)
		expect(await fieldExists(page, 'Email address')).toBe(true)
		expect(await fieldExists(page, 'Postal address')).toBe(false)
	})

	test('Patient contact: selecting Postal reveals only postal address', async ({ page }) => {
		await selectTab(page, 'Patient contact')
		await clickOption(page, 'Preferred channel', 'DEMO-CONTACT-PREF|post|1')
		expect(await fieldExists(page, 'Phone number')).toBe(false)
		expect(await fieldExists(page, 'Email address')).toBe(false)
		expect(await fieldExists(page, 'Postal address')).toBe(true)
	})

	test('Conditional readonly: notes accept text until lockNotes is checked', async ({ page }) => {
		await selectTab(page, 'Conditional readonly')
		await setFieldText(page, 'Clinician notes', 'first edit')
		// Now lock the notes.
		await clickOption(page, 'Lock notes', 'locked')
		// Try editing again — readonly should swallow the typing.
		await setFieldText(page, 'Clinician notes', 'second edit')
		// The text should still be "first edit" or at least not "second edit".
		const noted = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'Clinician notes') {
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
			return host?.shadowRoot?.querySelector('#editor')?.textContent ?? ''
		})
		expect(noted).not.toContain('second edit')
	})

	test('Action button: clicking triggers actionListener with the alert event', async ({ page }) => {
		await selectTab(page, 'Patient contact')
		await clickOption(page, 'Preferred channel', 'DEMO-CONTACT-PREF|email|1')
		await setFieldText(page, 'Email address', 'patient@example.com')
		const alerts = await captureAlerts(page)
		await selectTab(page, 'Action')
		await clickActionButton(page, 'submit')
		await page.waitForTimeout(400)
		const fired = await alerts.get()
		expect(fired).toContain('submit')
	})
})
