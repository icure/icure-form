import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { countRendered, gotoHarness, waitForFieldCount, waitForFormRender, waitForRenderSettled } from './hide-empty-helpers'

// ============================================================
// Phase 1: `hideEmptyFields` hides empty value-bearing fields in the plain `form` renderer. The
// fixture keeps its 13 fields flat in a single section: nested in a group, an emptied group would
// collapse on its own and mask whether field-level hiding actually fired.
//
// Task 4's upward cascade now applies on top of that. Labels and action buttons never count as
// content, so once every empty field is hidden this fixture's only section has nothing left, and in
// plain `form` an all-empty section is dropped whole — no `.icure-form` grid at all. That is why the
// prop-on cases below expect an empty shadow root rather than a surviving label and button.
//
// Plumbing shared with the other `hide-empty-*` suites lives in `./hide-empty-helpers`.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'hide-empty-fields.yaml'), 'utf8')

// The types `Field.parse` must produce for the fixture, in declaration order. An unrecognised YAML
// `type` silently falls back to `text-field`, which would leave every count below unchanged while
// the fixture quietly covered the wrong types — so the baseline case asserts this list.
const expectedParsedTypes = [
	'text-field',
	'measure-field',
	'token-field',
	'items-list-field',
	'number-field',
	'date-picker',
	'time-picker',
	'date-time-picker',
	'dropdown-field',
	'radio-button',
	'checkbox',
	'label',
	'action',
]

const valueBearingFieldCount = expectedParsedTypes.filter((t) => t !== 'label' && t !== 'action').length

const textLabel = 'Text'
const measureLabel = 'Measure'
const dropdownLabel = 'Dropdown'
const dropdownOptionId = 'Dropdown|1|1'
const dropdownOptionLabel = 'Red'

// Text, measure and dropdown cover the three content shapes: a plain string, a non-string primitive
// and a coded answer with no string content at all.
const prefill = [
	{ label: textLabel, value: 'hello' },
	{ label: measureLabel, primitive: { type: 'measure', value: 70, unit: 'kg' } },
	{ label: dropdownLabel, value: dropdownOptionLabel, codes: [{ id: dropdownOptionId, label: { en: dropdownOptionLabel } }] },
]

async function initFixture(page: Page, options: Record<string, unknown>) {
	return await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), { yaml: fixture, language: 'en', ...options })
}

/** `.icure-form` grids in the shadow root. 0 means the section itself was dropped. */
async function gridCount(page: Page): Promise<number> {
	return await page.evaluate(() => document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.icure-form').length ?? -1)
}

async function parsedFieldTypes(page: Page): Promise<string[]> {
	return await page.evaluate(() => ((window as any).__currentForm.sections[0].fields as { type: string }[]).map((f) => f.type))
}

test.describe('Phase 1 / hideEmptyFields in the form renderer', () => {
	test('(a) read-only with the prop off renders every field', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)

		expect(await parsedFieldTypes(page)).toEqual(expectedParsedTypes)
		expect(await countRendered(page)).toEqual({ fields: valueBearingFieldCount, labels: 1, buttons: 1 })
	})

	test('(b) read-only with the prop on and nothing filled renders nothing at all', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForRenderSettled(page)

		// Every value-bearing field is empty, and the label and the action button that remain do not
		// count as content, so the fixture's only section is dropped along with them.
		expect(await countRendered(page)).toEqual({ fields: 0, labels: 0, buttons: 0 })
		expect(await gridCount(page)).toBe(0)
	})

	test('(c) read-only with the prop on keeps exactly the filled fields', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true, prefill })
		await waitForFormRender(page)

		expect(await countRendered(page)).toEqual({ fields: prefill.length, labels: 1, buttons: 1 })
	})

	test('(d) the prop alone, without read-only, changes nothing', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: false, hideEmptyFields: true })
		await waitForFormRender(page)

		expect(await countRendered(page)).toEqual({ fields: valueBearingFieldCount, labels: 1, buttons: 1 })
	})

	test('(e) clearing a filled field to a persisted empty string hides it', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true, prefill })
		await waitForFormRender(page)
		expect(await countRendered(page)).toEqual({ fields: prefill.length, labels: 1, buttons: 1 })

		// The revisions filter narrows `getValues` to the text field's own value, whose id is needed so
		// that `setValue` overwrites it instead of appending a second value for the same label.
		const clearedId = await page.evaluate(
			({ label, language }: { label: string; language: string }) => {
				const fvc = (window as any).__currentFvc
				const values = fvc.getValues((_id: string, history: { revision: string | null; value?: { label?: string } }[]) => (history?.[0]?.value?.label === label ? [history[0].revision] : []))
				const id = Object.keys(values)[0]
				if (!id) return null
				fvc.setValue(label, language, { content: { [language]: { type: 'string', value: '' } }, codes: [] }, id)
				return id
			},
			{ label: textLabel, language: 'en' },
		)
		expect(typeof clearedId).toBe('string')

		await waitForFieldCount(page, prefill.length - 1)
		expect(await countRendered(page)).toEqual({ fields: prefill.length - 1, labels: 1, buttons: 1 })
	})

	// Both props are set before the element is mounted in every case above, so the first render would
	// pick them up whether or not they are tracked as render-task dependencies. Toggling them on a
	// mounted form is what actually covers that: the first toggle exercises the `hideEmptyFields`
	// dependency, the second the `readonly` one (the effective flag goes false, so everything returns).
	test('(g) toggling either prop on a mounted form re-renders', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)
		expect(await countRendered(page)).toEqual({ fields: valueBearingFieldCount, labels: 1, buttons: 1 })

		// A real transition (13 fields → 0) is the wait here, so the counts asserted after it are not
		// the condition that was waited for.
		await page.evaluate(() => ((document.querySelector('icure-form') as any).hideEmptyFields = true))
		await waitForFieldCount(page, 0)
		expect(await countRendered(page)).toEqual({ fields: 0, labels: 0, buttons: 0 })
		expect(await gridCount(page)).toBe(0)

		await page.evaluate(() => ((document.querySelector('icure-form') as any).readonly = false))
		await waitForFieldCount(page, valueBearingFieldCount)
		expect(await countRendered(page)).toEqual({ fields: valueBearingFieldCount, labels: 1, buttons: 1 })
	})
})
