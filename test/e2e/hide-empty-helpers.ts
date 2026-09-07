import { Page } from '@playwright/test'

// ============================================================
// Helpers shared by the `hide-empty-*.spec.ts` suites. This module deliberately declares no
// `test()` / `describe()` of its own, so importing it registers nothing: each spec keeps its own
// cases while the plumbing below lives in one place.
//
// Helpers used by a single suite (phase 1's `gridCount` / `parsedFieldTypes`, phase 2's section and
// group descriptors, phase 3's tab helpers) stay in that suite's file.
// ============================================================

export async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

// Wait for icure-form to finish rendering inside its shadow DOM (mirrors forms.spec.ts).
export async function waitForFormRender(page: Page) {
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

/**
 * Settle signal for a render that may produce nothing: the element's Lit Task has completed
 * (`TaskStatus.COMPLETE` is 2) and the pending "Loading..." paragraph is gone from the shadow root.
 * `waitForFormRender` cannot serve here — it waits for a grid or a paragraph to *appear*, and an
 * all-empty section leaves neither, so it would simply time out. Nothing about what the render
 * produced is baked into this condition, so the assertions that follow it stay meaningful.
 */
export async function waitForRenderSettled(page: Page) {
	await page.waitForSelector('icure-form', { state: 'attached', timeout: 10_000 })
	await page.waitForFunction(
		() => {
			const el = document.querySelector('icure-form') as any
			if (!el?.shadowRoot) return false
			if (el._asyncTask?.status !== 2) return false
			const pending = el.shadowRoot.querySelector('p')
			return pending === null || pending.textContent?.trim() !== 'Loading...'
		},
		undefined,
		{ timeout: 15_000 },
	)
}

export interface RenderedCounts {
	fields: number
	labels: number
	buttons: number
}

/**
 * Counts what the `form` renderer actually emits: every field component carries
 * `class="icure-form-field"` (labels included, as `<icure-form-label>`) and action buttons carry
 * `class="icure-form-button"`. `fields` therefore counts only the value-bearing components.
 */
export async function countRendered(page: Page): Promise<RenderedCounts> {
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

export async function waitForFieldCount(page: Page, expected: number) {
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

/**
 * Fixture variants as string edits, so the shape they differ by stays visible in the test. Each edit
 * asserts its anchor to fail loudly rather than silently testing the unedited fixture.
 */
export function editFixture(source: string, from: string | RegExp, to: string): string {
	const edited = source.replace(from, to)
	if (edited === source) throw new Error(`fixture edit had no effect: ${from}`)
	return edited
}

/** Sets a top-level value, overwriting the existing one for that label when there is one. */
export async function setValue(page: Page, label: string, value: string) {
	return await page.evaluate(
		({ label, value, language }: { label: string; value: string; language: string }) => {
			const fvc = (window as any).__currentFvc
			// The revisions filter narrows `getValues` to this label's own value, whose id is needed so
			// that `setValue` overwrites it instead of appending a second value for the same label.
			const values = fvc.getValues((_id: string, history: { revision: string | null; value?: { label?: string } }[]) => (history?.[0]?.value?.label === label ? [history[0].revision] : []))
			const id = Object.keys(values)[0]
			fvc.setValue(label, language, { content: { [language]: { type: 'string', value } }, codes: [] }, id)
			return id ?? null
		},
		{ label, value, language: 'en' },
	)
}
