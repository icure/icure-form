import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// Phase 1: `hideEmptyFields` hides empty value-bearing fields in the plain `form` renderer.
// No cascade yet: sections and groups are untouched, so the fixture keeps its 13 fields flat in
// a single section — nested in a group, an emptied group would collapse on its own and mask
// whether field-level hiding actually fired.
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

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initFixture(page: Page, options: Record<string, unknown>) {
	return await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), { yaml: fixture, language: 'en', ...options })
}

// Wait for icure-form to finish rendering inside its shadow DOM (mirrors forms.spec.ts).
async function waitForFormRender(page: Page) {
	await page.waitForSelector('icure-form', { state: 'attached', timeout: 10_000 })
	await page.waitForFunction(
		() => {
			const el = document.querySelector('icure-form')
			if (!el?.shadowRoot) return false
			return el.shadowRoot.querySelector('.icure-form') !== null || el.shadowRoot.querySelector('p') !== null
		},
		{ timeout: 15_000 },
	)
	await page.waitForTimeout(500)
}

interface RenderedCounts {
	fields: number
	labels: number
	buttons: number
}

/**
 * Counts what the `form` renderer actually emits: every field component carries
 * `class="icure-form-field"` (labels included, as `<icure-form-label>`) and action buttons carry
 * `class="icure-form-button"`. `fields` therefore counts only the value-bearing components.
 */
async function countRendered(page: Page): Promise<RenderedCounts> {
	return await page.evaluate(() => {
		const root = document.querySelector('icure-form')?.shadowRoot
		if (!root) return { fields: -1, labels: -1, buttons: -1 }
		const fieldElements = Array.from(root.querySelectorAll('.icure-form-field'))
		const isLabel = (el: Element) => el.tagName.toLowerCase() === 'icure-form-label'
		return {
			fields: fieldElements.filter((el) => !isLabel(el)).length,
			labels: fieldElements.filter(isLabel).length,
			buttons: root.querySelectorAll('.icure-form-button').length,
		}
	})
}

async function waitForFieldCount(page: Page, expected: number) {
	await page.waitForFunction(
		(n: number) => {
			const root = document.querySelector('icure-form')?.shadowRoot
			if (!root) return false
			return Array.from(root.querySelectorAll('.icure-form-field')).filter((el) => el.tagName.toLowerCase() !== 'icure-form-label').length === n
		},
		expected,
		{ timeout: 10_000 },
	)
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

	test('(b) read-only with the prop on and nothing filled leaves only the label and the button', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)

		expect(await countRendered(page)).toEqual({ fields: 0, labels: 1, buttons: 1 })
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
})

test.describe('Phase 1 / the card renderer ignores hideEmptyFields', () => {
	async function cardCounts(page: Page) {
		await page.waitForFunction(
			() => {
				const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
				return !!internal?.shadowRoot?.querySelector('.card')
			},
			{ timeout: 15_000 },
		)
		return await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const wrapper = internal?.shadowRoot?.querySelector('.card')
			return {
				totalCards: wrapper?.getAttribute('data-total-cards') ?? null,
				renderedCards: internal?.shadowRoot?.querySelectorAll('.card__card').length ?? -1,
			}
		})
	}

	test('(f) the card count is the same with the prop on as with it off', async ({ page }) => {
		await gotoHarness(page)

		await initFixture(page, { renderer: 'card', readonly: true })
		const withPropOff = await cardCounts(page)

		await initFixture(page, { renderer: 'card', readonly: true, hideEmptyFields: true })
		const withPropOn = await cardCounts(page)

		expect(withPropOn).toEqual(withPropOff)
		expect(Number(withPropOff.totalCards)).toBeGreaterThan(0)
	})
})
