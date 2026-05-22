import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 4: conditional re-evaluation with stay semantics
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCard(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'card' }), yaml)
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

async function setStringValue(page: Page, label: string, value: string, language = 'en') {
	await page.evaluate(
		({ label, value, language }: { label: string; value: string; language: string }) => {
			const fvc = (window as any).__currentFvc
			fvc.setValue(label, language, { content: { [language]: { type: 'string', value } } })
		},
		{ label, value, language },
	)
	await page.waitForTimeout(300)
}

async function getCards(page: Page): Promise<{ total: number; currentIdx: number; sectionTitle: string | null }> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const root = internal?.shadowRoot?.querySelector('.card')
		const card = internal?.shadowRoot?.querySelector('.card__card')
		return {
			total: parseInt(root?.getAttribute('data-total-cards') ?? '-1', 10),
			currentIdx: parseInt(root?.getAttribute('data-current-card-index') ?? '-1', 10),
			sectionTitle: card?.getAttribute('data-card-section') ?? null,
		}
	})
}

async function getProgressText(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		return internal?.shadowRoot?.querySelector('.card__progress-text')?.textContent?.trim() ?? null
	})
}

// ============================================================
// Field-level computed hidden
// ============================================================
test.describe('Phase 4 / Field-level computed hidden', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Trigger
        type: text-field
      - field: Conditional
        type: text-field
        computedProperties:
          hidden: |
            return text(self['Trigger']) !== 'show'
`

	test('initially conditional is hidden — only Trigger card visible', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		const s = await getCards(page)
		expect(s.total).toBe(1)
	})

	test('setting Trigger = show reveals Conditional, total cards becomes 2', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		expect((await getCards(page)).total).toBe(1)
		await setStringValue(page, 'Trigger', 'show')
		await page.waitForTimeout(400)
		const s = await getCards(page)
		expect(s.total).toBe(2)
	})

	test('changing Trigger value back hides Conditional again', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await setStringValue(page, 'Trigger', 'show')
		await page.waitForTimeout(400)
		expect((await getCards(page)).total).toBe(2)
		await setStringValue(page, 'Trigger', 'hide')
		await page.waitForTimeout(400)
		expect((await getCards(page)).total).toBe(1)
	})

	test('progress fraction recomputes after re-flatten', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		expect(await getProgressText(page)).toBe('1 / 1')
		await setStringValue(page, 'Trigger', 'show')
		await page.waitForTimeout(400)
		expect(await getProgressText(page)).toBe('1 / 2')
	})
})

// ============================================================
// Group-level computed hidden cascades to children
// ============================================================
test.describe('Phase 4 / Group-level computed hidden cascades', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Trigger
        type: text-field
      - group: Conditional Group
        computedProperties:
          hidden: |
            return text(self['Trigger']) !== 'show'
        fields:
          - field: G1
            type: text-field
          - field: G2
            type: text-field
`

	test('Group-level hidden cascades to its fields (Trigger only initially)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		expect((await getCards(page)).total).toBe(1)
	})

	test('Group becomes visible when Trigger = show — both fields appear (total 3)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await setStringValue(page, 'Trigger', 'show')
		await page.waitForTimeout(400)
		expect((await getCards(page)).total).toBe(3)
	})
})

