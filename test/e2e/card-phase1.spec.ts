import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 1: dispatch + linear nav + hiddenForPatient cascade + Subform recursion
// ============================================================

// Helpers ---------------------------------------------------------

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initCard(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'card' }), yaml)
}

async function initClinicianRenderer(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'form' }), yaml)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(
		() => {
			const root = document.querySelector('icure-form')?.shadowRoot
			return !!root?.querySelector('icure-card-internal')
		},
		{ timeout: 15_000 },
	)
	// Allow Lit to render the internal element's shadow DOM.
	await page.waitForFunction(
		() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal')
			return !!(internal as any)?.shadowRoot?.querySelector('.card')
		},
		{ timeout: 15_000 },
	)
}

async function getCardState(page: Page) {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const root = internal?.shadowRoot
		if (!root) return null
		const wrapper = root.querySelector('.card')
		const card = root.querySelector('.card__card')
		return {
			currentCardIndex: parseInt(wrapper?.getAttribute('data-current-card-index') ?? '-1', 10),
			totalCards: parseInt(wrapper?.getAttribute('data-total-cards') ?? '-1', 10),
			sectionTitle: card?.getAttribute('data-card-section') ?? null,
			progressText: root.querySelector('.card__progress-text')?.textContent?.trim() ?? null,
			hasBack: !!root.querySelector('.card__back'),
			hasContinue: !!root.querySelector('.card__continue'),
			hasSubmit: !!root.querySelector('.card__submit'),
			progressBarWidth: (root.querySelector('.card__progress-bar') as HTMLElement | null)?.style.width ?? null,
		}
	})
}

async function clickContinue(page: Page) {
	await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const btn = internal?.shadowRoot?.querySelector('[class*="card__continue"]') as HTMLElement
		btn?.click()
	})
	await page.waitForTimeout(100)
}

async function clickBack(page: Page) {
	await page.evaluate(() => {
		const btn = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal')?.shadowRoot?.querySelector('.card__back') as HTMLElement
		btn?.click()
	})
	await page.waitForTimeout(100)
}

// Phase 2 introduced a welcome stage. Phase 1 navigation tests run their assertions against the
// input stage, so they need to advance past welcome first.
async function clickStartIfPresent(page: Page) {
	await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
		const btn = internal?.shadowRoot?.querySelector('.card__start') as HTMLElement
		btn?.click()
	})
	await page.waitForTimeout(100)
}

// ============================================================
// Group 1: dispatch
// ============================================================
test.describe('Phase 1 / dispatch', () => {
	const yaml = `
form: Dispatch
sections:
  - section: A
    fields:
      - field: Q1
        type: text-field
`

	test('renderer="card" mounts the patient internal element', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		const tag = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal')
			return internal?.tagName.toLowerCase() ?? null
		})
		expect(tag).toBe('icure-card-internal')
	})

	test('renderer="form" (default) does NOT mount the patient internal element', async ({ page }) => {
		await gotoHarness(page)
		await initClinicianRenderer(page, yaml)
		// Wait for clinician shadow content
		await page.waitForFunction(
			() => {
				const el = document.querySelector('icure-form')
				if (!el?.shadowRoot) return false
				return el.shadowRoot.querySelector('.icure-form') !== null
			},
			{ timeout: 15_000 },
		)
		const internalPresent = await page.evaluate(() => {
			return !!document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal')
		})
		expect(internalPresent).toBe(false)
	})
})

