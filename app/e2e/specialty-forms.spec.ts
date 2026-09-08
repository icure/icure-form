import { test, expect, Page } from '@playwright/test'
import { readdirSync, statSync } from 'fs'
import { resolve } from 'path'

// app/samples/curated is a git submodule whose committed index.json is only a snapshot:
// forms get deleted from and added to it without the index being rebuilt. The demo app
// must follow what's really on disk, not the index.
const CURATED = resolve(__dirname, '../samples/curated')
const LANGUAGE = 'fr'

function specialtiesOnDisk(): Record<string, number> {
	const result: Record<string, number> = {}
	for (const dir of readdirSync(CURATED)) {
		if (!statSync(resolve(CURATED, dir)).isDirectory()) continue
		if (dir !== `common_${LANGUAGE}` && !dir.endsWith(`-${LANGUAGE}`)) continue
		const forms = readdirSync(resolve(CURATED, dir)).filter((f) => f.endsWith('.json')).length
		if (forms > 0) result[dir] = forms
	}
	return result
}

async function load(page: Page, hash: string) {
	await page.addInitScript((language) => {
		try {
			localStorage.clear()
			localStorage.setItem('com.icure.demo.language', language)
		} catch {
			/* ignore */
		}
	}, LANGUAGE)
	await page.goto(`/#${hash}`, { waitUntil: 'domcontentloaded' })
	await page.waitForFunction(() => !!document.querySelector('demo-app')?.shadowRoot?.querySelector('.specialty-list'))
}

// Wait for the selected specialty form's <icure-form> to have rendered something.
async function waitForSpecialtyFormRendered(page: Page) {
	await page.waitForFunction(
		() => {
			const demo = document.querySelector('demo-app')
			const forms = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []) as HTMLElement[]
			// Specialty forms are rendered last, after the (hidden) YAML samples.
			const specialty = forms.find((df) => df.parentElement?.classList.contains('detail'))
			const icureForm = specialty?.shadowRoot?.querySelector('icure-form')
			return !!icureForm?.shadowRoot?.querySelector('.icure-form, .tab-container, p')
		},
		{ timeout: 20_000 },
	)
}

test.describe('demo-app — specialty forms follow the files on disk', () => {
	test('the sidebar lists exactly the specialty directories and form counts present on disk', async ({ page }) => {
		await load(page, '01-components-gallery')
		const listed = await page.evaluate(() => {
			const demo = document.querySelector('demo-app')
			return Array.from(demo?.shadowRoot?.querySelectorAll('.specialty-list > li.specialty > .specialty-header') ?? []).map((header) => ({
				label: header.querySelector('span:not(.chevron):not(.count)')?.textContent?.trim(),
				count: Number(header.querySelector('.count')?.textContent),
			}))
		})
		const onDisk = specialtiesOnDisk()
		expect(listed.length, `specialties listed: ${listed.map((l) => l.label).join(', ')}`).toBe(Object.keys(onDisk).length)
		expect(listed.reduce((sum, l) => sum + l.count, 0)).toBe(Object.values(onDisk).reduce((sum, n) => sum + n, 0))
	})

	test('a deep link to an existing specialty form renders it', async ({ page }) => {
		const errors: string[] = []
		page.on('pageerror', (e) => errors.push(e.message))
		const [specialty, forms] = Object.entries(specialtiesOnDisk())[0]
		const file = readdirSync(resolve(CURATED, specialty))
			.filter((f) => f.endsWith('.json'))
			.sort()[0]
			.replace(/\.json$/, '')
		expect(forms).toBeGreaterThan(0)
		await load(page, `${specialty}/${file}`)
		await waitForSpecialtyFormRendered(page)
		expect(errors).toEqual([])
	})

	test('a deep link to a form that no longer exists falls back to the first sample without errors', async ({ page }) => {
		const errors: string[] = []
		page.on('pageerror', (e) => errors.push(e.message))
		await load(page, 'algology-fr/protocol')
		await page.waitForFunction(() => {
			const demo = document.querySelector('demo-app')
			return demo?.shadowRoot?.querySelector('.master ul li.selected .title')?.textContent?.includes('Components gallery')
		})
		await page.waitForTimeout(500)
		expect(await page.evaluate(() => document.querySelector('demo-app')?.shadowRoot?.querySelector('.loading')?.textContent ?? null)).toBeNull()
		expect(errors).toEqual([])
	})
})
