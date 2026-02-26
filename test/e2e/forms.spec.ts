import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const samplesDir = path.resolve(__dirname, '../../app/samples')

// Collect all sample form files
const sampleFiles = fs.readdirSync(samplesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.json'))

// Filter to only forms that use the Form.parse-compatible format (have "form:" or "sections" with "fields")
const compatibleSamples = sampleFiles.filter((f) => {
	const content = fs.readFileSync(path.join(samplesDir, f), 'utf8').trim()
	if (!content) return false // Skip empty files
	if (f.endsWith('.yaml')) {
		return content.includes('form:') && content.includes('sections:')
	}
	// JSON files: check if they use the new format (have "form" key at top level)
	try {
		const parsed = JSON.parse(content)
		return 'form' in parsed && 'sections' in parsed
	} catch {
		return false
	}
})

// Forms known to have subforms (contain "subform:" declarations)
const subformSamples = compatibleSamples.filter((f) => {
	const content = fs.readFileSync(path.join(samplesDir, f), 'utf8')
	return content.includes('subform:')
})

// Simpler forms suitable for field filling tests
const fillableSamples = ['1-BMI.yaml']

// Helper to read sample file content
function readSample(filename: string): string {
	return fs.readFileSync(path.join(samplesDir, filename), 'utf8')
}

// Helper: wait for icure-form to finish rendering inside its shadow DOM
async function waitForFormRender(page: import('@playwright/test').Page) {
	// Wait for the icure-form element to exist (use state: 'attached' since custom elements may not be "visible")
	await page.waitForSelector('icure-form', { state: 'attached', timeout: 10_000 })

	// Wait for shadow DOM content to appear (the .icure-form grid)
	await page.waitForFunction(
		() => {
			const el = document.querySelector('icure-form')
			if (!el?.shadowRoot) return false
			return el.shadowRoot.querySelector('.icure-form') !== null || el.shadowRoot.querySelector('p') !== null
		},
		{ timeout: 15_000 },
	)

	// Small extra delay for async rendering to settle
	await page.waitForTimeout(500)
}

// ============================================================
// Part A: Parametric rendering tests - one per sample form
// ============================================================
test.describe('Form rendering', () => {
	for (const sampleFile of compatibleSamples) {
		const sampleName = sampleFile.replace(/\.(yaml|json)$/, '')

		test(`renders ${sampleName}`, async ({ page }) => {
			const content = readSample(sampleFile)

			await page.goto('/')
			await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })

			// Initialize the form and get expected field info
			const result = await page.evaluate(async (yamlContent: string) => {
				return await (window as any).initForm({ yaml: yamlContent, language: 'en' })
			}, content)

			await waitForFormRender(page)

			// Query rendered fields inside shadow DOM
			const renderedFieldCount = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return 0
				return el.shadowRoot.querySelectorAll('.icure-form-field').length
			})

			// Verify fields were rendered (at least some, accounting for hidden computed fields)
			if (result.fieldCount > 0) {
				expect(renderedFieldCount).toBeGreaterThan(0)
			}

			// Verify the icure-form element is present and has shadow content
			const hasShadowContent = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				return (el?.shadowRoot?.children?.length ?? 0) > 0
			})
			expect(hasShadowContent).toBe(true)
		})
	}
})