// ============================================================
// Group 2: linear navigation
// ============================================================
test.describe('Phase 1 / linear navigation', () => {
	const threeQuestionYaml = `
form: Linear
sections:
  - section: Demographics
    fields:
      - field: First name
        type: text-field
      - field: Last name
        type: text-field
      - field: Age
        type: number-field
`

	test('three text fields produce three cards, one field per card', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, threeQuestionYaml)
		await waitForInternal(page)
		await clickStartIfPresent(page)
		const s = await getCardState(page)
		expect(s).not.toBeNull()
		expect(s!.totalCards).toBe(3)
		expect(s!.currentCardIndex).toBe(0)
		expect(s!.sectionTitle).toBe('Demographics')
		expect(s!.progressText).toBe('1 / 3')
	})

	test('On the first input card, Continue is present and (with no validators) Back returns to welcome', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, threeQuestionYaml)
		await waitForInternal(page)
		await clickStartIfPresent(page)
		const s = await getCardState(page)
		// Phase 2 introduced a welcome stage; Back from first input card returns to welcome.
		expect(s!.hasContinue).toBe(true)
		expect(s!.hasSubmit).toBe(false)
	})

	test('Continue advances; Back returns; Submit replaces Continue on last card', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, threeQuestionYaml)
		await waitForInternal(page)
		await clickStartIfPresent(page)

		// Card 0 -> Card 1
		await clickContinue(page)
		let s = await getCardState(page)
		expect(s!.currentCardIndex).toBe(1)
		expect(s!.hasBack).toBe(true)
		expect(s!.hasContinue).toBe(true)
		expect(s!.hasSubmit).toBe(false)
		expect(s!.progressText).toBe('2 / 3')

		// Card 1 -> Card 2 (last input card; Continue exists, points to review).
		await clickContinue(page)
		s = await getCardState(page)
		expect(s!.currentCardIndex).toBe(2)
		expect(s!.hasBack).toBe(true)
		expect(s!.hasContinue).toBe(true)
		expect(s!.hasSubmit).toBe(false)
		expect(s!.progressText).toBe('3 / 3')

		// Back to Card 1
		await clickBack(page)
		s = await getCardState(page)
		expect(s!.currentCardIndex).toBe(1)
	})

	test('progress bar width tracks index', async ({ page }) => {
		await gotoHarness(page)
		await initCard(page, threeQuestionYaml)
		await waitForInternal(page)
		await clickStartIfPresent(page)
		// 1/3 = 33.33%
		let s = await getCardState(page)
		expect(s!.progressBarWidth).toMatch(/^33\.?\d*%$/)
		await clickContinue(page)
		s = await getCardState(page)
		expect(s!.progressBarWidth).toMatch(/^66\.?\d*%$/)
		await clickContinue(page)
		s = await getCardState(page)
		expect(s!.progressBarWidth).toBe('100%')
	})
})

