import { test, Page } from '@playwright/test'
import { expect, fieldExists, fieldInfo, openSample, setFieldText } from './_helpers'

// The demo's renderer toggle plus the Read-only / Hide empty fields checkboxes,
// exercised end-to-end against sample 01 (no `roles` restrictions anywhere in the
// demo's samples, so the `doctor` role the `form`/`form:tab` renderers imply never
// hides content here).

/** Poll until the `.icure-form-field` count reaches `expected` (re-renders happen asynchronously via `@lit/task`). */
async function waitForFieldCount(page: Page, expected: number): Promise<void> {
	await page.waitForFunction(
		(expected) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			return (icureForm?.shadowRoot?.querySelectorAll('.icure-form-field').length ?? -1) === expected
		},
		expected,
		{ timeout: 10_000 },
	)
}

/** Whether the named field's ProseMirror editor currently accepts input (false once `.readonly` reaches <icure-form>). */
async function isEditorEditable(page: Page, label: string): Promise<boolean> {
	return page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		if (!icureForm) throw new Error('No active icure-form')
		const walk = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
					return (c.getRootNode() as ShadowRoot).host as HTMLElement
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const found = walk(c.shadowRoot)
					if (found) return found
				}
				const found = walk(c)
				if (found) return found
			}
			return null
		}
		const host = walk(icureForm.shadowRoot!)
		const editor = host?.shadowRoot?.querySelector('#editor') as HTMLElement | null
		if (!editor) throw new Error(`Editor for "${label}" not found`)
		return editor.isContentEditable
	}, label)
}

/** Poll until the `.tab-bar li` count reaches `expected` (present only for `form:tab`). */
async function waitForTabCount(page: Page, expected: number): Promise<void> {
	await page.waitForFunction(
		(expected) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			return (icureForm?.shadowRoot?.querySelectorAll('.tab-bar li').length ?? -1) === expected
		},
		expected,
		{ timeout: 10_000 },
	)
}

test.describe('demo-app — renderer & hide-empty toggles', () => {
	test.beforeEach(async ({ page }) => openSample(page, '01-components-gallery'))

	test('renderer toggle offers Form, Clinician, Card — Form activates the plain form renderer', async ({ page }) => {
		const buttons = page.locator('.renderer-toggle button')
		await expect(buttons).toHaveCount(3)
		await expect(buttons.nth(0)).toHaveText('Form')
		await expect(buttons.nth(1)).toContainText('Clinician')
		await expect(buttons.nth(2)).toHaveText('Card')

		// Default mode is `form:tab` — a tab bar is present.
		await waitForTabCount(page, 5)

		await buttons.nth(0).click()
		await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true')
		await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'false')
		await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'false')

		// Plain `form` renderer: no tab bar, and every section's fields render concatenated.
		await waitForTabCount(page, 0)
		await waitForFieldCount(page, 18)
	})

	test('Hide empty fields checkbox is disabled unless Read-only is on', async ({ page }) => {
		const readonlyToggle = page.locator('#readonly-toggle')
		const hideEmptyToggle = page.locator('#hide-empty-toggle')

		await expect(readonlyToggle).not.toBeChecked()
		await expect(hideEmptyToggle).toBeDisabled()
		await expect(hideEmptyToggle).not.toBeChecked()

		await readonlyToggle.click()
		await expect(readonlyToggle).toBeChecked()
		await expect(hideEmptyToggle).toBeEnabled()

		await readonlyToggle.click()
		await expect(readonlyToggle).not.toBeChecked()
		await expect(hideEmptyToggle).toBeDisabled()
	})

	test('hiding empty fields collapses everything but the filled field and its section label; form:tab keeps its tab bar', async ({ page }) => {
		const buttons = page.locator('.renderer-toggle button')
		const readonlyToggle = page.locator('#readonly-toggle')
		const hideEmptyToggle = page.locator('#hide-empty-toggle')

		// Switch to the plain `form` renderer so every section's fields render at once (no tabs).
		await buttons.nth(0).click()
		await waitForFieldCount(page, 18)

		// Fill the one text field in "Text & numbers" before turning read-only on (a read-only editor
		// can't be typed into).
		await setFieldText(page, 'text', 'Hello world')
		expect((await fieldInfo(page, 'text')).editorText).toBe('Hello world')

		// Read-only alone does not hide anything yet, but it does reach <icure-form>: the text editor
		// stops accepting input (its ProseMirror view is no longer content-editable).
		await readonlyToggle.click()
		await waitForFieldCount(page, 18)
		expect(await isEditorEditable(page, 'text')).toBe(false)

		// Hide empty fields: every value-bearing field with no answer disappears, cascading through
		// groups and sections with no surviving content. Only the "Text & numbers" section keeps
		// anything — the filled text field plus the section's static explanatory label (its group and
		// section both still have real content). Every other section (Dates & times, Choices, Tokens &
		// lists, Label & action) collapses entirely, action buttons included.
		await hideEmptyToggle.click()
		await waitForFieldCount(page, 2)
		expect((await fieldInfo(page, 'text')).visible).toBe(true)
		expect(await fieldExists(page, 'textMultiline')).toBe(false)

		// Turning read-only back off makes hideEmptyFields ineffective again (its checkbox stays
		// checked but disabled) — full content returns.
		await readonlyToggle.click()
		await expect(hideEmptyToggle).toBeChecked()
		await expect(hideEmptyToggle).toBeDisabled()
		await waitForFieldCount(page, 18)

		// Re-enable read-only (hideEmptyFields is still checked from before) and switch to `form:tab`:
		// the tab bar must keep every section's tab, even ones with nothing to show.
		await readonlyToggle.click()
		await waitForFieldCount(page, 2)
		await buttons.nth(1).click()
		await waitForTabCount(page, 5)
		// The active tab (first section, "Text & numbers") still shows only the filled field + label.
		await waitForFieldCount(page, 2)
	})
})
