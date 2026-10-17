import { test, expect, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'fs'
import * as path from 'path'
import { gotoHarness, waitForFormRender } from './hide-empty-helpers'

// ============================================================
// schema-field: freehand drawing over a stencil, committed once per stroke through the form values container.
// ============================================================

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'schema-field.yaml'), 'utf8')

const FACE = 'Face schema'
const CERVIX = 'Cervix schema'

type InitOptions = { readonly?: boolean; prefill?: unknown[]; stencils?: boolean }

async function initFixture(page: Page, { readonly, prefill, stencils = true }: InitOptions = {}) {
	await gotoHarness(page)
	await page.evaluate(async ({ yaml, readonly, prefill, stencils }) => await (window as any).initForm({ yaml, language: 'en', readonly, prefill, stencilsFixture: stencils }), {
		yaml: fixture,
		readonly,
		prefill,
		stencils,
	})
	await waitForFormRender(page)
	await page.waitForFunction(
		() =>
			!!document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-form-schema-field')?.shadowRoot?.querySelector('icure-schema')?.shadowRoot?.querySelector('svg.icure-schema-surface'),
	)
	await page.waitForTimeout(300)
}

/** Services of a field label in the current container: one entry per value id, with the committed drawing. */
async function committed(page: Page, label: string) {
	return await page.evaluate((label: string) => {
		const fvc = (window as any).__currentFvc
		const values = fvc.getValues((_id: string, history: { revision: string | null; value?: { label?: string } }[]) => (history?.[0]?.value?.label === label ? [history[0].revision] : []))
		return Object.entries(values).map(([id, versions]: [string, any]) => {
			const pt = versions[0]?.value?.content?.en
			return {
				id,
				type: pt?.type,
				stencil: pt?.value?.stencil,
				width: pt?.value?.width,
				height: pt?.value?.height,
				strokes: (pt?.value?.strokes ?? []).map((s: any) => ({ tool: s.tool, color: s.color, width: s.width, pressure: !!s.pressure })),
			}
		})
	}, label)
}

/** Geometry of the n-th schema canvas, in viewport pixels. */
async function canvasBox(page: Page, index = 0) {
	return await page.evaluate((index: number) => {
		const wrapper = document.querySelector('icure-form')!.shadowRoot!.querySelectorAll('icure-form-schema-field')[index] as HTMLElement
		const svg = wrapper.shadowRoot!.querySelector('icure-schema')!.shadowRoot!.querySelector('svg.icure-schema-surface')!
		svg.scrollIntoView({ block: 'center' })
		const r = svg.getBoundingClientRect()
		return { x: r.left, y: r.top, width: r.width, height: r.height }
	}, index)
}

async function mouseStroke(page: Page, index: number, from: [number, number], to: [number, number]) {
	const box = await canvasBox(page, index)
	await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1])
	await page.mouse.down()
	for (let i = 1; i <= 10; i++) {
		await page.mouse.move(box.x + box.width * (from[0] + ((to[0] - from[0]) * i) / 10), box.y + box.height * (from[1] + ((to[1] - from[1]) * i) / 10))
	}
	await page.mouse.up()
}

type Pointer = { id: number; type: 'touch' | 'pen' | 'mouse'; path: [number, number][]; pressure?: number }

