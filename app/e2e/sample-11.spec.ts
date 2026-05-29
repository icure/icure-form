import { test, Page } from '@playwright/test'
import { captureAlerts, clickActionButton, expect, fieldInfo, getFieldText, openSample } from './_helpers'

// Read the visible tokens — each token renders as an `<li>` inside the
// ProseMirror editor of the allergies token-field. Returns their text content
// in order.
async function getRenderedTokens(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find(
			(df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none',
		) as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const wrapper = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
		const textField = wrapper?.shadowRoot?.querySelector('icure-text-field') as HTMLElement | null
		const editor = textField?.shadowRoot?.querySelector('#editor') as HTMLElement | null
		return Array.from(editor?.querySelectorAll('li') ?? []).map((li) => (li.textContent ?? '').trim())
	})
}

// Click on the token-field's `.delegated-edition` overlay. Programmatically
// dispatching click on the wrapper is enough — `pointer-events: none` on the
// inner editor means the click stays on the overlay and fires its @click.
async function clickDelegatedTokenField(page: Page, label: string): Promise<void> {
	await page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const walk = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
					// Walk up from the inner icure-text-field → icure-form-token-field wrapper.
					let host: HTMLElement = (c.getRootNode() as ShadowRoot).host as HTMLElement
					host = (host.getRootNode() as ShadowRoot).host as HTMLElement
					const overlay = host.shadowRoot?.querySelector('.delegated-edition') as HTMLElement | null
					if (overlay) {
						overlay.click()
						return overlay
					}
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
		const clicked = walk(icureForm!.shadowRoot!)
		if (!clicked) throw new Error(`No delegated-edition overlay found for field "${label}"`)
	}, label)
	await page.waitForTimeout(500)
}

async function getTokenCount(page: Page): Promise<number> {
	// number-field renders as "1.00" / "2.00" / "0.00" — strip the decimals before parsing.
	const txt = await getFieldText(page, 'Token count')
	const match = txt.match(/^(\d+)/)
	return match ? parseInt(match[1]) : 0
}

test.describe('11-delegated-edition', () => {
	test.beforeEach(async ({ page }) => openSample(page, '11-delegated-edition'))

	test('token-field is rendered with the delegated-edition overlay', async ({ page }) => {
		const overlayExists = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const tokenField = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
			return !!tokenField?.shadowRoot?.querySelector('.delegated-edition')
		})
		expect(overlayExists).toBe(true)
	})

	test('the inner editor is non-interactive (pointer-events disabled)', async ({ page }) => {
		const blocked = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const tokenField = icureForm?.shadowRoot?.querySelector('icure-form-token-field') as HTMLElement | null
			const innerWrapper = tokenField?.shadowRoot?.querySelector('.delegated-edition > div') as HTMLElement | null
			return innerWrapper?.style.pointerEvents
		})
		expect(blocked).toBe('none')
	})

	test('token count starts at 0', async ({ page }) => {
		expect(await getTokenCount(page)).toBe(0)
	})

	test('clicking the delegated field adds a token (host setValue path)', async ({ page }) => {
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await page.waitForTimeout(800)
		expect(await getTokenCount(page)).toBe(1)
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await page.waitForTimeout(800)
		expect(await getTokenCount(page)).toBe(2)
	})

	test('newly-added tokens are visible in the token-field editor (regression)', async ({ page }) => {
		// Regression guard: the count used to go up but the tokens never showed
		// because the host wrote them as one compound service while tokens-list
		// expects one service per token.
		expect(await getRenderedTokens(page)).toEqual([])
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await page.waitForTimeout(800)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1'])
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await page.waitForTimeout(800)
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1', 'Allergy #2'])
	})

	test('reset action clears the rendered tokens as well as the count', async ({ page }) => {
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		expect(await getRenderedTokens(page)).toEqual(['Allergy #1', 'Allergy #2'])
		await clickActionButton(page, 'reset-allergies')
		await page.waitForTimeout(500)
		expect(await getRenderedTokens(page)).toEqual([])
	})

	test('reset action clears the tokens', async ({ page }) => {
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		expect(await getTokenCount(page)).toBe(2)
		await clickActionButton(page, 'reset-allergies')
		await page.waitForTimeout(500)
		expect(await getTokenCount(page)).toBe(0)
	})

	test('clicking the delegated field does NOT fire an alert (fire-and-forget host handles it)', async ({ page }) => {
		const alerts = await captureAlerts(page)
		await clickDelegatedTokenField(page, 'Allergies (click to add)')
		await page.waitForTimeout(500)
		// The host's action handler matched edit-allergies and mutated the FVC
		// — alert() must not have fired for that event.
		const fired = await alerts.get()
		expect(fired).not.toContain('edit-allergies')
	})

	test('token-field wrapper exposes the icure-form-token-field tag', async ({ page }) => {
		expect((await fieldInfo(page, 'Allergies (click to add)')).wrapperTag).toBe('icure-form-token-field')
	})
})
