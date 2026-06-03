import { test, Page } from '@playwright/test'
import { captureAlerts, clickActionButton, expect, fieldInfo, getFieldText, openSample } from './_helpers'

// Read the visible tokens — each renders as an `<li>` inside the allergies
// token-field's ProseMirror editor (reached through the nested shadow roots:
// demo-app → decorated-form → icure-form → icure-form-token-field →
// icure-text-field → #editor).
async function getRenderedTokens(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const wrapper = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
		const textField = wrapper?.shadowRoot?.querySelector('icure-text-field') as HTMLElement | null
		const editor = textField?.shadowRoot?.querySelector('#editor') as HTMLElement | null
		return Array.from(editor?.querySelectorAll('li') ?? []).map((li) => (li.textContent ?? '').trim())
	})
}

// Viewport-relative rects of the editor and each token `li`, so a real
// page.mouse click lands on the right coordinates and reaches ProseMirror's
// own click handler (programmatic .click() would arrive with x/y = 0 and break
// per-token resolution).
async function allergiesGeometry(page: Page): Promise<{ editor: { left: number; top: number; right: number; bottom: number }; tokens: { cx: number; cy: number }[] }> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const wrapper = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
		const textField = wrapper?.shadowRoot?.querySelector('icure-text-field') as HTMLElement | null
		const editor = textField?.shadowRoot?.querySelector('#editor') as HTMLElement | null
		if (!editor) throw new Error('Allergies editor not found')
		const er = editor.getBoundingClientRect()
		const tokens = Array.from(editor.querySelectorAll('li')).map((li) => {
			const r = ((li.querySelector('.token') as HTMLElement | null) ?? li).getBoundingClientRect()
			return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
		})
		return { editor: { left: er.left, top: er.top, right: er.right, bottom: er.bottom }, tokens }
	})
}

// Click an empty part of the field (below the tokens) — fires the host
// actionListener with no payload, i.e. the add-new path.
async function clickEmptyArea(page: Page): Promise<void> {
	const { editor } = await allergiesGeometry(page)
	await page.mouse.click(editor.left + 6, editor.bottom - 4)
	await page.waitForTimeout(600)
}

// Click an existing token by index — fires the host actionListener with that
// token's `{ valueId, content }`.
async function clickToken(page: Page, index: number): Promise<void> {
	const { tokens } = await allergiesGeometry(page)
	if (!tokens[index]) throw new Error(`No token at index ${index} (have ${tokens.length})`)
	await page.mouse.click(tokens[index].cx, tokens[index].cy)
	await page.waitForTimeout(600)
}

async function getTokenCount(page: Page): Promise<number> {
	// number-field renders as "1.00" / "2.00" / "0.00" — strip the decimals before parsing.
	const txt = await getFieldText(page, 'Token count')
	const match = txt.match(/^(\d+)/)
	return match ? parseInt(match[1]) : 0
}

test.describe('11-delegated-edition', () => {
	test.beforeEach(async ({ page }) => openSample(page, '11-delegated-edition'))

	test('token-field renders the delegated-edition editor', async ({ page }) => {
		const delegated = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const tokenField = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
			return !!tokenField?.shadowRoot?.querySelector('icure-text-field.delegated-edition')
		})
		expect(delegated).toBe(true)
	})

	test('token count starts at 0', async ({ page }) => {
		expect(await getTokenCount(page)).toBe(0)
	})

	test('clicking an empty area adds a token (host setValue path)', async ({ page }) => {
		await clickEmptyArea(page)
		expect(await getTokenCount(page)).toBe(1)
		await clickEmptyArea(page)
		expect(await getTokenCount(page)).toBe(2)
	})

	test('newly-added tokens are visible in the editor (regression)', async ({ page }) => {
		// Regression guard: the count used to go up but the tokens never showed
		// because the host wrote them as one compound service while tokens-list
		// expects one service per token.
		expect(await getRenderedTokens(page)).toEqual([])
		await clickEmptyArea(page)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1'])
		await clickEmptyArea(page)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1', 'Allergy #2'])
	})

	test('tokens added while the form is in French render their text (regression)', async ({ page }) => {
		// Regression guard: the host must write the token under the language the
		// form is currently rendered in. When it hardcoded 'en' but the form was
		// in French, the token was stored under a language the editor never
		// displayed and rendered empty.
		//
		// openSample registers an init script that clears localStorage on every
		// navigation; register ours AFTER it so the language survives the reload.
		await page.addInitScript(() => localStorage.setItem('com.icure.demo.language', 'fr'))
		await page.reload({ waitUntil: 'domcontentloaded' })
		await page.waitForTimeout(1200)
		// Fail loudly if the form did not actually switch to French — otherwise
		// the assertion below would pass vacuously in English.
		const activeLanguage = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as (HTMLElement & { language?: string }) | undefined
			return visible?.language
		})
		expect(activeLanguage).toBe('fr')
		await clickEmptyArea(page)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1'])
	})

	test('clicking an existing token edits it in place (valueId payload)', async ({ page }) => {
		await clickEmptyArea(page)
		await clickEmptyArea(page)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1', 'Allergy #2'])
		expect(await getTokenCount(page)).toBe(2)

		// Click the first token: the host receives its valueId and rewrites that
		// same service in place — the text changes, the count does NOT grow.
		await clickToken(page, 0)
		expect(await getRenderedTokens(page)).toEqual(['Edited Allergy #1', 'Allergy #2'])
		expect(await getTokenCount(page)).toBe(2)
	})

	test('reset action clears the rendered tokens as well as the count', async ({ page }) => {
		await clickEmptyArea(page)
		await clickEmptyArea(page)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1', 'Allergy #2'])
		await clickActionButton(page, 'reset-allergies')
		await page.waitForTimeout(500)
		expect(await getRenderedTokens(page)).toEqual([])
		expect(await getTokenCount(page)).toBe(0)
	})

	test('clicking the delegated field does NOT fire an alert (host handles it)', async ({ page }) => {
		const alerts = await captureAlerts(page)
		await clickEmptyArea(page)
		// The host's action handler matched edit-allergies and mutated the FVC
		// — alert() must not have fired for that event.
		const fired = await alerts.get()
		expect(fired).not.toContain('edit-allergies')
	})

	test('token-field wrapper exposes the icure-form-token-field tag', async ({ page }) => {
		expect((await fieldInfo(page, 'Allergies (click to add)')).wrapperTag).toBe('icure-form-token-field')
	})
})
