import { test } from '@playwright/test'
import { addSubform, countSubformInstances, expect, listSubformTitles, openSample, removeSubform } from './_helpers'

test.describe('06-subforms', () => {
	test.beforeEach(async ({ page }) => openSample(page, '06-subforms'))

	test('initially no subform children rendered', async ({ page }) => {
		expect(await countSubformInstances(page)).toBe(0)
	})

	test('add Consultation → child rendered with that title', async ({ page }) => {
		await addSubform(page, 'Consultation')
		expect(await listSubformTitles(page)).toEqual(['Consultation'])
		expect(await countSubformInstances(page)).toBe(1)
	})

	test('add three different children → all three rendered in order', async ({ page }) => {
		await addSubform(page, 'Consultation')
		await addSubform(page, 'Vital signs')
		await addSubform(page, 'Prescription')
		const titles = await listSubformTitles(page)
		expect(titles).toEqual(['Consultation', 'Vital signs', 'Prescription'])
		expect(await countSubformInstances(page)).toBe(3)
	})

	test('add two Consultations → both appear', async ({ page }) => {
		await addSubform(page, 'Consultation')
		await addSubform(page, 'Consultation')
		const titles = await listSubformTitles(page)
		expect(titles).toEqual(['Consultation', 'Consultation'])
	})

	test('remove a subform child → count drops', async ({ page }) => {
		await addSubform(page, 'Vital signs')
		await addSubform(page, 'Consultation')
		expect(await countSubformInstances(page)).toBe(2)
		await removeSubform(page, 0)
		expect(await listSubformTitles(page)).toEqual(['Consultation'])
		expect(await countSubformInstances(page)).toBe(1)
	})
})
