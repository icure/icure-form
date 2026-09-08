import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { countRendered, editFixture, gotoHarness, setValue, waitForFieldCount, waitForFormRender } from './hide-empty-helpers'

// ============================================================
// Phase 2: `hideEmptyFields` cascades upward. A group, a subform instance and (in the plain `form`
// layout) a section disappear once nothing inside them survives; `alwaysVisible` opts any of them
// back in. The fixture nests one container of each kind so the cascade is observed at every level.
//
// Plumbing shared with the other `hide-empty-*` suites lives in `./hide-empty-helpers`.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'hide-empty-cascade.yaml'), 'utf8')

/** Every `Field` in the fixture definition, labels and the action button included. */
const fixtureFieldCount = 10

// Nothing opts out of hiding any more: with nothing filled, the whole form has to disappear.
const noOptOutFixture = editFixture(fixture, /[ \t]*alwaysVisible: true\r?\n/g, '')
// The Subform itself opts out: its heading stays even with no instance to show.
const alwaysVisibleSubformFixture = editFixture(fixture, '        id: sub-c\n', '        id: sub-c\n        alwaysVisible: true\n')

async function initFixture(page: Page, options: Record<string, unknown>, yaml: string = fixture) {
	return await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), { yaml, language: 'en', ...options })
}

interface SectionGrid {
	/** Direct children of the grid: 0 means the section rendered an empty grid. */
	children: number
	/** Counted over the whole subtree, so a subform instance's own fields count here too. */
	groups: number
	fields: number
	labels: number
	buttons: number
}

/**
 * One descriptor per rendered section, in document order. A section's `.icure-form` grid is the one
 * with no `.icure-form` ancestor; a group's grid and a subform child form's grids are nested inside
 * it. Sections have no title in the `form` renderer's output, so a dropped section is observed as a
 * missing entry — hence the full-array assertions below.
 */
async function sectionGrids(page: Page): Promise<SectionGrid[]> {
	return await page.evaluate(() => {
		const root = document.querySelector('icure-form')?.shadowRoot
		if (!root) return []
		return Array.from(root.querySelectorAll('.icure-form'))
			.filter((el) => !el.parentElement?.closest('.icure-form'))
			.map((grid) => {
				const fieldElements = Array.from(grid.querySelectorAll('.icure-form-field'))
				const isLabel = (el: Element) => el.tagName.toLowerCase() === 'icure-form-label'
				return {
					children: grid.childElementCount,
					groups: grid.querySelectorAll('.group').length,
					fields: fieldElements.filter((el) => !isLabel(el)).length,
					labels: fieldElements.filter(isLabel).length,
					buttons: grid.querySelectorAll('.icure-form-button').length,
				}
			})
	})
}

async function waitForSectionGridCount(page: Page, expected: number) {
	await page.waitForFunction(
		(n: number) => {
			const root = document.querySelector('icure-form')?.shadowRoot
			if (!root) return false
			return Array.from(root.querySelectorAll('.icure-form')).filter((el) => !el.parentElement?.closest('.icure-form')).length === n
		},
		expected,
		{ timeout: 10_000 },
	)
}

