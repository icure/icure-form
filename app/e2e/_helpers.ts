// Helpers shared by app/e2e/*.spec.ts. All assertions piercing the shadow DOM
// of icure-form / icure-text-field happen inside `page.evaluate` so they're
// resilient to Playwright's auto-wait timing.

import { Page, expect } from '@playwright/test'

export const ALL_SLUGS = [
	'01-components-gallery',
	'02-formulas',
	'03-async-formulas',
	'04-validation',
	'05-conditional-actions',
	'06-subforms',
	'07-tabs-layout',
	'08-rich-text',
	'10-clinical-workflow',
	'11-delegated-edition',
] as const

export type SampleSlug = (typeof ALL_SLUGS)[number]

/** Navigate to a sample by slug and wait for its <icure-form> to render. */
export async function openSample(page: Page, slug: SampleSlug): Promise<void> {
	await page.addInitScript(() => {
		try {
			localStorage.clear()
		} catch {
			/* ignore */
		}
	})
	await page.goto(`/#${slug}`, { waitUntil: 'domcontentloaded' })
	await page.waitForFunction(
		(slug) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => {
				const wrapper = df.parentElement as HTMLElement | null
				return wrapper && wrapper.style.display !== 'none'
			})
			if (!visible) return false
			const icureForm = (visible as HTMLElement).shadowRoot?.querySelector('icure-form')
			if (!icureForm?.shadowRoot) return false
			return !!icureForm.shadowRoot.querySelector('.icure-form, .tab-container, p')
		},
		slug,
		{ timeout: 20_000 },
	)
	// Let async formulas settle on first render.
	await page.waitForTimeout(800)
}

/** Click the tab whose label (or translation key) matches `labelOrKey`. */
export async function selectTab(page: Page, labelOrKey: string): Promise<void> {
	await page.evaluate((labelOrKey) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const tabs = icureForm?.shadowRoot?.querySelectorAll('.tab-bar li') ?? []
		for (const tab of Array.from(tabs)) {
			if ((tab.textContent ?? '').trim() === labelOrKey || (tab.textContent ?? '').trim().toLowerCase() === labelOrKey.toLowerCase()) {
				;(tab as HTMLElement).click()
				return
			}
		}
		throw new Error(
			`No tab found with label "${labelOrKey}". Tabs: ${Array.from(tabs)
				.map((t) => `"${t.textContent?.trim()}"`)
				.join(', ')}`,
		)
	}, labelOrKey)
	// Let the new tab's content render.
	await page.waitForTimeout(300)
}

/** Return the visible decorated-form element handle. */
async function activeIcureForm(page: Page) {
	return page.evaluateHandle(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		return visible?.shadowRoot?.querySelector('icure-form') as HTMLElement
	})
}

/**
 * Find the icure-text-field shadow root for a given field label (matches
 * `shortLabel` rendered as the field's <label>). Returns the editor div and
 * the wrapper element, plus the surrounding wrapper tag (icure-form-text-field
 * / icure-form-number-field / icure-form-measure-field / etc.) so tests can
 * assert on its type.
 */