// ============================================================
// Stay semantics: downstream values preserved across visibility flips
// ============================================================
test.describe('Phase 4 / stay semantics on back-edit', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Mode
        type: text-field
      - field: Conditional
        type: text-field
        computedProperties:
          hidden: |
            return text(self['Mode']) !== 'show'
      - field: AlwaysVisible
        type: text-field
`

	test('Hiding a previously-visible card preserves its and downstream container values', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		// Set all values: Mode=show, Conditional=conditional-value, AlwaysVisible=tail-value.
		await setStringValue(page, 'Mode', 'show')
		await setStringValue(page, 'Conditional', 'conditional-value')
		await setStringValue(page, 'AlwaysVisible', 'tail-value')
		await page.waitForTimeout(400)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		expect((await getCards(page)).total).toBe(3)

		// Flip Mode to hide Conditional.
		await setStringValue(page, 'Mode', 'hide')
		await page.waitForTimeout(400)
		expect((await getCards(page)).total).toBe(2)

		// Read container values directly — Conditional and AlwaysVisible values must still be present
		// even though Conditional is now hidden. Stay semantics: visibility recomputes; data does not.
		// (Mode may have multiple services since setValue without an id appends; that's irrelevant
		// to the stay-semantics claim, which is about NOT discarding sibling values on re-flatten.)
		const presentValues = await page.evaluate(() => {
			const fvc = (window as any).__currentFvc
			const labels = ['Conditional', 'AlwaysVisible']
			const out: Record<string, string[]> = {}
			for (const label of labels) {
				const versioned = fvc.getValues((id: string, history: any[]) => (history?.[0]?.value?.label === label ? [history[0].revision] : []))
				const values: string[] = []
				for (const versions of Object.values(versioned as any)) {
					const primitive = (versions as any)?.[0]?.value?.content?.en
					if (primitive?.value !== undefined) values.push(primitive.value)
				}
				out[label] = values
			}
			return out
		})
		expect(presentValues.Conditional).toContain('conditional-value')
		expect(presentValues.AlwaysVisible).toContain('tail-value')
	})

	test('After back-edit reduces visibility, the patient is positioned on a sensible adjacent card', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await setStringValue(page, 'Mode', 'show')
		await page.waitForTimeout(300)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(300)
		// Advance to the Conditional card (idx 1).
		await clickByClass(page, 'card__continue')
		await page.waitForTimeout(200)
		expect((await getCards(page)).currentIdx).toBe(1)
		// Now hide Conditional by changing Mode. Conditional disappears from the sequence.
		await setStringValue(page, 'Mode', 'hide')
		await page.waitForTimeout(500)
		const s = await getCards(page)
		// Conditional was at idx 1; with it gone, total=2 and currentIdx clamps to a valid index in [0, 1].
		expect(s.total).toBe(2)
		expect(s.currentIdx).toBeGreaterThanOrEqual(0)
		expect(s.currentIdx).toBeLessThanOrEqual(1)
	})
})

// ============================================================
// Composition: hiddenForPatient AND computed hidden
// ============================================================
test.describe('Phase 4 / composition with hiddenForPatient', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: AlwaysVisible
        type: text-field
      - field: PatientHidden
        type: text-field
        hiddenForPatient: true
      - field: ConditionallyHidden
        type: text-field
        computedProperties:
          hidden: |
            return true
`

	test('Both static hiddenForPatient and computed hidden are honored together (only AlwaysVisible remains)', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'card__start')
		await page.waitForTimeout(400)
		const cards = await getCards(page)
		expect(cards.total).toBe(1)
		expect(cards.sectionTitle).toBe('S')
	})
})

// ============================================================
// Clinician renderer is unaffected by card computed-hidden behaviour
// ============================================================
test.describe('Phase 4 / clinician renderer unchanged', () => {
	const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: Trigger
        type: text-field
      - field: Conditional
        type: text-field
        computedProperties:
          hidden: |
            return text(self['Trigger']) !== 'show'
`

	test('Clinician renderer still respects existing computed hidden semantics (no regression)', async ({ page }) => {
		await gotoHarness(page)
		await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'form' }), yaml)
		await page.waitForFunction(
			() => {
				const el = document.querySelector('icure-form')
				return !!el?.shadowRoot?.querySelector('.icure-form')
			},
			{ timeout: 15_000 },
		)
		await page.waitForTimeout(500)
		const labels = await page.evaluate(() => {
			const root = document.querySelector('icure-form')?.shadowRoot
			if (!root) return []
			return Array.from(root.querySelectorAll('.icure-form-field')).map((el) => (el as any).label)
		})
		// Conditional is hidden initially because Trigger has no value.
		expect(labels).toContain('Trigger')
		expect(labels).not.toContain('Conditional')
	})
})
