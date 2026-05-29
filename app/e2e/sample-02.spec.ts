import { test } from '@playwright/test'
import { expect, fieldInfo, getFieldText, openSample, selectTab, setFieldText, setFieldValueViaBridge } from './_helpers'

test.describe('02-formulas', () => {
	test.beforeEach(async ({ page }) => openSample(page, '02-formulas'))

	test('BMI section: weight + height → computed BMI', async ({ page }) => {
		await selectTab(page, 'BMI')
		await setFieldText(page, 'Weight', '70')
		await setFieldText(page, 'Height', '170')
		const bmi = await getFieldText(page, 'BMI')
		// 70 / 1.70² = 24.2214… — assert the integer + first decimal at minimum.
		expect(bmi).toMatch(/^24\.2/)
	})

	test('BMI section: defaults bring kg & cm units', async ({ page }) => {
		await selectTab(page, 'BMI')
		// The default-value computed property assigns the unit on first render.
		expect((await fieldInfo(page, 'Weight')).unit).toBe('kg')
		expect((await fieldInfo(page, 'Height')).unit).toBe('cm')
	})

	test('Age from DOB: setting dateOfBirth → computed age', async ({ page }) => {
		await selectTab(page, 'Age from date of birth')
		// 1990-01-01 in the yyyyMMddHHmmss format the date-picker uses.
		await setFieldValueViaBridge(page, 'dateOfBirth', { type: 'datetime', value: 19900101000000 })
		const age = await getFieldText(page, 'Age')
		// "35 ans" / "35 years" / "35 jaar" — match a leading 2-digit number > 30.
		expect(age).toMatch(/^[3-9]\d\b/)
	})

	test('Invoice line: unitPrice × quantity = total', async ({ page }) => {
		await selectTab(page, 'Invoice line')
		await setFieldText(page, 'Unit price (€)', '12.5')
		await setFieldText(page, 'Quantity', '4')
		const total = await getFieldText(page, 'Total (€)')
		// 12.5 × 4 = 50 (the number-field schema may render as "50.00" or "50").
		expect(total).toMatch(/^50(\.0+)?/)
	})

	test('Invoice line: quantity defaults to 1 on first render', async ({ page }) => {
		await selectTab(page, 'Invoice line')
		await setFieldText(page, 'Unit price (€)', '7')
		// Quantity has a defaultValue of 1 → total should equal unit price.
		const total = await getFieldText(page, 'Total (€)')
		expect(total).toMatch(/^7(\.0+)?/)
	})
})
