import { test, expect, Page } from '@playwright/test'
import { openSample, selectTab } from './_helpers'

// Diagnostic + regression for the user-reported bug: typing
// `10/10/2010 10:10:10` into the *date* field (single-segment date) and
// blurring causes the value to flip to "some invalid time value". We expect
// that:
//   1. The editor's textContent ends up as a valid `10/10/2010`.
//   2. The setValue propagated to the host is a `datetime` with value
//      20101010 (yyyyMMdd integer), NOT NaN, NOT an HHmmss number.

async function focusEditor(page: Page, label: string): Promise<void> {
	await page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const walk = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
					const host = (c.getRootNode() as ShadowRoot).host as HTMLElement
					return host.shadowRoot?.querySelector('#editor [contenteditable="true"]') as HTMLElement | null
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const f = walk(c.shadowRoot)
					if (f) return f
				}
				const f = walk(c)
				if (f) return f
			}
			return null
		}
		const pm = walk(icureForm!.shadowRoot!)
		if (!pm) throw new Error(`No editor for label "${label}"`)
		pm.focus()
	}, label)
}

/**
 * Drive the EditorView directly so input flows through the maskPlugin's
 * `handleTextInput` exactly as it would for a real keystroke. Each character
 * is dispatched as its own call so the plugin chain (regex filter → mask
 * fill → tail overflow → next-node) runs once per character.
 */
async function typeIntoEditor(page: Page, label: string, text: string): Promise<void> {
	await page.evaluate(
		({ label, text }) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
						return (c.getRootNode() as ShadowRoot).host as HTMLElement
					}
					if (c instanceof HTMLElement && c.shadowRoot) {
						const f = walk(c.shadowRoot)
						if (f) return f
					}
					const f = walk(c)
					if (f) return f
				}
				return null
			}
			const host = walk(icureForm!.shadowRoot!) as unknown as {
				view?: {
					state: { selection: { from: number; to: number } }
					someProp: <T>(name: string, f?: (v: T) => boolean | void) => T | undefined
				}
			} | null
			const view = host?.view
			if (!view) throw new Error(`No EditorView for label "${label}"`)
			for (const ch of text) {
				const sel = view.state.selection
				// someProp walks all plugins' props and yields each implementation
				// of `handleTextInput`. The maskPlugin / regexpPlugin register
				// theirs and return true once handled — same path ProseMirror
				// takes when a real beforeinput event fires.
				view.someProp<(v: typeof view, from: number, to: number, ch: string) => boolean>('handleTextInput', (fn) => !!fn(view, sel.from, sel.to, ch))
			}
		},
		{ label, text },
	)
}

async function editorText(page: Page, label: string): Promise<string> {
	return page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const walk = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
					const host = (c.getRootNode() as ShadowRoot).host as HTMLElement
					return host.shadowRoot?.querySelector('#editor') as HTMLElement | null
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const f = walk(c.shadowRoot)
					if (f) return f
				}
				const f = walk(c)
				if (f) return f
			}
			return null
		}
		const ed = walk(icureForm!.shadowRoot!)
		return (ed?.textContent ?? '').trim()
	}, label)
}

test.describe('08 date overflow on blur', () => {
	test.beforeEach(async ({ page }) => openSample(page, '08-rich-text'))

	test('typing "10/10/2010 10:10:10" into the date field and blurring leaves a valid date string', async ({ page }) => {
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'dateInText')
		await typeIntoEditor(page, 'dateInText', '10/10/2010 10:10:10')
		await page.keyboard.press('Tab')
		await page.waitForTimeout(500)
		const text = await editorText(page, 'dateInText')
		// The editor's text should read `10/10/2010` — overflow chars must be
		// discarded, not silently re-rendered as a different date string.
		expect(text).toBe('10/10/2010')
	})

	test('typing "10/10/2010 10:10:10" into the date-time field and blurring keeps date + time intact', async ({ page }) => {
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'dateTimeInText')
		await typeIntoEditor(page, 'dateTimeInText', '10/10/2010 10:10:10')
		await page.keyboard.press('Tab')
		await page.waitForTimeout(500)
		const text = await editorText(page, 'dateTimeInText')
		// The text spans both <date> and <time> spans without separator.
		expect(text).toBe('10/10/201010:10:10')
	})

	test('diagnostic: dump editor texts after typing "10/10/2010 10:10:10"', async ({ page }) => {
		await selectTab(page, 'Typed primitives')
		for (const label of ['dateInText', 'timeInText', 'dateTimeInText']) {
			await focusEditor(page, label)
			await typeIntoEditor(page, label, '10/10/2010 10:10:10')
			await page.keyboard.press('Tab')
			await page.waitForTimeout(300)
			// eslint-disable-next-line no-console
			console.log(`[${label}] editor text after typing:`, JSON.stringify(await editorText(page, label)))
		}
	})
})
