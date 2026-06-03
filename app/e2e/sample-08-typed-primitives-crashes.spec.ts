import { test, expect, Page } from '@playwright/test'
import { openSample, selectTab } from './_helpers'

// These two specs target "Invalid content for node paragraph" crashes the user
// reported on the constrained ProseMirror schemas:
//   - date-time: typing `10/10/2005 10:10:20` triggers the throw
//   - measure : typing `180 cm` over an existing measure triggers the throw
//
// Both crashes happen INSIDE a ProseMirror transaction. They surface as
// `pageerror` events in the browser. The tests collect those events and fail
// if any of them mention "Invalid content for node paragraph".

async function collectPageErrors(page: Page): Promise<string[]> {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})
	return errors
}

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
		pm.setAttribute('data-test-marker', `__${label}-pm`)
	}, label)
	await page.locator(`[data-test-marker="__${label}-pm"]`).click()
}

test.describe('08 typed primitives crashes', () => {
	test.beforeEach(async ({ page }) => openSample(page, '08-rich-text'))

	test('date-time: typing "10/10/2005 10:10:20" does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'dateTimeInText')
		await page.keyboard.type('10/10/2005 10:10:20', { delay: 30 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})

	test('date-time: pressing Enter inside the time node does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'dateTimeInText')
		await page.keyboard.type('10/10/2005', { delay: 30 })
		await page.keyboard.press('Enter')
		await page.keyboard.type('10:10:20', { delay: 30 })
		await page.keyboard.press('Enter')
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})

	test('date-time: pasting "10/10/2005 10:10:20" does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'dateTimeInText')
		// Simulate a paste by dispatching a ClipboardEvent on the contenteditable.
		await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'dateTimeInText') {
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
			if (!pm) throw new Error('no editor')
			const dt = new DataTransfer()
			dt.setData('text/plain', '10/10/2005 10:10:20')
			pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
		})
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})

	test('measure: typing "180 cm" over an existing measure does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		// Seed an existing measure first.
		await focusEditor(page, 'measureInText')
		await page.keyboard.type('70 kg', { delay: 30 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(400)
		// Now select-all and replace with `180 cm`.
		await focusEditor(page, 'measureInText')
		await page.keyboard.press('Meta+A')
		await page.keyboard.type('180 cm', { delay: 30 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})

	test('measure: pressing Enter inside the measure editor does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'measureInText')
		await page.keyboard.type('70 kg', { delay: 30 })
		await page.waitForTimeout(400)
		await focusEditor(page, 'measureInText')
		await page.keyboard.press('Enter')
		await page.keyboard.type('180 cm', { delay: 30 })
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})

	test('measure: pasting "180 cm" over an existing measure does not throw "Invalid content for node paragraph"', async ({ page }) => {
		const errors = await collectPageErrors(page)
		await selectTab(page, 'Typed primitives')
		await focusEditor(page, 'measureInText')
		await page.keyboard.type('70 kg', { delay: 30 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(400)
		await focusEditor(page, 'measureInText')
		await page.keyboard.press('Meta+A')
		await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'measureInText') {
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
			if (!pm) throw new Error('no editor')
			const dt = new DataTransfer()
			dt.setData('text/plain', '180 cm')
			pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
		})
		await page.waitForTimeout(400)
		const bad = errors.filter((e) => /Invalid content for node paragraph/.test(e))
		expect(bad, `Got ProseMirror schema errors:\n${bad.join('\n')}`).toEqual([])
	})
})
