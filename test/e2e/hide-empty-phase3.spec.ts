import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { countRendered, editFixture, gotoHarness, setValue, waitForFieldCount, waitForFormRender, waitForRenderSettled } from './hide-empty-helpers'

// ============================================================
// Phase 3: the `form:tab` layout under `hideEmptyFields`, and the automated proof of ADR 0001 — an
// inactive Section is never evaluated, so the tab bar can never be derived from survival.
//
// The proof rests on the harness `compute` spy: `BridgedFormValuesContainer.compute` is the single
// entry point every computed property goes through, so the formulas it was handed during a render
// pass are exactly the formulas that pass evaluated. The fixture gives every section its own unique
// formula strings and carries no `value` / `defaultValue` formula at all (those run in the
// container's dependency loop whether anything renders or not), so the recorded set names the
// sections that were evaluated and nothing else.
//
// Lit's render Task may run more than once around a mount, which makes raw counts unstable; the
// assertions below are therefore on the *set* of formulas evaluated, with the count checked only for
// being a whole number of passes.
//
// Plumbing shared with the other `hide-empty-*` suites lives in `./hide-empty-helpers`.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'hide-empty-tabs.yaml'), 'utf8')

const sectionTitles = ['Section 1', 'Section 2', 'Section 3']

// The fixture's formulas, per section, sorted the way `evaluatedFormulas` returns them. Written out
// rather than parsed from the YAML: the point of the proof is that these exact strings reached (or
// never reached) `compute`.
const s1Formulas = ['return false /* s1-hidden-a */']
const s2Formulas = ['return false /* s2-always-a */', 'return false /* s2-hidden-a */', 'return false /* s2-hidden-b */']
const s3Formulas = ['return false /* s3-always-a */', 'return false /* s3-hidden-a */', 'return false /* s3-hidden-b */']

// Section 3 opts out of hiding. In the tab layout that has to make no difference at all: the wrapper
// already gives every section a tab, and the section-level cascade `alwaysVisible` opts out of only
// exists in the plain `form` layout (ADR 0001, points 2 and 4).
const alwaysVisibleSectionFixture = editFixture(fixture, '  - section: Section 3\n', '  - section: Section 3\n    alwaysVisible: true\n')

async function initFixture(page: Page, options: Record<string, unknown>, yaml: string = fixture) {
	return await page.evaluate(async (opts: Record<string, unknown>) => await (window as any).initForm(opts), { yaml, language: 'en', renderer: 'form:tab', ...options })
}

/**
 * `alwaysVisible` as `Section.parse` read it, per section. Case (e) asserts that the flag makes no
 * difference, which is also what an unparsed flag would look like — so the variant has to be shown
 * to have reached the model.
 */
async function parsedSectionAlwaysVisible(page: Page): Promise<(boolean | undefined)[]> {
	return await page.evaluate(() => ((window as any).__currentForm.sections as { alwaysVisible?: boolean }[]).map((s) => s.alwaysVisible))
}