export async function fieldInfo(
	page: Page,
	label: string,
): Promise<{
	wrapperTag: string
	labelText: string
	editorText: string
	visible: boolean
	hasInput: boolean
	unit: string | null
}> {
	return page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		if (!icureForm) throw new Error('No active icure-form')
		// Look in all of the form's shadow descendants for a <label> with matching text.
		const findMatch = (root: ParentNode): { wrapperTag: string; labelText: string; editorText: string; visible: boolean; hasInput: boolean; unit: string | null } | null => {
			const walkLabels = (node: Element | ShadowRoot): Element | null => {
				if (node instanceof Element && node.tagName === 'LABEL' && (node.textContent ?? '').trim() === label) return node
				const children = (node as Element).children ?? (node as ShadowRoot).children ?? []
				for (const c of Array.from(children)) {
					if (c instanceof HTMLElement && c.shadowRoot) {
						const found = walkLabels(c.shadowRoot)
						if (found) return found
					}
					const found = walkLabels(c)
					if (found) return found
				}
				return null
			}
			const labelEl = walkLabels(root as Element)
			if (!labelEl) return null
			// Walk up to the icure-text-field host (the shadowRoot.host of the document fragment hosting the label).
			const textFieldHost = (labelEl.getRootNode() as ShadowRoot).host as HTMLElement
			const wrapperHost = (textFieldHost.getRootNode() as ShadowRoot).host as HTMLElement
			const editor = textFieldHost.shadowRoot?.querySelector('#editor') as HTMLElement | null
			const editorText = editor ? (editor.textContent ?? '').trim() : ''
			// Unit lives as the LAST <span> inside the first ProseMirror line of the editor.
			// e.g. <div#editor><div><span><br></span><span>kg</span></div></div>
			const spans = Array.from(editor?.querySelectorAll(':scope > div > span') ?? []) as HTMLElement[]
			const unitSpan = spans.length > 1 ? spans[spans.length - 1] : null
			const unit = unitSpan ? (unitSpan.textContent ?? '').trim() || null : null
			// Visibility: traverse ancestors of wrapperHost in the icure-form light DOM.
			let visible = true
			let ancestor: HTMLElement | null = wrapperHost
			while (ancestor) {
				const style = ancestor.ownerDocument!.defaultView!.getComputedStyle(ancestor)
				if (style.display === 'none' || style.visibility === 'hidden') {
					visible = false
					break
				}
				ancestor = ancestor.parentElement
			}
			const hasInput = !!textFieldHost.shadowRoot?.querySelector('input, select')
			return { wrapperTag: wrapperHost.tagName.toLowerCase(), labelText: label, editorText, visible, hasInput, unit }
		}
		const r = findMatch(icureForm.shadowRoot!)
		if (!r) throw new Error(`Field with label "${label}" not found`)
		return r
	}, label)
}

/** Type into the ProseMirror editor for the named field. */
export async function setFieldText(page: Page, label: string, value: string): Promise<void> {
	// First click into the editor.
	await page.evaluate(
		({ label }) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			if (!icureForm) throw new Error('No active icure-form')
			const walk = (root: ParentNode): HTMLElement | null => {
				const children = (root as Element).children ?? (root as ShadowRoot).children ?? []
				for (const c of Array.from(children)) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) {
						const editor = (c.getRootNode() as ShadowRoot).host as HTMLElement
						return editor.shadowRoot?.querySelector('#editor') as HTMLElement | null
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
			const editor = walk(icureForm.shadowRoot!)
			if (!editor) throw new Error(`Editor for "${label}" not found`)
			editor.focus()
			editor.click()
		},
		{ label },
	)
	// Select-all then either type the replacement or delete (for empty values).
	await page.keyboard.press('Meta+A')
	if (value === '') {
		await page.keyboard.press('Delete')
	} else {
		await page.keyboard.type(value, { delay: 20 })
	}
	await page.keyboard.press('Tab')
	// Allow computed properties to fire.
	await page.waitForTimeout(400)
}

/** Read the text content of the named field's editor. */
export async function getFieldText(page: Page, label: string): Promise<string> {
	const info = await fieldInfo(page, label)
	return info.editorText
}

/** Click the action button whose displayed label matches. */
export async function clickActionButton(page: Page, label: string): Promise<void> {
	await page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		if (!icureForm) throw new Error('No active icure-form')
		const findButton = (root: ParentNode): HTMLElement | null => {
			const children = (root as Element).children ?? (root as ShadowRoot).children ?? []
			for (const c of Array.from(children)) {
				// `<icure-button>` shadow renders `<div class="icure-button">…label…</div>`.
				if (c.classList?.contains('icure-button') && (c.textContent ?? '').trim() === label) {
					return c as HTMLElement
				}
				if ((c.tagName === 'BUTTON' || c.tagName === 'ICURE-BUTTON' || c.tagName === 'ICURE-FORM-BUTTON') && (c.textContent ?? '').trim() === label) {
					return c as HTMLElement
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const found = findButton(c.shadowRoot)
					if (found) return found
				}
				const found = findButton(c)
				if (found) return found
			}
			return null
		}
		const btn = findButton(icureForm.shadowRoot!)
		if (!btn) throw new Error(`Action button with label "${label}" not found`)
		btn.click()
	}, label)
}