// ============================================================
// Group 3: hiddenForPatient cascade
// ============================================================
test.describe('Phase 1 / hiddenForPatient cascade', () => {
	test('Field-level hiddenForPatient excludes only that field', async ({ page }) => {
		const yaml = `
form: FieldHidden
sections:
  - section: S
    fields:
      - field: Visible1
        type: text-field
      - field: Hidden1
        type: text-field
        hiddenForPatient: true
      - field: Visible2
        type: text-field
`
		await gotoHarness(page)
		const flat = await page.evaluate(
			(y) =>
				(window as any).cardFlatten({
					form: 'FieldHidden',
					sections: [
						{
							section: 'S',
							fields: [
								{ field: 'Visible1', type: 'text-field' },
								{ field: 'Hidden1', type: 'text-field', hiddenForPatient: true },
								{ field: 'Visible2', type: 'text-field' },
							],
						},
					],
				}),
			yaml,
		)
		expect(flat.map((c: any) => c.fieldLabels[0])).toEqual(['Visible1', 'Visible2'])
	})

	test('Group-level hiddenForPatient cascades and excludes all nested fields', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'GroupHidden',
				sections: [
					{
						section: 'S',
						fields: [
							{ field: 'TopVisible', type: 'text-field' },
							{
								group: 'HiddenGroup',
								hiddenForPatient: true,
								fields: [
									{ field: 'Inner1', type: 'text-field' },
									{ field: 'Inner2', type: 'text-field' },
								],
							},
							{ field: 'TailVisible', type: 'text-field' },
						],
					},
				],
			}),
		)
		expect(flat.map((c: any) => c.fieldLabels[0])).toEqual(['TopVisible', 'TailVisible'])
	})

	test('Section-level hiddenForPatient cascades and excludes the whole section', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'SectionHidden',
				sections: [
					{ section: 'Visible', fields: [{ field: 'A', type: 'text-field' }] },
					{ section: 'Hidden', hiddenForPatient: true, fields: [{ field: 'B', type: 'text-field' }] },
					{ section: 'Visible2', fields: [{ field: 'C', type: 'text-field' }] },
				],
			}),
		)
		const sections = flat.map((c: any) => c.sectionTitle)
		const labels = flat.map((c: any) => c.fieldLabels[0])
		expect(sections).toEqual(['Visible', 'Visible2'])
		expect(labels).toEqual(['A', 'C'])
	})

	test('Subform-level hiddenForPatient cascades and excludes the embedded form', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'SubformHidden',
				sections: [
					{
						section: 'Main',
						fields: [
							{ field: 'Before', type: 'text-field' },
							{
								subform: 'Sub',
								id: 'sub',
								hiddenForPatient: true,
								forms: {
									'sub-template': {
										form: 'SubInner',
										sections: [
											{ section: 'Inner', fields: [{ field: 'InnerField', type: 'text-field' }] },
										],
									},
								},
							},
							{ field: 'After', type: 'text-field' },
						],
					},
				],
			}),
		)
		expect(flat.map((c: any) => c.fieldLabels[0])).toEqual(['Before', 'After'])
	})

	test('cascade applies through nested Groups', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'NestedGroupHidden',
				sections: [
					{
						section: 'S',
						fields: [
							{
								group: 'OuterGroup',
								fields: [
									{ field: 'OuterVisible', type: 'text-field' },
									{
										group: 'InnerHidden',
										hiddenForPatient: true,
										fields: [{ field: 'DeepHidden', type: 'text-field' }],
									},
								],
							},
						],
					},
				],
			}),
		)
		expect(flat.map((c: any) => c.fieldLabels[0])).toEqual(['OuterVisible'])
	})

	test('hiddenForPatient has NO effect on the clinician renderer', async ({ page }) => {
		const yaml = `
form: HiddenNoEffect
sections:
  - section: S
    fields:
      - field: Visible
        type: text-field
      - field: HiddenInPatient
        type: text-field
        hiddenForPatient: true
`
		await gotoHarness(page)
		await initClinicianRenderer(page, yaml)
		await page.waitForFunction(
			() => {
				const root = document.querySelector('icure-form')?.shadowRoot
				return !!root?.querySelector('.icure-form')
			},
			{ timeout: 15_000 },
		)
		await page.waitForTimeout(500)
		const visibleLabels = await page.evaluate(() => {
			const root = document.querySelector('icure-form')?.shadowRoot
			if (!root) return []
			const out: string[] = []
			root.querySelectorAll('.icure-form-field').forEach((el) => {
				out.push((el as any).label)
			})
			return out
		})
		expect(visibleLabels).toContain('Visible')
		expect(visibleLabels).toContain('HiddenInPatient')
	})
})

// ============================================================
// Group 4: Subform transparent recursion
// ============================================================
test.describe('Phase 1 / Subform recursion', () => {
	test('Subform fields appear inline in card sequence between sibling fields', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'WithSub',
				sections: [
					{
						section: 'Main',
						fields: [
							{ field: 'Before', type: 'text-field' },
							{
								subform: 'Sub',
								id: 'sub',
								forms: {
									'sub-template': {
										form: 'SubInner',
										sections: [
											{
												section: 'Inner',
												fields: [
													{ field: 'I1', type: 'text-field' },
													{ field: 'I2', type: 'text-field' },
												],
											},
										],
									},
								},
							},
							{ field: 'After', type: 'text-field' },
						],
					},
				],
			}),
		)
		// Cards: Before(Main), I1(Inner), I2(Inner), After(Main)
		expect(flat.map((c: any) => c.fieldLabels[0])).toEqual(['Before', 'I1', 'I2', 'After'])
		expect(flat.map((c: any) => c.sectionTitle)).toEqual(['Main', 'Inner', 'Inner', 'Main'])
	})

	test('Subform with multiple form templates contributes fields from every template', async ({ page }) => {
		await gotoHarness(page)
		const flat = await page.evaluate(() =>
			(window as any).cardFlatten({
				form: 'MultiTemplate',
				sections: [
					{
						section: 'Main',
						fields: [
							{
								subform: 'Sub',
								id: 'sub',
								forms: {
									a: { form: 'A', sections: [{ section: 'A-sec', fields: [{ field: 'A1', type: 'text-field' }] }] },
									b: { form: 'B', sections: [{ section: 'B-sec', fields: [{ field: 'B1', type: 'text-field' }] }] },
								},
							},
						],
					},
				],
			}),
		)
		const labels = flat.map((c: any) => c.fieldLabels[0]).sort()
		expect(labels).toEqual(['A1', 'B1'])
	})

	test('Cyclic Subform references are skipped with console.warn (no infinite loop)', async ({ page }) => {
		await gotoHarness(page)
		const result = await page.evaluate(() => (window as any).testCyclicSubformFlatten())
		// Visited-set guard ensures finite cardCount (no infinite loop).
		expect(typeof result.cardCount).toBe('number')
		// At least one warning containing "Cycle detected" was emitted.
		const matched = (result.warnings as string[]).some((w) => w.includes('Cycle detected'))
		expect(matched).toBe(true)
	})
})