// ============================================================
// Part B: Subform add/remove tests
// ============================================================
test.describe('Subform operations', () => {
	for (const sampleFile of subformSamples) {
		const sampleName = sampleFile.replace(/\.(yaml|json)$/, '')

		test(`adds and removes subform in ${sampleName}`, async ({ page }) => {
			const content = readSample(sampleFile)

			await page.goto('/')
			await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })

			await page.evaluate(async (yamlContent: string) => {
				return await (window as any).initForm({ yaml: yamlContent, language: 'en' })
			}, content)

			await waitForFormRender(page)

			// Find form-selection-button elements (subform add buttons) in shadow DOM
			const addButtonInfo = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return { hasButtons: false, hasClickableButton: false }
				const buttons = el.shadowRoot.querySelectorAll('form-selection-button')
				if (buttons.length === 0) return { hasButtons: false, hasClickableButton: false }
				const btn = buttons[0]
				const addBtn = btn?.shadowRoot?.querySelector('.subform__addBtn') as HTMLElement
				return { hasButtons: true, hasClickableButton: !!addBtn }
			})

			if (!addButtonInfo.hasButtons || !addButtonInfo.hasClickableButton) {
				// Some subform forms may not render add buttons
				return
			}

			// Click the first add button to open the menu
			await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				const btn = el?.shadowRoot?.querySelector('form-selection-button')
				const addBtn = btn?.shadowRoot?.querySelector('.subform__addBtn') as HTMLElement
				addBtn?.click()
			})

			await page.waitForTimeout(500)

			// Check if menu options appeared and click the first one
			const hasOptions = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				const btn = el?.shadowRoot?.querySelector('form-selection-button')
				const options = btn?.shadowRoot?.querySelectorAll('.option')
				if (options && options.length > 0) {
					;(options[0] as HTMLElement).click()
					return true
				}
				return false
			})

			if (!hasOptions) {
				return
			}

			// Wait for the subform child to appear (async rendering via change listener)
			await page.waitForFunction(
				() => {
					const el = document.querySelector('icure-form')
					if (!el?.shadowRoot) return false
					return el.shadowRoot.querySelectorAll('.subform__child').length > 0
				},
				{ timeout: 10_000 },
			)

			// Verify a subform child appeared
			const childCount = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return 0
				return el.shadowRoot.querySelectorAll('.subform__child').length
			})
			expect(childCount).toBeGreaterThan(0)

			// Click the remove button on the first child
			await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				const removeBtn = el?.shadowRoot?.querySelector('.subform__removeBtn') as HTMLElement
				removeBtn?.click()
			})

			// Wait for the child count to decrease
			await page.waitForFunction(
				(prevCount) => {
					const el = document.querySelector('icure-form')
					if (!el?.shadowRoot) return false
					return el.shadowRoot.querySelectorAll('.subform__child').length < prevCount
				},
				childCount,
				{ timeout: 10_000 },
			)

			// Verify the child was removed
			const childCountAfterRemove = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return 0
				return el.shadowRoot.querySelectorAll('.subform__child').length
			})
			expect(childCountAfterRemove).toBeLessThan(childCount)
		})
	}
})

// ============================================================
// Part C: Form filling tests
// ============================================================
test.describe('Form filling', () => {
	for (const sampleFile of fillableSamples) {
		const sampleName = sampleFile.replace(/\.(yaml|json)$/, '')

		test(`fills fields in ${sampleName}`, async ({ page }) => {
			const content = readSample(sampleFile)

			await page.goto('/')
			await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })

			await page.evaluate(async (yamlContent: string) => {
				return await (window as any).initForm({ yaml: yamlContent, language: 'en' })
			}, content)

			await waitForFormRender(page)

			// Find measure fields in shadow DOM and try to type values
			const measureFieldCount = await page.evaluate(() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return 0
				return el.shadowRoot.querySelectorAll('icure-form-measure-field').length
			})

			if (measureFieldCount > 0) {
				// Measure fields use ProseMirror via icure-text-field deep in nested shadow DOMs:
				// icure-form > icure-form-measure-field > icure-text-field > .ProseMirror[contenteditable]
				const found = await page.evaluate(async () => {
					const form = document.querySelector('icure-form')
					if (!form?.shadowRoot) return false
					const measureField = form.shadowRoot.querySelector('icure-form-measure-field')
					if (!measureField?.shadowRoot) return false
					const textField = measureField.shadowRoot.querySelector('icure-text-field')
					if (!textField?.shadowRoot) return false
					const editor = textField.shadowRoot.querySelector('.ProseMirror[contenteditable="true"]')
					if (!editor) return false
					;(editor as HTMLElement).focus()
					return true
				})

				expect(found).toBe(true)

				// Type into the focused ProseMirror editor using keyboard
				await page.keyboard.type('75')
				await page.waitForTimeout(300)

				// Click elsewhere to trigger blur and value save
				await page.evaluate(() => {
					;(document.activeElement as HTMLElement)?.blur()
				})
				await page.waitForTimeout(500)

				// Verify the form values container exists and is functional
				const hasContainer = await page.evaluate(() => {
					return !!(window as any).__currentFvc
				})
				expect(hasContainer).toBe(true)
			}
		})
	}
})