/** Dispatches synthetic Pointer Events on the n-th canvas. `steps` interleave pointers: each step moves every pointer. */
async function dispatchPointers(page: Page, index: number, pointers: Pointer[], options: { upOrder?: number[]; sequential?: boolean } = {}) {
	await canvasBox(page, index)
	await page.evaluate(
		({ index, pointers, upOrder, sequential }) => {
			const wrapper = document.querySelector('icure-form')!.shadowRoot!.querySelectorAll('icure-form-schema-field')[index] as HTMLElement
			const svg = wrapper.shadowRoot!.querySelector('icure-schema')!.shadowRoot!.querySelector('svg.icure-schema-surface')!
			const r = svg.getBoundingClientRect()
			const fire = (type: string, p: Pointer, [fx, fy]: [number, number]) =>
				svg.dispatchEvent(
					new PointerEvent(type, {
						pointerId: p.id,
						pointerType: p.type,
						isPrimary: true,
						clientX: r.left + r.width * fx,
						clientY: r.top + r.height * fy,
						pressure: p.pressure ?? (type === 'pointerup' ? 0 : 0.5),
						buttons: type === 'pointerup' ? 0 : 1,
						bubbles: true,
						composed: true,
						cancelable: true,
					}),
				)
			if (sequential) {
				// One stroke after the other, synchronously: the second lands before any re-render.
				pointers.forEach((p) => {
					fire('pointerdown', p, p.path[0])
					p.path.slice(1).forEach((point) => fire('pointermove', p, point))
					fire('pointerup', p, p.path[p.path.length - 1])
				})
				return
			}
			const steps = Math.max(...pointers.map((p) => p.path.length))
			pointers.forEach((p) => fire('pointerdown', p, p.path[0]))
			for (let i = 1; i < steps; i++) pointers.forEach((p) => p.path[i] && fire('pointermove', p, p.path[i]))
			;(upOrder ?? pointers.map((_, i) => i)).forEach((i) => fire('pointerup', pointers[i], pointers[i].path[pointers[i].path.length - 1]))
		},
		{ index, pointers, upOrder: options.upOrder, sequential: !!options.sequential },
	)
}

const line = (x0: number, y0: number, x1: number, y1: number, n = 8): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])

/** The n-th schema leaf's shadow root as a locator scope. */
const leaf = (page: Page, index = 0) => page.locator('icure-form-schema-field').nth(index).locator('icure-schema')

async function strokeCount(page: Page, index = 0) {
	return await leaf(page, index).locator('svg.icure-schema-surface path:not(.icure-schema-active)').count()
}