/** Replace window.alert so action listener calls are observable. */
export async function captureAlerts(page: Page): Promise<{ get: () => Promise<string[]> }> {
	await page.evaluate(() => {
		;(window as unknown as { __alerts: string[] }).__alerts = []
		window.alert = (message: string) => {
			;(window as unknown as { __alerts: string[] }).__alerts.push(String(message))
		}
	})
	return {
		get: () => page.evaluate(() => (window as unknown as { __alerts: string[] }).__alerts.slice()),
	}
}

/** Read tab labels from the active form. */
export async function getTabLabels(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		return Array.from(icureForm?.shadowRoot?.querySelectorAll('.tab-bar li') ?? []).map((li) => (li.textContent ?? '').trim())
	})
}

/** Read the active tab label. */
export async function getActiveTab(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const active = icureForm?.shadowRoot?.querySelector('.tab-bar li.active')
		return active ? (active.textContent ?? '').trim() : null
	})
}

/** Returns true if a field with the given label is rendered (regardless of visibility). */
export async function fieldExists(page: Page, label: string): Promise<boolean> {
	return page
		.evaluate((label) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			if (!icureForm) return false
			const walk = (root: ParentNode): boolean => {
				const children = (root as Element).children ?? (root as ShadowRoot).children ?? []
				for (const c of Array.from(children)) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === label) return true
					if (c instanceof HTMLElement && c.shadowRoot && walk(c.shadowRoot)) return true
					if (walk(c)) return true
				}
				return false
			}
			return walk(icureForm.shadowRoot!)
		}, label)
		.catch(() => false)
}

/** Click a radio/checkbox option inside the named button-group field.
 *
 * `optionId` matches the input's `id`, which is the qualified code id (e.g.
 * "DEMO-CONTACT-PREF|phone|1"). Bare option keys also work — they get matched
 * against the code segment between the first and second pipe (or against the
 * full id if no pipes). This mirrors how `optionMapper` auto-qualifies keys.
 *
 * We mark the input with a data-attribute and let Playwright's `click()` fire
 * the change event natively — programmatic `.checked = !x` does not propagate
 * through Lit's @change binding. */
export async function clickOption(page: Page, fieldLabel: string, optionId: string): Promise<void> {
	const marker = `__opt_${Math.random().toString(36).slice(2, 10)}`
	await page.evaluate(
		({ fieldLabel, optionId, marker }) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
			const walk = (root: ParentNode): HTMLInputElement | null => {
				for (const c of Array.from(root.children ?? [])) {
					if (c.tagName === 'LABEL' && (c.textContent ?? '').trim() === fieldLabel) {
						const group = (c.getRootNode() as ShadowRoot).host
						const inputs = Array.from((group as HTMLElement).shadowRoot?.querySelectorAll('input') ?? []) as HTMLInputElement[]
						const matchesKey = (id: string) => id === optionId || id.split('|')[1] === optionId
						const input = inputs.find((i) => matchesKey(i.id))
						if (input) {
							input.setAttribute('data-test-marker', marker)
							return input
						}
						return null
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
			const input = walk(icureForm!.shadowRoot!)
			if (!input) throw new Error(`Option "${optionId}" inside field "${fieldLabel}" not found`)
		},
		{ fieldLabel, optionId, marker },
	)
	// Playwright's pierce selector traverses open shadow roots; `>>` is supported.
	await page.locator(`input[data-test-marker="${marker}"]`).click({ force: true })
	await page.waitForTimeout(500)
}

/** Click the "Add subform" button (`<button class="subform__addBtn">`) in the
 * named subform group, then click the option whose label matches `subformLabel`
 * (e.g. "Consultation"). */
export async function addSubform(page: Page, subformLabel: string): Promise<void> {
	await page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const findAddBtn = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.classList?.contains('subform__addBtn')) return c as HTMLElement
				if (c instanceof HTMLElement && c.shadowRoot) {
					const f = findAddBtn(c.shadowRoot)
					if (f) return f
				}
				const f = findAddBtn(c)
				if (f) return f
			}
			return null
		}
		const btn = findAddBtn(icureForm!.shadowRoot!)
		if (!btn) throw new Error('No subform add button found')
		btn.click()
	})
	await page.waitForTimeout(300)
	await page.evaluate((subformLabel) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const findOption = (root: ParentNode): HTMLElement | null => {
			for (const c of Array.from(root.children ?? [])) {
				if (c.tagName === 'BUTTON' && c.classList?.contains('option') && (c.textContent ?? '').trim() === subformLabel) {
					return c as HTMLElement
				}
				if (c instanceof HTMLElement && c.shadowRoot) {
					const f = findOption(c.shadowRoot)
					if (f) return f
				}
				const f = findOption(c)
				if (f) return f
			}
			return null
		}
		const opt = findOption(icureForm!.shadowRoot!)
		if (!opt) throw new Error(`No subform option labelled "${subformLabel}"`)
		opt.click()
	}, subformLabel)
	await page.waitForTimeout(600)
}

