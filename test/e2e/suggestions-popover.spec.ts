import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// Hierarchical suggestions in the dropdown popover (plan task 3).
// The harness serves a named fixture tree as the form's optionsProvider
// (test/e2e/test-page/suggestion-fixtures.ts); the fixture marks nodes by
// substring on their text, standing in for a host's search index.
// ============================================================

const yaml = fs.readFileSync(path.join(__dirname, 'fixtures', 'suggestions.yaml'), 'utf8')

type Row = { kind: 'option' | 'more'; text: string; depth: number; expanded: boolean | null; id: string | null }

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initForm(page: Page, optionsFixture: string) {
	await page.evaluate(async ({ y, f }: { y: string; f: string }) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'form', optionsFixture: f }), { y: yaml, f: optionsFixture })
	await page.waitForFunction(() => !!(window as any).__dropdownRoot()?.querySelector('#test'), { timeout: 15_000 })
	await page.waitForTimeout(300)
}

async function openMenu(page: Page) {
	await page.evaluate(() => ((window as any).__dropdownRoot()?.querySelector('#test') as HTMLElement | null)?.click())
	await page.waitForTimeout(300)
}

// Drives the popover's search box; the field debounces the provider call by 500 ms.
async function typeSearch(page: Page, text: string) {
	await page.evaluate((t: string) => {
		const input = (window as any).__dropdownRoot()?.querySelector('#editor') as HTMLInputElement | null
		if (!input) throw new Error('no #editor')
		input.value = t
		input.dispatchEvent(new Event('input', { bubbles: true }))
	}, text)
	await page.waitForTimeout(900)
}

async function menuOpen(page: Page): Promise<boolean> {
	return await page.evaluate(() => !!(window as any).__dropdownRoot()?.querySelector('#menu'))
}

// The popover's rows in display order. Flat options are plain `.option` buttons (depth 0, no chevron);
// tree rows are `.option-row` wrappers carrying `--depth` and a chevron with aria-expanded; "N more"
// rows are `.option--more` buttons.
async function rows(page: Page): Promise<Row[] | null> {
	return await page.evaluate(() => {
		const menu = (window as any).__dropdownRoot()?.querySelector('#menu') as HTMLElement | null
		if (!menu) return null
		return Array.from(menu.children).map((el) => {
			const depth = Number((el as HTMLElement).style.getPropertyValue('--depth') || 0)
			if (el.classList.contains('option--more')) {
				return { kind: 'more', text: (el.textContent ?? '').trim(), depth, expanded: null, id: null }
			}
			if (el.classList.contains('option-row')) {
				const chevron = el.querySelector('.chevron[aria-expanded]')
				const opt = el.querySelector('.option') as HTMLElement
				return { kind: 'option', text: (opt?.textContent ?? '').trim(), depth, expanded: chevron ? chevron.getAttribute('aria-expanded') === 'true' : null, id: opt?.id ?? null }
			}
			return { kind: 'option', text: (el.textContent ?? '').trim(), depth: 0, expanded: null, id: (el as HTMLElement).id }
		}) as Row[]
	})
}

async function treeMarkupCount(page: Page): Promise<number> {
	return await page.evaluate(() => (window as any).__dropdownRoot()?.querySelectorAll('#menu .option-row, #menu .chevron, #menu .option--more').length ?? 0)
}

async function clickOption(page: Page, text: string) {
	await page.evaluate((t: string) => {
		const root = (window as any).__dropdownRoot() as ShadowRoot
		const btn = Array.from(root.querySelectorAll('#menu .option:not(.option--more)')).find((b) => (b.textContent ?? '').trim() === t) as HTMLElement | undefined
		if (!btn) throw new Error(`no option "${t}"`)
		btn.click()
	}, text)
	await page.waitForTimeout(300)
}

async function clickChevron(page: Page, optionText: string) {
	await page.evaluate((t: string) => {
		const root = (window as any).__dropdownRoot() as ShadowRoot
		const row = Array.from(root.querySelectorAll('#menu .option-row')).find((r) => (r.querySelector('.option')?.textContent ?? '').trim() === t)
		const chevron = row?.querySelector('.chevron[aria-expanded]') as HTMLElement | null
		if (!chevron) throw new Error(`no chevron on "${t}"`)
		chevron.click()
	}, optionText)
	await page.waitForTimeout(200)
}

async function clickMore(page: Page, depth: number) {
	await page.evaluate((d: number) => {
		const root = (window as any).__dropdownRoot() as ShadowRoot
		const btn = Array.from(root.querySelectorAll('#menu .option--more')).find((b) => Number((b as HTMLElement).style.getPropertyValue('--depth') || 0) === d) as HTMLElement | undefined
		if (!btn) throw new Error(`no "more" row at depth ${d}`)
		btn.click()
	}, depth)
	await page.waitForTimeout(200)
}