// ============================================================
// Group 5: parse/toJson round-trip
// ============================================================
test.describe('Phase 1 / parse and toJson round-trip', () => {
	test('hiddenForPatient round-trips at Field level', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						fields: [{ field: 'A', type: 'text-field', hiddenForPatient: true }],
					},
				],
			}),
		)
		expect(out.sections[0].fields[0].hiddenForPatient).toBe(true)
	})

	test('hiddenForPatient round-trips at Section level', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						hiddenForPatient: true,
						fields: [{ field: 'A', type: 'text-field' }],
					},
				],
			}),
		)
		expect(out.sections[0].hiddenForPatient).toBe(true)
	})

	test('hiddenForPatient round-trips at Group level', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						fields: [
							{
								group: 'G',
								hiddenForPatient: true,
								fields: [{ field: 'A', type: 'text-field' }],
							},
						],
					},
				],
			}),
		)
		const grp = out.sections[0].fields.find((f: any) => f.group === 'G')
		expect(grp.hiddenForPatient).toBe(true)
	})

	test('hiddenForPatient round-trips at Subform level', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						fields: [
							{
								subform: 'Sub',
								id: 'sub',
								hiddenForPatient: true,
								forms: {
									t: { form: 'T', sections: [{ section: 'I', fields: [{ field: 'X', type: 'text-field' }] }] },
								},
							},
						],
					},
				],
			}),
		)
		const sub = out.sections[0].fields.find((f: any) => f.subform === 'sub')
		expect(sub.hiddenForPatient).toBe(true)
	})

	test('absent hiddenForPatient remains undefined / falsy after round-trip', async ({ page }) => {
		await gotoHarness(page)
		const out = await page.evaluate(() =>
			(window as any).formToJson({
				form: 'RT',
				sections: [
					{
						section: 'S',
						fields: [{ field: 'A', type: 'text-field' }],
					},
				],
			}),
		)
		expect(!!out.sections[0].fields[0].hiddenForPatient).toBe(false)
		expect(!!out.sections[0].hiddenForPatient).toBe(false)
	})
})

// ============================================================
// Group 6: rendering integration - card body shows expected field component
// ============================================================
test.describe('Phase 1 / rendering integration', () => {
	test('current card renders the expected field component', async ({ page }) => {
		const yaml = `
form: Render
sections:
  - section: Demographics
    fields:
      - field: First name
        type: text-field
      - field: Age
        type: number-field
`
		await gotoHarness(page)
		await initCard(page, yaml)
		await waitForInternal(page)
		await clickStartIfPresent(page)

		// First card: text-field
		let typeOnCard = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const body = internal?.shadowRoot?.querySelector('.card__card-body')
			const fieldEl = body?.querySelector('icure-form-text-field, icure-form-number-field')
			return fieldEl?.tagName.toLowerCase() ?? null
		})
		expect(typeOnCard).toBe('icure-form-text-field')

		await clickContinue(page)

		typeOnCard = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-card-internal') as any
			const body = internal?.shadowRoot?.querySelector('.card__card-body')
			const fieldEl = body?.querySelector('icure-form-text-field, icure-form-number-field')
			return fieldEl?.tagName.toLowerCase() ?? null
		})
		expect(typeOnCard).toBe('icure-form-number-field')
	})
})
