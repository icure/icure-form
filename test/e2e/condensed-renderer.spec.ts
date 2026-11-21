import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { gotoHarness, waitForFormRender } from './hide-empty-helpers'

// ============================================================
// The `condensed` renderer: a read-only review of a filled form, as text. Same grid and fields as
// `form`, but always read-only, with no field frame or input background, multi-line fields as tall as
// their text, and tightened spacing. Each case measures what is drawn (computed styles, boxes) in the
// fields' nested shadow roots rather than reading back the custom properties the renderer sets.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'condensed-review.yaml'), 'utf8')

const prefill = [
	{ label: 'Reason', value: 'Cough' },
	{ label: 'History', value: 'Dry cough for three days' },
	{ label: 'Weight', primitive: { type: 'measure', value: 70, unit: 'kg' } },
	{ label: 'Height', primitive: { type: 'measure', value: 180, unit: 'cm' } },
	{ label: 'Dropdown', value: 'Red', codes: [{ id: 'Dropdown|1|1', label: { en: 'Red' } }] },
	{ label: 'Notes', value: 'Follow-up in a week' },
	{ label: 'Reasons', value: 'Cough' },
	{ label: 'Diagnoses', value: 'Bronchitis' },
	{ label: 'Count', primitive: { type: 'measure', value: 3 } },
	{ label: 'Radio', value: 'Yes', codes: [{ id: 'Radio|1|1', label: { en: 'Yes' } }] },
	{ label: 'Pulse', primitive: { type: 'measure', value: 72, unit: 'bpm' } },
]

const longHistory =
	'Dry cough for three days, worse at night, with a mild fever on the second day and no shortness of breath. ' +
	'No recent travel. The patient has been taking paracetamol twice a day, with some relief of the fever but not of the cough, ' +
	'and asks whether an X-ray is needed before going back to work next week.'

async function mount(page: Page, options: Record<string, unknown>) {
	await gotoHarness(page)
	await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), { yaml: fixture, language: 'en', prefill, ...options })
	await waitForFormRender(page)
}

/** Runs in the page: every element matching `selector` in the shadow tree of <icure-form>, nested roots included. */
const deepQueryScript = `(selector) => {
	const found = []
	const visit = (root) => {
		root.querySelectorAll(selector).forEach((el) => found.push(el))
		root.querySelectorAll('*').forEach((el) => el.shadowRoot && visit(el.shadowRoot))
	}
	const host = document.querySelector('icure-form')
	if (host && host.shadowRoot) visit(host.shadowRoot)
	return found
}`

async function inputStyles(page: Page) {
	return await page.evaluate((script: string) => {
		const deepQuery = eval(script)
		return (deepQuery('.icure-input, .input-container') as HTMLElement[]).map((el) => {
			const style = getComputedStyle(el)
			return { borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, background: style.backgroundColor, paddingLeft: style.paddingLeft }
		})
	}, deepQueryScript)
}

/** Height of the multi-line field's editor box (`.icure-input`) and its text's line height. */
async function multilineBox(page: Page) {
	return await page.evaluate((script: string) => {
		const deepQuery = eval(script)
		const field = (deepQuery('icure-form-text-field') as HTMLElement[]).find((el) => el.getAttribute('label') === 'History')
		const input = field?.shadowRoot?.querySelector('icure-text-field')?.shadowRoot?.querySelector('.icure-input') as HTMLElement | null
		const editor = input?.querySelector('.ProseMirror') as HTMLElement | null
		return { inputHeight: input?.getBoundingClientRect().height ?? -1, lineHeight: editor ? parseFloat(getComputedStyle(editor).lineHeight) : -1 }
	}, deepQueryScript)
}

async function formHeight(page: Page) {
	return await page.evaluate(() => {
		const root = document.querySelector('icure-form')?.shadowRoot
		const grids = Array.from(root?.querySelectorAll('.icure-form') ?? []) as HTMLElement[]
		const top = Math.min(...grids.map((g) => g.getBoundingClientRect().top))
		const bottom = Math.max(...grids.map((g) => g.getBoundingClientRect().bottom))
		return bottom - top
	})
}

