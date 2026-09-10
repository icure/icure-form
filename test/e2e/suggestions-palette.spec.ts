import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// Hierarchical suggestions in the suggestion palette (plan task 4).
// The harness attaches a named fixture tree as the text field's
// suggestionProvider through the `options.suggestions` marker; the
// palette is driven with real keyboard and pointer events, since the
// behaviour under test is focus handling inside the ProseMirror editor.
// ============================================================

const yaml = fs.readFileSync(path.join(__dirname, 'fixtures', 'suggestions.yaml'), 'utf8')

type Row = { kind: 'node' | 'more'; text: string; depth: number; expanded: 'true' | 'false' | null; hasChevron: boolean; path: string | null; id: string | null }
type Palette = { visible: boolean; ulFocused: boolean; focus: number; rows: Row[]; editorText: string; editorHtml: string }

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

// Uncaught page errors and console errors during a test. An insertion that silently does nothing is usually one of these.
const pageErrors: string[] = []

async function initForm(page: Page, suggestionsFixture: string) {
	pageErrors.length = 0
	page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
	page.on('console', (m) => m.type() === 'error' && pageErrors.push(`console: ${m.text()}`))
	await page.evaluate(async ({ y, f }: { y: string; f: string }) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'form', suggestionsFixture: f }), { y: yaml, f: suggestionsFixture })
	await page.waitForFunction(() => (window as any).__focusEditor?.() === true, { timeout: 15_000 })
	await page.waitForTimeout(300)
}

// The editor after an insertion, with any page errors surfaced in the assertion message.
async function afterInsert(page: Page): Promise<Palette> {
	await page.waitForTimeout(300)
	const p = await palette(page)
	expect(pageErrors, 'page errors during palette interaction').toEqual([])
	return p
}

// Types into the focused editor (the n-th text field) and waits for the palette's debounce, provider call and positioning.
async function typeText(page: Page, text: string, index = 0) {
	await page.evaluate((i: number) => (window as any).__focusEditor(i), index)
	await page.keyboard.type(text)
	await page.waitForTimeout(500)
}

async function press(page: Page, key: string, times = 1) {
	for (let i = 0; i < times; i++) {
		await page.keyboard.press(key)
		await page.waitForTimeout(80)
	}
}

async function palette(page: Page, index = 0): Promise<Palette> {
	const p = (await page.evaluate((i: number) => (window as any).__palette(i), index)) as Palette | null
	if (!p) throw new Error('no suggestion palette in the text field')
	return p
}

// Real pointer press on a row's text or on its chevron.
async function mouseOn(page: Page, text: string, part: 'row' | 'chevron') {
	const pt = (await page.evaluate(({ t, p }: { t: string; p: string }) => (window as any).__paletteRect(t, p), { t: text, p: part })) as { x: number; y: number } | null
	if (!pt) throw new Error(`no ${part} for "${text}"`)
	await page.mouse.click(pt.x, pt.y)
	await page.waitForTimeout(300)
}

const summary = (p: Palette) => p.rows.map((r) => `${'  '.repeat(r.depth)}${r.kind === 'more' ? r.text : r.text + (r.expanded === null ? '' : r.expanded === 'true' ? ' [-]' : ' [+]')}`)

test.describe('Suggestion palette / flat provider (regression)', () => {
	test('renders plain rows, Tab focuses, Enter inserts the link and hides the palette', async ({ page }) => {
		await gotoHarness(page)
		await initForm(page, 'flat')
		await typeText(page, 'alp')

		let p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Alpha'])
		expect(p.rows[0]).toMatchObject({ kind: 'node', depth: 0, hasChevron: false, expanded: null, id: 'FIXTURE|A|1' })
		expect(p.ulFocused).toBe(false)

		await press(page, 'Tab')
		p = await palette(page)
		expect(p.ulFocused).toBe(true)
		expect(p.focus).toBe(0)

		await press(page, 'Enter')
		p = await afterInsert(page)
		expect(p.visible).toBe(false)
		expect(p.editorText).toContain('Alpha')
		expect(p.editorText).not.toContain('alp ')
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|A|1')
		// The host-level codeColorProvider reaches the editor: its category colours the inserted code.
		expect(p.editorHtml).toContain('--bg-code-color-1: #123456')
	})
})

