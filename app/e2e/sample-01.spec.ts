import { test } from '@playwright/test'
import { expect, fieldInfo, getTabLabels, openSample, selectTab } from './_helpers'

// 01 — Components gallery. One field of each type. Tabs split them into 5
// sections; each section's field set is checked once.

test.describe('01-components-gallery', () => {
	test.beforeEach(async ({ page }) => openSample(page, '01-components-gallery'))

	test('renders all five section tabs', async ({ page }) => {
		const tabs = await getTabLabels(page)
		expect(tabs).toEqual(['Text & numbers', 'Dates & times', 'Choices', 'Tokens & lists', 'Label & action'])
	})

	test('Text & numbers section: text/multiline/number/measure(kg)', async ({ page }) => {
		await selectTab(page, 'Text & numbers')
		expect((await fieldInfo(page, 'text')).wrapperTag).toBe('icure-form-text-field')
		expect((await fieldInfo(page, 'textMultiline')).wrapperTag).toBe('icure-form-text-field')
		expect((await fieldInfo(page, 'number')).wrapperTag).toBe('icure-form-number-field')
		const measure = await fieldInfo(page, 'measure')
		expect(measure.wrapperTag).toBe('icure-form-measure-field')
		expect(measure.unit).toBe('kg')
	})

	test('Dates & times section: date/time/date-time pickers', async ({ page }) => {
		await selectTab(page, 'Dates & times')
		expect((await fieldInfo(page, 'date')).wrapperTag).toBe('icure-form-date-picker')
		expect((await fieldInfo(page, 'time')).wrapperTag).toBe('icure-form-time-picker')
		expect((await fieldInfo(page, 'dateTime')).wrapperTag).toBe('icure-form-date-time-picker')
	})

	test('Choices section: dropdown/radio/checkbox', async ({ page }) => {
		await selectTab(page, 'Choices')
		expect((await fieldInfo(page, 'dropdown')).wrapperTag).toBe('icure-form-dropdown-field')
		expect((await fieldInfo(page, 'radio')).wrapperTag).toBe('icure-form-radio-button')
		expect((await fieldInfo(page, 'checkbox')).wrapperTag).toBe('icure-form-checkbox')
		// Radio and checkbox render their options as inner <input>+<label> pairs.
		const radioOptions = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const wrapper = icureForm?.shadowRoot?.querySelector('icure-form-radio-button') as HTMLElement | null
			const group = wrapper?.shadowRoot?.querySelector('icure-button-group') as HTMLElement | null
			return Array.from(group?.shadowRoot?.querySelectorAll('label') ?? [])
				.map((l) => l.textContent?.trim())
				.filter((t) => t && t !== 'radio')
		})
		expect(radioOptions).toEqual(['Small', 'Medium', 'Large'])
	})

	test('Tokens & lists section: token-field + items-list-field', async ({ page }) => {
		await selectTab(page, 'Tokens & lists')
		expect((await fieldInfo(page, 'tokens')).wrapperTag).toBe('icure-form-token-field')
		expect((await fieldInfo(page, 'items')).wrapperTag).toBe('icure-form-items-list-field')
	})

	test('Label & action section: label + action button', async ({ page }) => {
		await selectTab(page, 'Label & action')
		// <icure-form-label> with the literal label text.
		const labelRendered = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const labelWrapper = icureForm?.shadowRoot?.querySelector('icure-form-label') as HTMLElement | null
			return labelWrapper?.shadowRoot?.querySelector('icure-label')?.shadowRoot?.querySelector('label')?.textContent?.trim()
		})
		expect(labelRendered).toBe('This is a static label rendered in the form.')

		// <icure-form-button> renders its shortLabel inside <icure-button> > <div>.
		const buttonText = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const wrapper = icureForm?.shadowRoot?.querySelector('icure-form-button') as HTMLElement | null
			return wrapper?.shadowRoot?.querySelector('icure-button')?.shadowRoot?.querySelector('div')?.textContent?.trim()
		})
		expect(buttonText).toBe('save')
	})
})