/** Group titles in document order: the `<h3>` the group renders above its own grid. */
async function groupTitles(page: Page): Promise<string[]> {
	return await page.evaluate(() =>
		Array.from(document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.group') ?? []).map((g) => g.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim() ?? ''),
	)
}

/** `true` when a value-bearing field component with this label is in the DOM. */
async function hasField(page: Page, label: string): Promise<boolean> {
	return await page.evaluate((l: string) => !!document.querySelector('icure-form')?.shadowRoot?.querySelector(`[label="${l}"]`), label)
}

async function subformCounts(page: Page) {
	return await page.evaluate(() => {
		const root = document.querySelector('icure-form')?.shadowRoot
		return {
			headings: root?.querySelectorAll('.subform__heading').length ?? -1,
			children: root?.querySelectorAll('.subform__child').length ?? -1,
		}
	})
}

async function setHideEmptyFields(page: Page, value: boolean) {
	await page.evaluate((v: boolean) => ((document.querySelector('icure-form') as any).hideEmptyFields = v), value)
}

test.describe('Phase 2 / group and section cascade', () => {
	test('(a) a group whose fields all dropped takes its label and its button with it', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 1)

		// Only section E's single `alwaysVisible` field survives; the fixture's only label and only action
		// button both live in group A-plain, so both counts falling to 0 means that group is gone.
		expect(await countRendered(page)).toEqual({ fields: 1, labels: 0, buttons: 0 })
		expect(await groupTitles(page)).toEqual(['A-always'])
	})

	test('(b) filling one field of that group brings back the group, its label and its button', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true, prefill: [{ label: 'A1', value: 'hello' }] })
		await waitForFormRender(page)
		await waitForFieldCount(page, 2)

		expect(await countRendered(page)).toEqual({ fields: 2, labels: 1, buttons: 1 })
		expect(await groupTitles(page)).toEqual(['A-plain', 'A-always'])
		expect(await hasField(page, 'A1')).toBe(true)
		// Its still-empty sibling stays hidden: the group survives, the empty field does not.
		expect(await hasField(page, 'A2')).toBe(false)
	})

	test('(c) nested empty groups both disappear, and both come back with their field', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 1)
		expect(await groupTitles(page)).toEqual(['A-always'])

		await setValue(page, 'B1', 'filled')
		await waitForFieldCount(page, 2)
		expect(await groupTitles(page)).toEqual(['A-always', 'B-outer', 'B-inner'])
		expect(await hasField(page, 'B1')).toBe(true)
	})

	test('(d) a section with no surviving content renders no grid at all', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)
		// Flag off: all five sections render their grid.
		await waitForSectionGridCount(page, 5)

		await setHideEmptyFields(page, true)
		// Sections B (nested empty groups) and C (empty subform) are gone; A, D and E survive.
		await waitForSectionGridCount(page, 3)
	})

	test('(e) an alwaysVisible section renders an empty grid, and the sections around it keep theirs', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForSectionGridCount(page, 3)

		// In order: A (the alwaysVisible group shell only), D (alwaysVisible, entirely empty), E.
		expect(await sectionGrids(page)).toEqual([
			{ children: 1, groups: 1, fields: 0, labels: 0, buttons: 0 },
			{ children: 0, groups: 0, fields: 0, labels: 0, buttons: 0 },
			{ children: 1, groups: 0, fields: 1, labels: 0, buttons: 0 },
		])
	})

	test('(f) an alwaysVisible group renders its title and an empty grid', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 1)

		expect(await groupTitles(page)).toEqual(['A-always'])
		expect(
			await page.evaluate(() => {
				const group = document.querySelector('icure-form')?.shadowRoot?.querySelector('.group')
				return { className: group?.className ?? null, gridChildren: group?.querySelector('.icure-form')?.childElementCount ?? -1 }
			}),
		).toEqual({ className: 'group bordered', gridChildren: 0 })
	})
})

test.describe('Phase 2 / alwaysVisible on a field', () => {
	test('(g) an alwaysVisible field renders as a blank read-only box', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 1)

		expect(
			await page.evaluate(() => {
				const field = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-form-text-field[label="EAlways"]') as any
				if (!field) return null
				return { readonly: field.readonly, text: (field.shadowRoot?.querySelector('#editor')?.textContent ?? '').trim() }
			}),
		).toEqual({ readonly: true, text: '' })
	})

	test('(h) a computed alwaysVisible follows its driver in both directions', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 1)
		expect(await hasField(page, 'EComputed')).toBe(false)

		// `driver` filled: its own field returns, and the empty field whose `alwaysVisible` formula reads
		// it returns with it.
		await setValue(page, 'driver', 'go')
		await waitForFieldCount(page, 3)
		expect(await hasField(page, 'EComputed')).toBe(true)
		expect(await hasField(page, 'driver')).toBe(true)

		await setValue(page, 'driver', '')
		await waitForFieldCount(page, 1)
		expect(await hasField(page, 'EComputed')).toBe(false)
		expect(await hasField(page, 'driver')).toBe(false)
	})
})