/** Count rendered subform child instances inside the active form. Each added
 * subform lives in `<div class="subform__child">`. */
export async function countSubformInstances(page: Page): Promise<number> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		return icureForm?.shadowRoot?.querySelectorAll('.subform__child').length ?? 0
	})
}

/** Return the titles of the rendered subform children, in order. */
export async function listSubformTitles(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		return Array.from(icureForm?.shadowRoot?.querySelectorAll('.subform__child__title') ?? []).map((h) => (h.textContent ?? '').trim())
	})
}

/** Remove the Nth subform child (0-indexed). */
export async function removeSubform(page: Page, index = 0): Promise<void> {
	await page.evaluate((index) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
		const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement | null
		const btns = Array.from(icureForm?.shadowRoot?.querySelectorAll('.subform__removeBtn') ?? []) as HTMLElement[]
		if (!btns[index]) throw new Error(`No subform remove button at index ${index}`)
		btns[index].click()
	}, index)
	await page.waitForTimeout(500)
}

/** Set a field value via the BridgedFormValuesContainer (handy when the
 * widget — typically a date-picker — doesn't accept typed text). The label
 * is the field's `shortLabel` (or `field` when no shortLabel is set), matching
 * what the bridge uses internally as the value key. */
export async function setFieldValueViaBridge(
	page: Page,
	label: string,
	primitive: { type: 'string' | 'number' | 'boolean' | 'timestamp' | 'datetime' | 'measure'; value?: number | string | boolean; unit?: string },
	language = 'en',
): Promise<void> {
	await page.evaluate(
		({ label, primitive, language }) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement & {
				formValuesContainer?: { setValue: (label: string, lang: string, fv: { content: { [k: string]: unknown }; codes: [] }) => void }
			}
			if (!icureForm?.formValuesContainer) throw new Error('No formValuesContainer on active icure-form')
			icureForm.formValuesContainer.setValue(label, language, { content: { [language]: primitive }, codes: [] })
		},
		{ label, primitive, language },
	)
	await page.waitForTimeout(500)
}

/** Set a coded field (dropdown / radio / checkbox) via the bridge by passing
 * a single code id (e.g. "DEMO-PREGNANCY-STATUS|pregnant|1"). */
export async function setCodedFieldViaBridge(page: Page, label: string, codeId: string, language = 'en'): Promise<void> {
	await page.evaluate(
		({ label, codeId, language }) => {
			const demo = document.querySelector('demo-app')
			const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as HTMLElement | undefined
			const icureForm = visible?.shadowRoot?.querySelector('icure-form') as HTMLElement & { formValuesContainer?: { setValue: (label: string, lang: string, fv: unknown) => void } }
			if (!icureForm?.formValuesContainer) throw new Error('No formValuesContainer on active icure-form')
			icureForm.formValuesContainer.setValue(label, language, {
				content: { [language]: { type: 'compound', value: { [codeId]: { type: 'boolean', value: true } } } },
				codes: [{ id: codeId, label: {} }],
			})
		},
		{ label, codeId, language },
	)
	await page.waitForTimeout(500)
}

/** Re-export `expect` so each spec only imports from `./_helpers`. */
export { expect, activeIcureForm }