test.describe('condensed renderer', () => {
	test('renders every field read-only even when readonly is false', async ({ page }) => {
		await mount(page, { renderer: 'condensed', readonly: false })
		const editable = await page.evaluate((script: string) => {
			const deepQuery = eval(script)
			return (deepQuery('.ProseMirror') as HTMLElement[]).map((el) => el.getAttribute('contenteditable'))
		}, deepQueryScript)
		expect(editable.length).toBeGreaterThan(0)
		expect(editable.every((v) => v === 'false')).toBe(true)
	})

	test('draws no frame and no input background around the fields', async ({ page }) => {
		await mount(page, { renderer: 'form', readonly: true })
		const framed = await inputStyles(page)
		// Baseline: the read-only `form` renderer frames its inputs, so the measure below can tell.
		expect(framed.some((s) => s.borderTop !== '0px')).toBe(true)

		await mount(page, { renderer: 'condensed' })
		const condensed = await inputStyles(page)
		expect(condensed.length).toBeGreaterThan(0)
		for (const s of condensed) {
			expect(s.borderTop).toBe('0px')
			expect(s.borderBottom).toBe('0px')
			expect(s.background).toBe('rgba(0, 0, 0, 0)')
			expect(s.paddingLeft).toBe('0px')
		}
	})

	test("hides the dropdown's arrow", async ({ page }) => {
		const arrows = async () =>
			await page.evaluate((script: string) => {
				const deepQuery = eval(script)
				return (deepQuery('.select-arrow') as HTMLElement[]).map((el) => el.getBoundingClientRect().width)
			}, deepQueryScript)
		await mount(page, { renderer: 'form', readonly: true })
		expect((await arrows()).some((w) => w > 0)).toBe(true)
		await mount(page, { renderer: 'condensed' })
		const condensed = await arrows()
		expect(condensed.length).toBeGreaterThan(0)
		expect(condensed.every((w) => w === 0)).toBe(true)
	})

	test('a multi-line field holding one line of text is about one line tall', async ({ page }) => {
		await mount(page, { renderer: 'form', readonly: true })
		const reserved = await multilineBox(page)
		await mount(page, { renderer: 'condensed' })
		const hugged = await multilineBox(page)
		expect(hugged.lineHeight).toBeGreaterThan(0)
		expect(hugged.inputHeight).toBeGreaterThan(0)
		expect(hugged.inputHeight).toBeLessThan(hugged.lineHeight * 1.8)
		// The `form` renderer reserves the field's four rows of editor lines.
		expect(reserved.inputHeight).toBeGreaterThan(hugged.inputHeight * 2)
	})

	test('a multi-line field holding a long text grows to show all of it', async ({ page }) => {
		await gotoHarness(page)
		await page.setViewportSize({ width: 375, height: 800 })
		await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), {
			yaml: fixture,
			language: 'en',
			prefill: prefill.map((p) => (p.label === 'History' ? { ...p, value: longHistory } : p)),
			renderer: 'condensed',
		})
		await waitForFormRender(page)
		const box = await page.evaluate((script: string) => {
			const deepQuery = eval(script)
			const field = (deepQuery('icure-form-text-field') as HTMLElement[]).find((el) => el.getAttribute('label') === 'History')
			const input = field?.shadowRoot?.querySelector('icure-text-field')?.shadowRoot?.querySelector('.icure-input') as HTMLElement | null
			const editor = input?.querySelector('.ProseMirror') as HTMLElement | null
			return {
				height: input?.getBoundingClientRect().height ?? -1,
				scrollHeight: input?.scrollHeight ?? -1,
				clientHeight: input?.clientHeight ?? -1,
				lineHeight: editor ? parseFloat(getComputedStyle(editor).lineHeight) : -1,
				text: editor?.textContent ?? '',
			}
		}, deepQueryScript)
		expect(box.text).toContain('next week')
		expect(box.height).toBeGreaterThan(box.lineHeight * 3)
		expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1)
	})

	test('the same filled form is shorter than in the read-only form renderer', async ({ page }) => {
		await mount(page, { renderer: 'form', readonly: true })
		const regular = await formHeight(page)
		await mount(page, { renderer: 'condensed' })
		const condensed = await formHeight(page)
		expect(condensed).toBeGreaterThan(0)
		expect(condensed).toBeLessThan(regular * 0.75)
	})

	test('keeps every answer and label', async ({ page }) => {
		await mount(page, { renderer: 'condensed' })
		const text = await page.evaluate((script: string) => {
			const deepQuery = eval(script)
			const texts = (deepQuery('.ProseMirror, .icure-label') as HTMLElement[]).map((el) => el.textContent ?? '')
			// The dropdown shows its answer as the value of a text input.
			const inputs = (deepQuery('.icure-input input') as HTMLInputElement[]).map((el) => el.value)
			return [...texts, ...inputs].join(' | ')
		}, deepQueryScript)
		for (const expected of ['Cough', 'Dry cough for three days', '70', '180', 'Red', 'Follow-up in a week', 'Reason', 'History', 'Weight']) {
			expect(text).toContain(expected)
		}
	})

	test('honours hideEmptyFields without readonly', async ({ page }) => {
		await gotoHarness(page)
		await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), {
			yaml: fixture,
			language: 'en',
			prefill: prefill.filter((p) => p.label !== 'Notes'),
			renderer: 'condensed',
			hideEmptyFields: true,
		})
		await waitForFormRender(page)
		const labels = await page.evaluate(() => Array.from(document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.icure-form-field') ?? []).map((el) => el.getAttribute('label')))
		expect(labels).toContain('History')
		expect(labels).not.toContain('Notes')
	})

	test('condensed:tab shows one section per tab', async ({ page }) => {
		await mount(page, { renderer: 'condensed:tab' })
		const tabs = await page.evaluate(() => document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.tab-bar li').length ?? 0)
		expect(tabs).toBe(2)
		const condensed = await inputStyles(page)
		expect(condensed.length).toBeGreaterThan(0)
		expect(condensed.every((s) => s.borderTop === '0px')).toBe(true)
	})
})
