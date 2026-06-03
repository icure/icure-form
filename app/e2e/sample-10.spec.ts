import { test, Page } from '@playwright/test'
import {
	captureAlerts,
	clickActionButton,
	clickOption,
	expect,
	fieldExists,
	fieldInfo,
	getFieldText,
	getTabLabels,
	openSample,
	selectTab,
	setCodedFieldViaBridge,
	setFieldText,
	setFieldValueViaBridge,
} from './_helpers'

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
		return (host?.shadowRoot?.querySelector('.error')?.textContent ?? '').trim()
	}, label)
}

test.describe('10-clinical-workflow', () => {
	test.beforeEach(async ({ page }) => openSample(page, '10-clinical-workflow'))

	test('the four tabs are present (English translations)', async ({ page }) => {
		expect(await getTabLabels(page)).toEqual(['Patient', 'Vitals', 'Assessment', 'Plan'])
	})

	test('Patient tab: missing name surfaces the required validator', async ({ page }) => {
		await selectTab(page, 'Patient')
		await setFieldText(page, 'Full name', 'X')
		await setFieldText(page, 'Full name', '')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Full name')).toBe('Patient name is required.')
	})

	test('Patient tab: DOB → age, gestational age hidden by default', async ({ page }) => {
		await selectTab(page, 'Patient')
		await setFieldValueViaBridge(page, 'dateOfBirth', { type: 'datetime', value: 19900101000000 })
		expect(await getFieldText(page, 'Age')).toMatch(/^[3-9]\d\b/)
		expect(await fieldExists(page, 'Gestational age (weeks)')).toBe(false)
	})

	test('Patient tab: Pregnancy=Pregnant reveals gestational age field', async ({ page }) => {
		await selectTab(page, 'Patient')
		expect(await fieldExists(page, 'Gestational age (weeks)')).toBe(false)
		await setCodedFieldViaBridge(page, 'pregnancyStatus', 'DEMO-PREGNANCY-STATUS|pregnant|1')
		await page.waitForTimeout(600)
		expect(await fieldExists(page, 'Gestational age (weeks)')).toBe(true)
	})

	test('Patient tab: Pregnant + invalid gestational age triggers validator', async ({ page }) => {
		await selectTab(page, 'Patient')
		await setCodedFieldViaBridge(page, 'pregnancyStatus', 'DEMO-PREGNANCY-STATUS|pregnant|1')
		await page.waitForTimeout(600)
		await setFieldText(page, 'Gestational age (weeks)', '50')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Gestational age (weeks)')).toBe('Gestational age must be between 0 and 42 weeks.')
	})

	test('Vitals tab: weight + height → BMI + category', async ({ page }) => {
		await selectTab(page, 'Vitals')
		await setFieldText(page, 'Weight', '70')
		await setFieldText(page, 'Height', '170')
		expect(await getFieldText(page, 'BMI')).toMatch(/^24\.2/)
		expect(await getFieldText(page, 'Category')).toBe('healthy')
	})

	test('Vitals tab: default unit hints', async ({ page }) => {
		await selectTab(page, 'Vitals')
		expect((await fieldInfo(page, 'Weight')).unit).toBe('kg')
		expect((await fieldInfo(page, 'Height')).unit).toBe('cm')
		expect((await fieldInfo(page, 'Systolic')).unit).toBe('mmHg')
		expect((await fieldInfo(page, 'Diastolic')).unit).toBe('mmHg')
		expect((await fieldInfo(page, 'Pulse')).unit).toBe('bpm')
	})

	test('Assessment tab: risk level radio + notes field', async ({ page }) => {
		await selectTab(page, 'Assessment')
		expect((await fieldInfo(page, 'Risk level')).wrapperTag).toBe('icure-form-radio-button')
		expect((await fieldInfo(page, 'Assessment notes')).wrapperTag).toBe('icure-form-text-field')
		await clickOption(page, 'Risk level', 'high')
		// No assertion on UI state — code stored is verified separately if needed.
	})

	test('Plan tab: follow-up out of range → validator message', async ({ page }) => {
		await selectTab(page, 'Plan')
		await setFieldText(page, 'Follow-up in (days)', '500')
		await page.waitForTimeout(500)
		expect(await getErrorFor(page, 'Follow-up in (days)')).toBe('Follow-up must be between 1 and 365 days.')
	})

	test('Plan tab: sign action fires actionListener', async ({ page }) => {
		await selectTab(page, 'Patient')
		await setFieldText(page, 'Full name', 'Jane Doe')
		await selectTab(page, 'Plan')
		const alerts = await captureAlerts(page)
		await clickActionButton(page, 'sign')
		await page.waitForTimeout(400)
		const fired = await alerts.get()
		expect(fired).toContain('sign-and-save')
	})
})
