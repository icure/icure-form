import { test, Page } from '@playwright/test'
import { expect, fieldInfo, getTabLabels, openSample, selectTab } from './_helpers'

// Read the schema attribute / class on the field's editor — each ProseMirror
// schema picks a distinct class on the `#editor` div (`styled-text-with-codes`,
// `text-document`, `items-list`, `tokens-list-with-codes`, `date`, `time`,
// `date-time`, `decimal`, `measure`).
async function schemaClassOf(page: Page, label: string): Promise<string | undefined> {
	return page.evaluate((label) => {
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
		const host = walk(icureForm!.shadowRoot!)
		const editor = host?.shadowRoot?.querySelector('#editor')
		return (editor as HTMLElement | null)?.className
	}, label)
}

test.describe('08-rich-text', () => {
	test.beforeEach(async ({ page }) => openSample(page, '08-rich-text'))

	test('three section tabs', async ({ page }) => {
		expect(await getTabLabels(page)).toEqual(['Markdown family', 'Structured schemas', 'Typed primitives'])
	})

	test('Markdown family: text / styled / styled-with-codes / document each get their schema class', async ({ page }) => {
		await selectTab(page, 'Markdown family')
		expect(await schemaClassOf(page, 'text')).toContain('text')
		expect(await schemaClassOf(page, 'styled')).toContain('styled-text')
		expect(await schemaClassOf(page, 'styledWithCodes')).toContain('styled-text-with-codes')
		expect(await schemaClassOf(page, 'document')).toContain('text-document')
	})

	test('Structured schemas: items-list + tokens-list-with-codes render with their classes', async ({ page }) => {
		await selectTab(page, 'Structured schemas')
		expect(await schemaClassOf(page, 'items')).toContain('items-list')
		expect(await schemaClassOf(page, 'tokens')).toContain('tokens-list')
	})

	test('Typed primitives: date / time / date-time / decimal / measure', async ({ page }) => {
		await selectTab(page, 'Typed primitives')
		expect(await schemaClassOf(page, 'dateInText')).toContain('date')
		expect(await schemaClassOf(page, 'timeInText')).toContain('time')
		expect(await schemaClassOf(page, 'dateTimeInText')).toContain('date-time')
		expect(await schemaClassOf(page, 'decimalInText')).toContain('decimal')
		expect(await schemaClassOf(page, 'measureInText')).toContain('measure')
	})

	test('all schemas render as icure-form-text-field wrappers', async ({ page }) => {
		await selectTab(page, 'Markdown family')
		for (const lbl of ['text', 'styled', 'styledWithCodes', 'document']) {
			expect((await fieldInfo(page, lbl)).wrapperTag).toBe('icure-form-text-field')
		}
	})

	test('Structured: items-list keeps every line when several items are added at once (regression)', async ({ page }) => {
		await selectTab(page, 'Structured schemas')
		// Mark the items-list ProseMirror editor so Playwright can target it
		// through the shadow boundary with a native click + keyboard typing.
		const marker = '__items-pm'
		await page.evaluate((marker) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'items') {
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
			pm?.setAttribute('data-test-marker', marker)
		}, marker)
		await page.locator(`[data-test-marker="${marker}"]`).click()
		await page.keyboard.type('alpha', { delay: 20 })
		await page.keyboard.press('Enter')
		await page.keyboard.type('beta', { delay: 20 })
		await page.keyboard.press('Enter')
		await page.keyboard.type('gamma', { delay: 20 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(800)
		const itemsText = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'items') {
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
			const editor = walk(icureForm!.shadowRoot!)
			return Array.from(editor?.querySelectorAll('li') ?? []).map((li) => (li.textContent ?? '').trim())
		})
		expect(itemsText).toEqual(['alpha', 'beta', 'gamma'])
	})

	test('Structured: tokens-list-with-codes keeps every token when several are added at once (regression)', async ({ page }) => {
		await selectTab(page, 'Structured schemas')
		const marker = '__tokens-pm'
		await page.evaluate((marker) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'tokens') {
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
			pm?.setAttribute('data-test-marker', marker)
		}, marker)
		await page.locator(`[data-test-marker="${marker}"]`).click()
		await page.keyboard.type('apple', { delay: 20 })
		await page.keyboard.press('Enter')
		await page.keyboard.type('pear', { delay: 20 })
		await page.keyboard.press('Enter')
		await page.keyboard.type('plum', { delay: 20 })
		await page.keyboard.press('Tab')
		await page.waitForTimeout(800)
		const tokens = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === 'tokens') {
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
			const editor = walk(icureForm!.shadowRoot!)
			return Array.from(editor?.querySelectorAll('li') ?? []).map((li) => (li.textContent ?? '').trim())
		})
		expect(tokens).toEqual(['apple', 'pear', 'plum'])
	})
})