test.describe('schema-field', () => {
	test('a mouse stroke commits one drawing on the stencil', async ({ page }) => {
		await initFixture(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.6, 0.5])
		await expect
			.poll(() => committed(page, FACE))
			.toEqual([{ id: expect.any(String), type: 'schema', stencil: 'face', width: 300, height: 400, strokes: [{ tool: 'pen', color: '#1a1a1a', width: 2, pressure: false }] }])
		await expect.poll(() => strokeCount(page)).toBe(1)
	})

	test('two quick strokes on an empty field create a single value', async ({ page }) => {
		await initFixture(page)
		await dispatchPointers(
			page,
			0,
			[
				{ id: 1, type: 'mouse', path: line(0.1, 0.1, 0.4, 0.4) },
				{ id: 2, type: 'mouse', path: line(0.5, 0.5, 0.8, 0.8) },
			],
			{ sequential: true },
		)
		await expect.poll(async () => (await committed(page, FACE)).map((v) => v.strokes.length)).toEqual([2])
	})

	test('touch draws with one finger, never with two', async ({ page }) => {
		await initFixture(page)
		await dispatchPointers(page, 0, [{ id: 11, type: 'touch', path: line(0.2, 0.2, 0.7, 0.3) }])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
		await dispatchPointers(page, 0, [
			{ id: 12, type: 'touch', path: line(0.2, 0.6, 0.4, 0.8) },
			{ id: 13, type: 'touch', path: line(0.6, 0.6, 0.8, 0.8) },
		])
		await page.waitForTimeout(300)
		expect((await committed(page, FACE))[0]?.strokes.length).toBe(1)
	})

	test('a pen records pressure and a resting palm is ignored', async ({ page }) => {
		await initFixture(page)
		await dispatchPointers(page, 0, [
			{ id: 21, type: 'pen', path: line(0.3, 0.3, 0.6, 0.6), pressure: 0.7 },
			{ id: 22, type: 'touch', path: line(0.8, 0.8, 0.9, 0.9) },
		])
		await expect.poll(() => committed(page, FACE)).toEqual([expect.objectContaining({ strokes: [{ tool: 'pen', color: '#1a1a1a', width: 2, pressure: true }] })])
	})

	test('colour, width and highlighter apply to the next stroke', async ({ page }) => {
		await initFixture(page)
		const scope = leaf(page)
		await scope.getByRole('radio', { name: 'Highlighter' }).click()
		await scope.getByRole('radio', { name: 'red' }).click()
		await scope.getByRole('radio', { name: '6 px' }).click()
		await mouseStroke(page, 0, [0.2, 0.2], [0.5, 0.2])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes).toEqual([{ tool: 'highlighter', color: '#d32f2f', width: 24, pressure: false }])
	})

	test('the eraser removes the stroke under the pointer', async ({ page }) => {
		await initFixture(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.8, 0.2])
		await mouseStroke(page, 0, [0.2, 0.8], [0.8, 0.8])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(2)
		await leaf(page).getByRole('radio', { name: 'Eraser' }).click()
		await mouseStroke(page, 0, [0.5, 0.15], [0.5, 0.25])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
	})

	test('undo, redo and clear commit the drawing', async ({ page }) => {
		await initFixture(page)
		const scope = leaf(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.8, 0.2])
		await mouseStroke(page, 0, [0.2, 0.6], [0.8, 0.6])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(2)
		await scope.getByRole('button', { name: 'Undo' }).click()
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
		await scope.getByRole('button', { name: 'Redo' }).click()
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(2)
		// Keyboard shortcuts work from anywhere in the field.
		await scope.getByRole('button', { name: 'Redo' }).focus()
		await page.keyboard.press('Control+z')
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
		await page.keyboard.press('Control+Shift+z')
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(2)
		await scope.getByRole('button', { name: 'Clear' }).click()
		await expect(scope.getByText('Clear the whole drawing?')).toBeVisible()
		await expect(scope.getByRole('button', { name: 'Confirm' })).toBeFocused()
		await scope.getByRole('button', { name: 'Cancel' }).click()
		expect((await committed(page, FACE))[0]?.strokes.length).toBe(2)
		await scope.getByRole('button', { name: 'Clear' }).click()
		await scope.getByRole('button', { name: 'Confirm' }).click()
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(0)
		await expect.poll(() => strokeCount(page)).toBe(0)
	})

	test('switching stencil on a drawing asks first and starts over', async ({ page }) => {
		await initFixture(page)
		const scope = leaf(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.8, 0.2])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
		await scope.getByRole('radio', { name: 'Body' }).click()
		await expect(scope.getByText('Changing the background clears the drawing. Continue?')).toBeVisible()
		await scope.getByRole('button', { name: 'Confirm' }).click()
		await expect.poll(async () => (await committed(page, FACE))[0]).toEqual(expect.objectContaining({ stencil: 'body-male', width: 200, height: 500, strokes: [] }))
	})

	test('the toolbar is one tab stop navigated with the arrow keys', async ({ page }) => {
		await initFixture(page)
		const scope = leaf(page)
		const toolbar = scope.getByRole('toolbar', { name: 'Drawing tools' })
		await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1)
		await scope.getByRole('radio', { name: 'Pen' }).focus()
		await page.keyboard.press('ArrowRight')
		await expect(scope.getByRole('radio', { name: 'Highlighter' })).toBeFocused()
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await expect(scope.getByRole('radio', { name: 'black' })).toBeFocused()
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Space')
		await expect(scope.getByRole('radio', { name: 'red' })).toHaveAttribute('aria-checked', 'true')
		await page.keyboard.press('End')
		await expect(scope.getByRole('radio', { name: 'Body' })).toBeFocused()
		await page.keyboard.press('Home')
		await expect(scope.getByRole('radio', { name: 'Pen' })).toBeFocused()
		await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1)
	})

	test('the canvas is an image named by the label and described by a summary', async ({ page }) => {
		await initFixture(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.8, 0.2])
		const img = leaf(page).getByRole('img', { name: 'Face', exact: true })
		await expect(img).toHaveCount(1)
		await expect(img).toHaveAccessibleDescription(/Face: 1 stroke, black/)
	})

	test('read-only shows the drawing without a toolbar', async ({ page }) => {
		await initFixture(page, {
			readonly: true,
			prefill: [
				{
					label: FACE,
					primitive: {
						type: 'schema',
						value: { format: 'icure-schema', v: 1, stencil: 'face', width: 300, height: 400, strokes: [{ tool: 'pen', color: '#d32f2f', width: 4, points: 'ZABkAAoACgA=' }] },
					},
				},
			],
		})
		await expect(leaf(page).getByRole('toolbar')).toHaveCount(0)
		await expect.poll(() => strokeCount(page)).toBe(1)
		await expect(leaf(page).locator('img.icure-schema-stencil')).toHaveCount(1)
		const box = await canvasBox(page, 0)
		await page.mouse.move(box.x + 10, box.y + 10)
		await page.mouse.down()
		await page.mouse.move(box.x + 100, box.y + 100)
		await page.mouse.up()
		await page.waitForTimeout(300)
		expect((await committed(page, FACE))[0]?.strokes.length).toBe(1)
	})

	test('an unresolved stencil falls back to a blank canvas', async ({ page }) => {
		await initFixture(page)
		await expect(leaf(page, 1).getByText('Background image unavailable')).toBeVisible()
		await expect(leaf(page, 1).locator('img.icure-schema-stencil')).toHaveCount(0)
		await mouseStroke(page, 1, [0.2, 0.2], [0.6, 0.6])
		await expect.poll(() => committed(page, CERVIX)).toEqual([expect.objectContaining({ stencil: null, width: 800, height: 600, strokes: [expect.objectContaining({ tool: 'pen' })] })])
	})

	test('without a stencil provider every field still draws', async ({ page }) => {
		await initFixture(page, { stencils: false })
		await expect(leaf(page, 0).getByText('Background image unavailable')).toBeVisible()
		await mouseStroke(page, 0, [0.2, 0.2], [0.6, 0.6])
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
	})

	test('the card renderer draws on a card and shows a thumbnail on review', async ({ page }) => {
		await gotoHarness(page)
		await page.evaluate(async (yaml: string) => await (window as any).initForm({ yaml, language: 'en', renderer: 'card', stencilsFixture: true }), fixture)
		const card = page.locator('icure-card-internal')
		await card.locator('.card__start').click()
		await page.waitForFunction(() => !!document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal')?.shadowRoot?.querySelector('icure-form-schema-field'))
		await page.waitForTimeout(300)
		const svg = card.locator('icure-form-schema-field icure-schema svg.icure-schema-surface')
		const box = (await svg.boundingBox())!
		await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
		await page.mouse.down()
		for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * 0.3)
		await page.mouse.up()
		await expect.poll(async () => (await committed(page, FACE))[0]?.strokes.length).toBe(1)
		await card.locator('.card__continue').click()
		await card.locator('.card__continue').click()
		const row = card.locator('.card__review-row[data-field-label="Face schema"]')
		await expect(row.locator('.card__review-value')).toHaveText(/Drawing \(1 stroke\)/)
		await expect(row.locator('icure-form-schema-field.card__review-thumbnail')).toHaveAttribute('aria-hidden', 'true')
		await expect.poll(() => row.locator('icure-form-schema-field icure-schema svg.icure-schema-surface path:not(.icure-schema-active)').count()).toBe(1)
		await expect(row.locator('icure-form-schema-field icure-schema [role="toolbar"]')).toHaveCount(0)
		await expect(row.getByRole('button', { name: /Edit/ })).toHaveCount(1)
		await expect(card.locator('.card__review-row[data-field-label="Cervix schema"] .card__review-empty')).toHaveCount(1)
		// Only the schema field's own nodes: the review chrome around it (#888 section titles and labels) has
		// colour-contrast issues of its own, independent of this field.
		await page.waitForTimeout(600)
		const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['html-has-lang']).analyze()).violations
			.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')).filter((t) => t.includes('icure-form-schema-field') || t.includes('icure-schema')) }))
			.filter((v) => v.nodes.length)
		expect(violations).toEqual([])
	})

	test('axe finds no wcag2a / wcag2aa violation, editable or read-only', async ({ page }) => {
		await initFixture(page)
		await mouseStroke(page, 0, [0.2, 0.2], [0.8, 0.2])
		await expect.poll(() => strokeCount(page)).toBe(1)
		const axe = async () =>
			(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['html-has-lang']).analyze()).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))
		expect(await axe()).toEqual([])
		await leaf(page).getByRole('button', { name: 'Clear' }).click()
		expect(await axe()).toEqual([])
		await initFixture(page, { readonly: true })
		expect(await axe()).toEqual([])
	})
})
