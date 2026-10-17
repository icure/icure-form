import { test, Page } from '@playwright/test'
import { expect, openSample } from './_helpers'

// The n-th schema leaf of the visible sample, reached through demo-app → decorated-form → icure-form →
// icure-form-schema-field → icure-schema.
const schemaLeaf = (index: number) => `(() => {
	const demo = document.querySelector('demo-app')
	const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => df.parentElement?.style.display !== 'none')
	const wrapper = visible?.shadowRoot?.querySelector('icure-form')?.shadowRoot?.querySelectorAll('icure-form-schema-field')[${index}]
	return wrapper?.shadowRoot?.querySelector('icure-schema')?.shadowRoot ?? null
})()`

async function snapshot(page: Page, index: number) {
	return page.evaluate((expr) => {
		const root = eval(expr) as ShadowRoot | null
		const svg = root?.querySelector('svg.icure-schema-surface')
		const r = svg?.getBoundingClientRect()
		return {
			mounted: !!svg,
			image: !!root?.querySelector('img.icure-schema-stencil'),
			notice: root?.querySelector('.icure-schema-notice')?.textContent?.trim() ?? null,
			strokes: svg?.querySelectorAll('path:not(.icure-schema-active)').length ?? 0,
			box: r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null,
		}
	}, schemaLeaf(index))
}

async function strokesSaved(page: Page, label: string): Promise<number> {
	return page.evaluate((label) => {
		const demo = document.querySelector('demo-app')
		const visible = Array.from(demo?.shadowRoot?.querySelectorAll('decorated-form') ?? []).find((df) => (df.parentElement as HTMLElement | null)?.style.display !== 'none') as any
		const values = visible?.formValuesContainer?.getValues((_id: string, history: any[]) => (history?.[0]?.value?.label === label ? [history[0].revision] : [])) ?? {}
		const versions = Object.values(values)[0] as any[] | undefined
		return versions?.[0]?.value?.content?.en?.value?.strokes?.length ?? versions?.[0]?.value?.content?.fr?.value?.strokes?.length ?? 0
	}, label)
}

test.describe('Sample 14 — Schema fields', () => {
	test('renders the face and body stencils, and falls back to a blank canvas for an unknown one', async ({ page }) => {
		await openSample(page, '14-schema-field')
		await expect.poll(async () => (await snapshot(page, 0)).image).toBe(true)
		await expect.poll(async () => (await snapshot(page, 1)).image).toBe(true)
		const cervix = await snapshot(page, 2)
		expect(cervix.mounted).toBe(true)
		expect(cervix.image).toBe(false)
		expect(cervix.notice).toBe('Background image unavailable')
	})

	test('a stroke on the face is drawn and saved in the record', async ({ page }) => {
		await openSample(page, '14-schema-field')
		await expect.poll(async () => (await snapshot(page, 0)).image).toBe(true)
		const { box } = await snapshot(page, 0)
		if (!box) throw new Error('face canvas not found')
		await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
		await page.mouse.down()
		for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.03), box.y + box.height * 0.4)
		await page.mouse.up()
		await expect.poll(async () => (await snapshot(page, 0)).strokes).toBe(1)
		await expect.poll(() => strokesSaved(page, 'Schéma visage')).toBe(1)
	})
})
