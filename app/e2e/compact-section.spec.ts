import { test, expect, Page } from '@playwright/test'

// "Sous-formulaires/Vaccins consult" is 25 single-option checkboxes in one section flagged
// `compact`: the section grid carries the `compact` class, the checkboxes sit in equal
// columns, and the rows are packed at no more than half the normal row pitch.
const FORM = 'common_fr/vaccins-consult'
const NORMAL_ROW_PITCH = 56 // 40px checkbox row + 16px grid row gap, measured before compact existed
// Every theme has its own field spacing (kendo pads fields on top for its floating labels),
// so the packing is checked under each of them.
const THEMES = ['icure-blue', 'kendo', 'default'] as const

type Box = { top: number; left: number; width: number; height: number }

async function openVaccinsConsult(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
	await page.addInitScript((theme) => {
		try {
			localStorage.clear()
			localStorage.setItem('com.icure.demo.language', 'fr')
			localStorage.setItem('com.icure.demo.theme', theme)
		} catch {
			/* ignore */
		}
	}, theme)
	await page.goto(`/#${FORM}`, { waitUntil: 'domcontentloaded' })
	await page.waitForFunction(
		() => {
			const demo = document.querySelector('demo-app')
			const forms = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []) as HTMLElement[]
			const specialty = forms.find((df) => df.parentElement?.classList.contains('detail'))
			const icureForm = specialty?.shadowRoot?.querySelector('icure-form')
			return (icureForm?.shadowRoot?.querySelectorAll('icure-form-checkbox').length ?? 0) === 25
		},
		{ timeout: 20_000 },
	)
	await page.waitForTimeout(300)
}

function sectionGridAndCheckboxes(page: Page): Promise<{ gridClasses: string; boxes: Box[] }> {
	return page.evaluate(() => {
		const demo = document.querySelector('demo-app')
		const forms = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []) as HTMLElement[]
		const specialty = forms.find((df) => df.parentElement?.classList.contains('detail')) as HTMLElement
		const icureForm = specialty.shadowRoot?.querySelector('icure-form') as HTMLElement
		const grid = icureForm.shadowRoot?.querySelector('.icure-form') as HTMLElement
		const boxes = Array.from(icureForm.shadowRoot?.querySelectorAll('icure-form-checkbox') ?? []).map((el) => {
			const b = el.getBoundingClientRect()
			return { top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) }
		})
		return { gridClasses: grid.className, boxes }
	})
}

test.describe('Vaccins consult — compact section of checkboxes', () => {
	test('the section grid carries the compact class', async ({ page }) => {
		await openVaccinsConsult(page, 'icure-blue')
		const { gridClasses } = await sectionGridAndCheckboxes(page)
		expect(gridClasses.split(/\s+/)).toContain('compact')
	})

	test('the checkboxes sit in four equal columns', async ({ page }) => {
		await openVaccinsConsult(page, 'icure-blue')
		const { boxes } = await sectionGridAndCheckboxes(page)
		const lefts = [...new Set(boxes.map((b) => b.left))].sort((a, b) => a - b)
		expect(lefts, `column left edges: ${lefts.join(', ')}`).toHaveLength(4)
		const widths = [...new Set(boxes.map((b) => b.width))]
		expect(Math.max(...widths) - Math.min(...widths), `column widths: ${widths.join(', ')}`).toBeLessThanOrEqual(1)
	})

	for (const theme of THEMES) {
		test(`the rows are packed at no more than half the normal row pitch (${theme} theme)`, async ({ page }) => {
			await openVaccinsConsult(page, theme)
			const { boxes } = await sectionGridAndCheckboxes(page)
			const tops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b)
			expect(tops.length).toBeGreaterThan(1)
			const pitches = tops.slice(1).map((t, i) => t - tops[i])
			expect(Math.max(...pitches), `row pitches: ${pitches.join(', ')}`).toBeLessThanOrEqual(NORMAL_ROW_PITCH / 2)
		})
	}
})
