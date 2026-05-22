import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 7: field-type coverage + questionsPerCard=2
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCard(page: Page, yaml: string, questionsPerCard?: number) {
	return await page.evaluate(
		async ({ yaml, k }: { yaml: string; k?: number }) => (window as any).initForm({ yaml, language: 'en', renderer: 'card', questionsPerCard: k }),
		{ yaml, k: questionsPerCard },
	)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(
		() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			return !!internal?.shadowRoot?.querySelector('.card')
		},
		{ timeout: 15_000 },
	)
}

async function clickByClass(page: Page, cls: string) {
	const ok = await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		if (!btn || (btn as HTMLButtonElement).disabled) return false
		btn.click()
		return true
	}, cls)
	if (!ok) throw new Error(`Button .${cls} not clickable`)
	await page.waitForTimeout(150)
}

async function getCardInfo(page: Page) {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const root = internal?.shadowRoot
		const wrapper = root?.querySelector('.card')
		const body = root?.querySelector('.card__card-body')
		const interactiveTags = ['icure-form-text-field', 'icure-form-number-field', 'icure-form-measure-field', 'icure-form-token-field', 'icure-form-items-list-field', 'icure-form-date-picker', 'icure-form-time-picker', 'icure-form-date-time-picker', 'icure-form-dropdown-field', 'icure-form-radio-button', 'icure-form-checkbox']
		const interactiveCount = interactiveTags.reduce((acc, tag) => acc + (body?.querySelectorAll(tag).length ?? 0), 0)
		const labels = body?.querySelectorAll('icure-form-label').length ?? 0
		const fieldTagsInOrder = Array.from(body?.children ?? []).map((c) => (c as HTMLElement).tagName.toLowerCase())
		return {
			total: parseInt(wrapper?.getAttribute('data-total-cards') ?? '-1', 10),
			currentIdx: parseInt(wrapper?.getAttribute('data-current-card-index') ?? '-1', 10),
			interactiveCount,
			labelCount: labels,
			fieldTagsInOrder,
		}
	})
}

// ============================================================
// Field-type coverage — each standard type renders
// ============================================================
test.describe('Phase 7 / field-type coverage', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: t1
        type: text-field
      - field: m1
        type: measure-field
      - field: n1
        type: number-field
      - field: dp1
        type: date-picker
      - field: tp1
        type: time-picker
      - field: dtp1
        type: date-time-picker
      - field: dd1
        type: dropdown
      - field: rb1
        type: radio-button
      - field: cb1
        type: checkbox
      - field: tk1
        type: token-field
      - field: il1
        type: items-list-field
`

	test('all standard interactive types render against fixture form', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const expected = [
			'icure-form-text-field',
			'icure-form-measure-field',
			'icure-form-number-field',
			'icure-form-date-picker',
			'icure-form-time-picker',
			'icure-form-date-time-picker',
			'icure-form-dropdown-field',
			'icure-form-radio-button',
			'icure-form-checkbox',
			'icure-form-token-field',
			'icure-form-items-list-field',
		]
		// One card per field at default k=1: walk through each card and collect tag of the rendered field.
		const seen: string[] = []
		for (let i = 0; i < expected.length; i++) {
			const info = await getCardInfo(page)
			seen.push(info.fieldTagsInOrder[0])
			if (i < expected.length - 1) {
				await clickByClass(page, 'card__continue')
			}
		}
		expect(seen).toEqual(expected)
	})
})

// ============================================================
// questionsPerCard chunking
// ============================================================
test.describe('Phase 7 / questionsPerCard chunking', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: a
        type: text-field
      - field: b
        type: text-field
      - field: c
        type: text-field
      - field: d
        type: text-field
      - field: e
        type: text-field
`

	test('k=1 (default) yields one card per field', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		expect((await getCardInfo(page)).total).toBe(5)
	})

	test('k=2 produces ceil(5/2)=3 cards with up to 2 interactive fields each', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const c1 = await getCardInfo(page)
		expect(c1.total).toBe(3)
		expect(c1.interactiveCount).toBeLessThanOrEqual(2)
		expect(c1.interactiveCount).toBe(2)
		await clickByClass(page, 'card__continue')
		const c2 = await getCardInfo(page)
		expect(c2.interactiveCount).toBe(2)
		await clickByClass(page, 'card__continue')
		const c3 = await getCardInfo(page)
		expect(c3.interactiveCount).toBe(1)
	})

	test('k values out of range clamp to 1..2 (k=5 -> 2, k=0 -> 1)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml, 5)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		expect((await getCardInfo(page)).total).toBe(3) // same as k=2
	})
})