// The codes stored on the first field that holds any, read back from the values container.
async function storedCodes(page: Page): Promise<any[] | null> {
	return await page.evaluate(() => {
		const values = (window as any).getFormValues() as Record<string, { value?: { codes?: any[] } }[]> | null
		return (
			Object.values(values ?? {})
				.flat()
				.map((v) => v?.value?.codes)
				.find((c) => c?.length) ?? null
		)
	})
}

const summary = (rs: Row[] | null) => (rs ?? []).map((r) => `${'  '.repeat(r.depth)}${r.kind === 'more' ? r.text : r.text + (r.expanded === null ? '' : r.expanded ? ' [-]' : ' [+]')}`)

test.describe('Dropdown popover / flat provider (regression)', () => {
	test('renders the pre-hierarchy markup and stores the selected code as before', async ({ page }) => {
		await gotoHarness(page)
		await initForm(page, 'flat')
		await openMenu(page)

		expect(await menuOpen(page)).toBe(true)
		expect(await treeMarkupCount(page)).toBe(0)
		expect(summary(await rows(page))).toEqual(['Alpha', 'Bravo', 'Charlie'])

		await clickOption(page, 'Bravo')
		expect(await menuOpen(page)).toBe(false)
		const codes = await storedCodes(page)
		expect(codes?.[0]?.id).toBe('FIXTURE|B|1')
		expect(codes?.[0]).not.toHaveProperty('children')
		expect(codes?.[0]).not.toHaveProperty('matched')
	})
})

test.describe('Dropdown popover / hierarchical provider', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHarness(page)
		await initForm(page, 'icd-mini')
	})

	test('an empty search shows the roots collapsed; a chevron expands to the full child list', async ({ page }) => {
		await openMenu(page)
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [+]', 'Chapter X — Respiratory [+]'])

		await clickChevron(page, 'Chapter IX — Circulatory')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  I20 [+]', '  I50 [+]', 'Chapter X — Respiratory [+]'])
	})

	test('a grandchild match opens the path to it, prunes siblings behind "N more", and both the ancestor and the grandchild are selectable', async ({ page }) => {
		await openMenu(page)
		await typeSearch(page, 'hypertension')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])

		// Reveal the hidden codes under the chapter: they appear collapsed, the depth-1 "more" row is gone.
		await clickMore(page, 1)
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  I20 [+]', '  I50 [+]'])

		// Selecting the unmatched ancestor stores its code alone.
		await clickOption(page, 'Chapter IX — Circulatory')
		expect(await menuOpen(page)).toBe(false)
		let codes = await storedCodes(page)
		expect(codes?.[0]?.id).toBe('FIXTURE|CH-IX|1')
		expect(codes?.[0]).not.toHaveProperty('children')
		expect(codes?.[0]).not.toHaveProperty('matched')

		// Selecting the grandchild stores its code alone and closes the menu.
		await openMenu(page)
		await typeSearch(page, 'hypertension')
		await clickOption(page, 'Essential hypertension')
		expect(await menuOpen(page)).toBe(false)
		codes = await storedCodes(page)
		expect(codes?.[0]?.id).toBe('FIXTURE|T1|1')
		expect(codes?.[0]).not.toHaveProperty('children')
		expect(codes?.[0]).not.toHaveProperty('matched')
	})

	test('a match on a code’s own label shows it collapsed under its expanded chapter', async ({ page }) => {
		await openMenu(page)
		await typeSearch(page, 'I20')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I20 [+]', '  … 2 more'])

		// Expanding it manually shows its full child list: nothing beneath it matched, so nothing is pruned.
		await clickChevron(page, 'I20')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I20 [-]', '    Angina pectoris', '    Chest pain', '    Stable angina', '  … 2 more'])
	})

	test('a term matched under two parents is listed under both, with its own path each time', async ({ page }) => {
		await openMenu(page)
		await typeSearch(page, 'chest')
		expect(summary(await rows(page))).toEqual([
			'Chapter IX — Circulatory [-]',
			'  I20 [-]',
			'    Chest pain',
			'    … 2 more',
			'  … 2 more',
			'Chapter X — Respiratory [-]',
			'  J45 [-]',
			'    Chest pain',
			'    … 2 more',
			'  J40 [-]',
			'    Chest cold',
			'    … 1 more',
		])
	})

	test('changing the search resets manual toggles and reveals', async ({ page }) => {
		await openMenu(page)
		await typeSearch(page, 'hypertension')
		await clickMore(page, 1)
		await clickChevron(page, 'I10')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  I20 [+]', '  I50 [+]'])

		await typeSearch(page, 'hyperten')
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])
	})

	test('clicking a chevron keeps the popover open', async ({ page }) => {
		await openMenu(page)
		await typeSearch(page, 'hypertension')
		await clickChevron(page, 'I10')
		expect(await menuOpen(page)).toBe(true)
		expect(summary(await rows(page))).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  … 2 more'])
	})
})