/** Tab-bar entries in document order. The bar is built in `render()` from `form.sections` alone. */
async function tabLabels(page: Page): Promise<string[]> {
	return await page.evaluate(() => Array.from(document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.tab-bar li') ?? []).map((li) => li.textContent?.trim() ?? ''))
}

interface ActiveTabContent {
	/** `.icure-form` grids anywhere in the shadow root: 1 means only the active tab produced one. */
	gridsInShadowRoot: number
	/** Direct children of the active tab's grid; 0 means it rendered empty, -1 that it has no grid. */
	activeGridChildren: number
	/** Value-bearing field components inside the active tab. */
	activeFields: number
}

async function activeTabContent(page: Page): Promise<ActiveTabContent> {
	return await page.evaluate(() => {
		const root = document.querySelector('icure-form')?.shadowRoot
		if (!root) return { gridsInShadowRoot: -1, activeGridChildren: -1, activeFields: -1 }
		const active = root.querySelector('.tab-content .tab.active')
		const isLabel = (el: Element) => el.tagName.toLowerCase() === 'icure-form-label'
		return {
			gridsInShadowRoot: root.querySelectorAll('.icure-form').length,
			activeGridChildren: active?.querySelector('.icure-form')?.childElementCount ?? -1,
			activeFields: Array.from(active?.querySelectorAll('.icure-form-field') ?? []).filter((el) => !isLabel(el)).length,
		}
	})
}

/**
 * Settle signal for a tab switch. `render()` keeps serving the previous pass's template while the
 * task is pending, so the `.tab` div at `idx` carries `active` only once the new pass has landed —
 * and the tab-bar `li`, which updates immediately, cannot serve. Nothing about the *content* of the
 * new tab is baked into the condition, so the assertions that follow it stay meaningful.
 */
async function waitForActiveTab(page: Page, idx: number) {
	await page.waitForFunction(
		(n: number) => {
			const tabs = document.querySelector('icure-form')?.shadowRoot?.querySelectorAll('.tab-content .tab')
			if (!tabs?.length) return false
			return Array.from(tabs).findIndex((t) => t.classList.contains('active')) === n
		},
		idx,
		{ timeout: 10_000 },
	)
	await waitForRenderSettled(page)
}

async function selectTab(page: Page, idx: number) {
	await page.evaluate(async (n: number) => await (window as any).__selectTab(n), idx)
	await waitForActiveTab(page, idx)
}

/** The distinct formulas handed to `compute` since the last reset, sorted. */
async function evaluatedFormulas(page: Page): Promise<string[]> {
	return await page.evaluate(() => Array.from(new Set((window as any).__computedFormulas() as string[])).sort())
}

async function computeCount(page: Page): Promise<number> {
	return await page.evaluate(() => (window as any).__computeCount() as number)
}

async function resetComputeCount(page: Page) {
	await page.evaluate(() => (window as any).__resetComputeCount())
}

test.describe('Phase 3 / the form:tab layout under hideEmptyFields', () => {
	test('(a) every section keeps its tab, however little it has to show', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)

		// Nothing is filled, so no section has any surviving content — and all three tabs are still
		// there. The tab bar is built from `form.sections` and translations only (ADR 0001, point 2).
		expect(await tabLabels(page)).toEqual(sectionTitles)
	})

	test('(b) the active tab renders its grid with no field boxes in it', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)

		// An active section whose content is entirely hidden renders an empty page, not a dropped one.
		// `gridsInShadowRoot: 1` is just the tab layout's existing behaviour — the wrapper already
		// discards inactive templates, so one grid is always the DOM outcome here, independent of the
		// ADR. The ADR guard is the formula-set assertion in cases (c) and (d) below.
		expect(await activeTabContent(page)).toEqual({ gridsInShadowRoot: 1, activeGridChildren: 0, activeFields: 0 })
	})
})