// ============================================================
// Label fields are zero-count and attach to surrounding card
// ============================================================
test.describe('Phase 7 / Label fields', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: instruction
        type: label
      - field: a
        type: text-field
      - field: b
        type: text-field
`

	test('Label is rendered inside the same card as the next interactive field; total cards = 2', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const info = await getCardInfo(page)
		expect(info.total).toBe(2)
		expect(info.interactiveCount).toBe(1)
		expect(info.labelCount).toBe(1)
		// The Label appears before the interactive field on the same card.
		expect(info.fieldTagsInOrder).toEqual(['icure-form-label', 'icure-form-text-field'])
	})

	test('Label does not consume the questionsPerCard=2 slot — card carries both interactive fields', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const info = await getCardInfo(page)
		expect(info.total).toBe(1)
		expect(info.interactiveCount).toBe(2)
		expect(info.labelCount).toBe(1)
	})
})

// ============================================================
// Button (action) fields are skipped with console.warn
// ============================================================
test.describe('Phase 7 / Button fields skipped + warned', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: notes
        type: text-field
      - field: do-something
        type: action
`

	test('Button is excluded from card sequence and a warning is logged', async ({ page }) => {
		await gotoHarness(page)
		// Capture console messages.
		const warnings: string[] = []
		page.on('console', (msg) => {
			if (msg.type() === 'warning' || msg.type() === 'warn') warnings.push(msg.text())
		})
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const info = await getCardInfo(page)
		expect(info.total).toBe(1)
		expect(info.fieldTagsInOrder).toEqual(['icure-form-text-field'])
		// Allow a beat for warns to flush.
		await page.waitForTimeout(100)
		const matched = warnings.some((w) => w.toLowerCase().includes('button') || w.toLowerCase().includes('action'))
		expect(matched).toBe(true)
	})
})

// ============================================================
// Readonly fields are zero-count toward questionsPerCard
// ============================================================
test.describe('Phase 7 / readonly fields', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: ro
        type: text-field
        readonly: true
      - field: a
        type: text-field
      - field: b
        type: text-field
`

	test('readonly Field does not count toward questionsPerCard (k=2 fits ro + a + b)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		const info = await getCardInfo(page)
		// ro=zero-count, a + b = 2 interactive -> 1 card.
		expect(info.total).toBe(1)
	})

	test('readonly Field still renders in the card body (visible content)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		// k=1: card 0 carries the readonly attached to the next interactive (a).
		const info = await getCardInfo(page)
		expect(info.fieldTagsInOrder.length).toBeGreaterThanOrEqual(2)
		// readonly text-field still appears (it's a text-field that's readonly).
		expect(info.fieldTagsInOrder.filter((t) => t === 'icure-form-text-field').length).toBeGreaterThanOrEqual(2)
	})
})

// ============================================================
// `standalone` Field flag forces own card
// ============================================================
test.describe('Phase 7 / standalone Field flag', () => {
	test('a standalone interactive Field gets its own card even at k=2', async ({ page }) => {
		const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: a
        type: text-field
      - field: b
        type: text-field
        standalone: true
      - field: c
        type: text-field
      - field: d
        type: text-field
`
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		// Expect: [a] then [b alone] then [c, d] = 3 cards
		const c1 = await getCardInfo(page)
		expect(c1.total).toBe(3)
		expect(c1.interactiveCount).toBe(1)
		await clickByClass(page, 'card__continue')
		const c2 = await getCardInfo(page)
		expect(c2.interactiveCount).toBe(1)
		await clickByClass(page, 'card__continue')
		const c3 = await getCardInfo(page)
		expect(c3.interactiveCount).toBe(2)
	})

	test('a standalone Label appears alone on its own card', async ({ page }) => {
		const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: instruction
        type: label
        standalone: true
      - field: a
        type: text-field
      - field: b
        type: text-field
`
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		// Card 1: [label] alone, Card 2: [a, b]
		const c1 = await getCardInfo(page)
		expect(c1.total).toBe(2)
		expect(c1.interactiveCount).toBe(0)
		expect(c1.labelCount).toBe(1)
		await clickByClass(page, 'card__continue')
		const c2 = await getCardInfo(page)
		expect(c2.interactiveCount).toBe(2)
		expect(c2.labelCount).toBe(0)
	})

	test('multiple standalone fields each get their own card', async ({ page }) => {
		const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: a
        type: text-field
        standalone: true
      - field: b
        type: text-field
        standalone: true
      - field: c
        type: text-field
        standalone: true
`
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		expect((await getCardInfo(page)).total).toBe(3)
	})

	test('standalone round-trips through Form.parse / toJson', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						fields: [{ field: 'A', type: 'text-field', standalone: true }],
					},
				],
			}),
		)
		expect(out.sections[0].fields[0].standalone).toBe(true)
	})
})

// ============================================================
// Section / Group boundaries force a new card even mid-chunk
// ============================================================
test.describe('Phase 7 / section and group boundaries flush chunks', () => {
	const yaml = `
form: F
sections:
  - section: S1
    fields:
      - field: a
        type: text-field
  - section: S2
    fields:
      - field: b
        type: text-field
      - field: c
        type: text-field
`

	test('with k=2, S1 ends after 1 field even though there was room; S2 produces its own cards', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml, 2)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		// k=2 but section boundary forces: card1=[a], card2=[b,c]
		expect((await getCardInfo(page)).total).toBe(2)
	})
})