test.describe('Phase 2 / subform instances', () => {
	async function addInstances(page: Page, count: number) {
		for (let i = 0; i < count; i++) {
			await page.evaluate(async () => await (window as any).__addSubformInstance('sub-c', 'sub-c-child', 'Encounters'))
		}
		await page.waitForFunction((n: number) => (document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.subform__child').length ?? 0) === n, count, { timeout: 10_000 })
	}

	test('(j) only the filled instance survives, and the heading stays with it', async ({ page }) => {
		await gotoHarness(page)
		// Mounted with the flag off, so both instances are observably in the DOM before it goes on.
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)
		await addInstances(page, 2)
		await page.evaluate(async () => await (window as any).__setChildValue(0, 'C1', 'en', 'seen'))

		await setHideEmptyFields(page, true)
		await page.waitForFunction(() => (document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.subform__child').length ?? -1) === 1, undefined, { timeout: 10_000 })
		expect(await subformCounts(page)).toEqual({ headings: 1, children: 1 })
		expect(await hasField(page, 'C1')).toBe(true)
		// The instance's own empty field is hidden inside the surviving instance.
		expect(await hasField(page, 'C2')).toBe(false)
	})

	test('(j) with no instance filled the subform drops, heading included', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)
		await addInstances(page, 2)
		expect(await subformCounts(page)).toEqual({ headings: 1, children: 2 })

		await setHideEmptyFields(page, true)
		await page.waitForFunction(() => (document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.subform__heading').length ?? -1) === 0, undefined, { timeout: 10_000 })
		expect(await subformCounts(page)).toEqual({ headings: 0, children: 0 })
	})

	test('(j) an alwaysVisible subform keeps its heading with no instance at all', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true }, alwaysVisibleSubformFixture)
		await waitForFormRender(page)
		await page.waitForFunction(() => (document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.subform__heading').length ?? 0) === 1, undefined, { timeout: 10_000 })

		expect(await subformCounts(page)).toEqual({ headings: 1, children: 0 })
		// Asserted in the same render as the surviving heading: hiding really is on around it, and the
		// heading is kept by `alwaysVisible` rather than by the flag being inert.
		expect(await countRendered(page)).toEqual({ fields: 1, labels: 0, buttons: 0 })
		expect(await sectionGrids(page)).toHaveLength(4)
	})
})

test.describe('Phase 2 / whole form and baseline', () => {
	test('(k) a form with nothing to show renders no grid at all', async ({ page }) => {
		await gotoHarness(page)
		// The variant strips every `alwaysVisible`, so nothing holds the form open. Mounted with the flag
		// off first: the grids are there, then the toggle empties the shadow root.
		await initFixture(page, { readonly: true }, noOptOutFixture)
		await waitForFormRender(page)
		await waitForSectionGridCount(page, 5)

		await setHideEmptyFields(page, true)
		await waitForSectionGridCount(page, 0)
		expect(await page.evaluate(() => document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.icure-form').length ?? -1)).toBe(0)
		expect(await countRendered(page)).toEqual({ fields: 0, labels: 0, buttons: 0 })
	})

	test('(l) with the prop off every field in the definition is rendered', async ({ page }) => {
		await gotoHarness(page)
		const result = (await initFixture(page, { readonly: true })) as { fieldCount: number }
		await waitForFormRender(page)
		await waitForSectionGridCount(page, 5)

		expect(result.fieldCount).toBe(fixtureFieldCount)
		const counts = await countRendered(page)
		// Eight value-bearing fields plus the label and the action button: the definition's field count.
		expect(counts).toEqual({ fields: 8, labels: 1, buttons: 1 })
		expect(counts.fields + counts.labels + counts.buttons).toBe(result.fieldCount)
	})
})