test.describe('Phase 3 / no formula of an inactive section is evaluated', () => {
	test('(c) the initial pass evaluates section 1 only, and a switch to tab 2 evaluates section 2 only', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)

		// A non-empty set is also what proves the spy is live: were it dead, every "no formula of
		// section N" assertion below would pass on an empty list.
		const initial = await evaluatedFormulas(page)
		expect(initial).toEqual(s1Formulas)
		expect(await computeCount(page)).toBeGreaterThan(0)

		await resetComputeCount(page)
		await selectTab(page, 1)

		const afterSwitch = await evaluatedFormulas(page)
		expect(afterSwitch).toEqual(s2Formulas)
		// Spelled out because it is the ADR constraint itself, not merely a consequence of the set:
		// section 3 was never touched, and section 1 stopped being evaluated the moment it went
		// inactive.
		expect(afterSwitch.filter((f) => s3Formulas.includes(f))).toEqual([])
		expect(afterSwitch.filter((f) => s1Formulas.includes(f))).toEqual([])
		// A whole number of passes rather than an exact count: Lit's render Task may run more than once
		// around a change, and one pass over the active section costs exactly its own three formulas.
		const switchCount = await computeCount(page)
		expect(switchCount).toBeGreaterThan(0)
		expect(switchCount % s2Formulas.length).toBe(0)
	})

	test('(d) filling a field of an inactive section evaluates nothing for that section', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		expect(await evaluatedFormulas(page)).toEqual(s1Formulas)

		await resetComputeCount(page)
		// Tab 1 stays active. The mutation swaps in a new container (the harness re-installs the spy on
		// it) and that re-runs the render task, but only section 1 is rendered again. The container
		// starts with no service at all, so this appends the field's first value rather than revising
		// one — `setValue` returns no id, which is why nothing is asserted about its result here.
		await setValue(page, 'S2HiddenA', 'seen')

		// Wait on the positive fact — section 1's formula recorded again, so a pass really did run —
		// before asserting the negative one. Reading the list straight after `setValue` could catch it
		// still empty, and "no section-2 formula" would then pass on nothing.
		await page.waitForFunction((f: string) => ((window as any).__computedFormulas() as string[]).includes(f), s1Formulas[0], { timeout: 10_000 })
		await waitForRenderSettled(page)

		expect(await evaluatedFormulas(page)).toEqual(s1Formulas)
		// A newly answered field in an inactive section changes nothing about the bar: no tab appears,
		// and none disappears.
		expect(await tabLabels(page)).toEqual(sectionTitles)

		// The value really did land — so the assertion above is about laziness, not about a no-op
		// `setValue`. Section 2 is evaluated for the first time here, when it becomes the active tab.
		await resetComputeCount(page)
		await selectTab(page, 1)
		expect(await activeTabContent(page)).toEqual({ gridsInShadowRoot: 1, activeGridChildren: 1, activeFields: 1 })
		expect(await evaluatedFormulas(page)).toEqual(s2Formulas)
	})
})

test.describe('Phase 3 / alwaysVisible on a section, and the prop off', () => {
	test('(e) alwaysVisible on a section makes no difference in the tab layout', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true, hideEmptyFields: true })
		await waitForFormRender(page)
		await selectTab(page, 2)
		expect(await parsedSectionAlwaysVisible(page)).toEqual([undefined, undefined, undefined])
		const plain = { tabs: await tabLabels(page), content: await activeTabContent(page) }

		await initFixture(page, { readonly: true, hideEmptyFields: true }, alwaysVisibleSectionFixture)
		await waitForFormRender(page)
		await selectTab(page, 2)
		// The edited YAML really did reach the model: without this, a flag dropped by `Section.parse`
		// would produce the same "no difference" the case is asserting.
		expect(await parsedSectionAlwaysVisible(page)).toEqual([undefined, undefined, true])
		const optedOut = { tabs: await tabLabels(page), content: await activeTabContent(page) }

		expect(optedOut).toEqual(plain)
		// Not a comparison of two nothings: three tabs either way, and tab 3 renders its empty grid
		// either way. The flag has nothing left to opt out of, because the tab is never at stake.
		expect(plain).toEqual({ tabs: sectionTitles, content: { gridsInShadowRoot: 1, activeGridChildren: 0, activeFields: 0 } })
	})

	test('(f) with the prop off the active tab shows every field it has', async ({ page }) => {
		await gotoHarness(page)
		await initFixture(page, { readonly: true })
		await waitForFormRender(page)
		await waitForFieldCount(page, 3)

		expect(await tabLabels(page)).toEqual(sectionTitles)
		// Section 1's three fields, its `hidden: return false` one included; still only one grid, since
		// laziness is the layout's own behaviour and owes nothing to `hideEmptyFields`.
		expect(await activeTabContent(page)).toEqual({ gridsInShadowRoot: 1, activeGridChildren: 3, activeFields: 3 })
		expect(await countRendered(page)).toEqual({ fields: 3, labels: 0, buttons: 0 })
	})
})