test.describe('Suggestion palette / hierarchical provider', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHarness(page)
		await initForm(page, 'icd-mini')
	})

	test('a grandchild match opens the path, prunes siblings, and the tree keys walk, reveal, collapse and re-expand it', async ({ page }) => {
		await typeText(page, 'hypertension')
		let p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])
		expect(p.rows.map((r) => r.path)).toEqual(['0', '0/0', '0/0/0', '0/0', '0'])

		// Tab focuses the first row; ↓ walks every visible row, "more" rows included.
		await press(page, 'Tab')
		p = await palette(page)
		expect(p.focus).toBe(0)
		await press(page, 'ArrowDown', 3)
		p = await palette(page)
		expect(p.focus).toBe(3)
		expect(p.rows[3].kind).toBe('more')

		// Enter on "N more" reveals the hidden sibling (collapsed, unmatched) and keeps the palette open.
		await press(page, 'Enter')
		p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    High blood pressure', '  … 2 more'])

		// ← on a term moves focus to its code; ← on the expanded code collapses it, focus staying on it.
		await press(page, 'ArrowUp')
		p = await palette(page)
		expect(p.rows[p.focus].text).toBe('Essential hypertension')
		await press(page, 'ArrowLeft')
		p = await palette(page)
		expect(p.rows[p.focus].text).toBe('I10')
		await press(page, 'ArrowLeft')
		p = await palette(page)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  … 2 more'])
		expect(p.rows[p.focus].text).toBe('I10')

		// → re-expands; the reveal is remembered until the search changes.
		await press(page, 'ArrowRight')
		p = await palette(page)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    High blood pressure', '  … 2 more'])
		expect(p.rows[p.focus].text).toBe('I10')
		expect(p.visible).toBe(true)
	})

	test('Enter on the unmatched ancestor replaces the typed words with its text and links its id', async ({ page }) => {
		await typeText(page, 'hypertension')
		await press(page, 'Tab')
		await press(page, 'Enter')
		const p = await afterInsert(page)
		expect(p.visible).toBe(false)
		expect(p.editorText).toContain('Chapter IX — Circulatory')
		expect(p.editorText).not.toContain('hypertension')
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|CH-IX|1')
	})

	test('Enter on a term inserts its text and links its id', async ({ page }) => {
		await typeText(page, 'hypertension')
		await press(page, 'Tab')
		await press(page, 'ArrowDown', 2)
		let p = await palette(page)
		expect(p.rows[p.focus].text).toBe('Essential hypertension')
		await press(page, 'Enter')
		p = await afterInsert(page)
		expect(p.visible).toBe(false)
		expect(p.editorText).toContain('Essential hypertension')
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|T1|1')
	})

	test('pointer: the chevron toggles without closing the palette, a row inserts', async ({ page }) => {
		await typeText(page, 'hypertension')
		await mouseOn(page, 'I10', 'chevron')
		let p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  … 2 more'])

		await mouseOn(page, 'I10', 'chevron')
		p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])

		await mouseOn(page, 'Essential hypertension', 'row')
		p = await afterInsert(page)
		expect(p.visible).toBe(false)
		expect(p.editorText).toContain('Essential hypertension')
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|T1|1')
	})

	test('a field opting in with `suggestions: true` gets the host provider, with no codifications', async ({ page }) => {
		await typeText(page, 'hypertension', 1)
		const p = await palette(page, 1)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])
	})

	test('a field that does not opt in gets no palette from the host provider', async ({ page }) => {
		await typeText(page, 'hypertension', 2)
		const p = (await page.evaluate(() => (window as any).__palette(2))) as Palette | null
		expect(p).toBeNull()
		expect(pageErrors).toEqual([])
	})

	test('the palette hides when the editor loses focus', async ({ page }) => {
		await typeText(page, 'hypertension')
		expect((await palette(page)).visible).toBe(true)
		// A real pointer click on another field blurs the editor without any ProseMirror transaction.
		const pt = (await page.evaluate(() => {
			const r = ((window as any).__dropdownRoot()?.querySelector('#test') as HTMLElement | null)?.getBoundingClientRect()
			return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
		})) as { x: number; y: number } | null
		if (!pt) throw new Error('no dropdown to click')
		await page.mouse.click(pt.x, pt.y)
		await page.waitForTimeout(300)
		expect((await palette(page)).visible).toBe(false)
	})

	test('typing right after an inserted suggestion searches the new text only', async ({ page }) => {
		await typeText(page, 'hypertension')
		await press(page, 'Tab')
		await press(page, 'ArrowDown', 2)
		await press(page, 'Enter')
		let p = await afterInsert(page)
		expect(p.editorText).toContain('Essential hypertension')
		// Glued to the linked term, no space: the query must be "asth", not "hypertensionasth".
		await page.keyboard.type('asth')
		await page.waitForTimeout(500)
		p = await palette(page)
		expect(p.visible).toBe(true)
		expect(p.rows.map((r) => r.text)).toContain('Asthma')
	})

	test('an inserted term keeps its link across a blur, typing right after it searches the new word, and the stored codes name it', async ({ page }) => {
		await typeText(page, 'hypertension')
		await press(page, 'Tab')
		await press(page, 'ArrowDown', 2)
		await press(page, 'Enter')
		let p = await afterInsert(page)
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|T1|1')

		// Leave with a real click on the dropdown: the blur saves the value and the form re-renders the field from it.
		const dropdown = (await page.evaluate(() => {
			const r = ((window as any).__dropdownRoot()?.querySelector('#test') as HTMLElement | null)?.getBoundingClientRect()
			return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
		})) as { x: number; y: number } | null
		if (!dropdown) throw new Error('no dropdown to click')
		await page.mouse.click(dropdown.x, dropdown.y)
		await page.waitForTimeout(500)

		// Come back with a real click, go to the end of the text: the link must have survived the round trip.
		const editor = (await page.evaluate(() => (window as any).__editorRect(0))) as { x: number; y: number } | null
		if (!editor) throw new Error('no editor to click')
		await page.mouse.click(editor.x, editor.y)
		await press(page, 'End')
		p = await palette(page)
		expect(p.editorText).toContain('Essential hypertension')
		expect(p.editorHtml).toContain('c-FIXTURE://FIXTURE|T1|1')

		// Glued to the linked term: the query is the new word only.
		await page.keyboard.type('asth')
		await page.waitForTimeout(500)
		p = await palette(page)
		expect(p.visible).toBe(true)
		expect(p.rows.map((r) => r.text)).toContain('Asthma')

		// The value saved on blur carries the inserted term's code.
		const codes = (await page.evaluate(() => {
			const values = (window as any).getFormValues() as Record<string, { value?: { codes?: { id: string }[] } }[]> | null
			return (
				Object.values(values ?? {})
					.flat()
					.map((v) => v?.value?.codes)
					.find((c) => c?.length) ?? null
			)
		})) as { id: string }[] | null
		expect(codes?.map((c) => c.id)).toContain('FIXTURE|T1|1')
		expect(pageErrors).toEqual([])
	})

	test('typing more (a new search) resets a manual collapse', async ({ page }) => {
		await typeText(page, 'hyperten')
		await press(page, 'Tab')
		await press(page, 'ArrowDown')
		await press(page, 'ArrowLeft')
		let p = await palette(page)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [+]', '  … 2 more'])

		await page.keyboard.type('s')
		await page.waitForTimeout(500)
		p = await palette(page)
		expect(p.visible).toBe(true)
		expect(summary(p)).toEqual(['Chapter IX — Circulatory [-]', '  I10 [-]', '    Essential hypertension', '    … 1 more', '  … 2 more'])
	})
})
