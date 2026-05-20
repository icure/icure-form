import { test, expect, Page } from '@playwright/test'

// ============================================================
// Phase 2: welcome / review / confirmation / patient-form-submit
// ============================================================

async function gotoHarness(page: Page) {
	await page.goto('/')
	await page.waitForFunction(() => typeof (window as any).initForm === 'function', { timeout: 10_000 })
}

async function initPatientCards(page: Page, yaml: string) {
	return await page.evaluate(async (y: string) => (window as any).initForm({ yaml: y, language: 'en', renderer: 'patient-cards' }), yaml)
}

async function waitForInternal(page: Page) {
	await page.waitForFunction(
		() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards')
		},
		{ timeout: 15_000 },
	)
}

async function getStage(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		return internal?.shadowRoot?.querySelector('.patient-cards')?.getAttribute('data-stage') ?? null
	})
}

async function clickByClass(page: Page, cls: string) {
	const ok = await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		if (!btn) return false
		btn.click()
		return true
	}, cls)
	if (!ok) throw new Error(`Button .${cls} not found`)
	await page.waitForTimeout(100)
}

async function clickEditForCardIndex(page: Page, cardIndex: number) {
	const ok = await page.evaluate((idx: number) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const row = internal?.shadowRoot?.querySelector(`.patient-cards__review-row[data-card-index="${idx}"]`)
		const btn = row?.querySelector('.patient-cards__review-edit') as HTMLElement | null
		if (!btn) return false
		btn.click()
		return true
	}, cardIndex)
	if (!ok) throw new Error(`Edit button for card-index ${cardIndex} not found`)
	await page.waitForTimeout(100)
}

async function getCurrentCardIndex(page: Page): Promise<number | null> {
	return await page.evaluate(() => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const root = internal?.shadowRoot?.querySelector('.patient-cards')
		const idx = root?.getAttribute('data-current-card-index')
		return idx === null || idx === undefined ? null : parseInt(idx, 10)
	})
}

// Set a string value on the BridgedFormValuesContainer for a given field label, then wait for re-render.
async function setStringValue(page: Page, label: string, value: string, language = 'en') {
	await page.evaluate(
		({ label, value, language }: { label: string; value: string; language: string }) => {
			const fvc = (window as any).__currentFvc
			fvc.setValue(label, language, { content: { [language]: { type: 'string', value } } })
		},
		{ label, value, language },
	)
	await page.waitForTimeout(200)
}

// ============================================================
// Welcome card
// ============================================================
test.describe('Phase 2 / welcome card', () => {
	const yaml = `
form: Patient intake
description: This is a short intake form
sections:
  - section: Demographics
    fields:
      - field: First name
        type: text-field
      - field: Last name
        type: text-field
`

	test('initial stage is welcome', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		expect(await getStage(page)).toBe('welcome')
	})

	test('welcome shows form title and description', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		const content = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const r = internal?.shadowRoot
			return {
				title: r?.querySelector('.patient-cards__welcome-title')?.textContent?.trim() ?? null,
				description: r?.querySelector('.patient-cards__welcome-description')?.textContent?.trim() ?? null,
				hasStart: !!r?.querySelector('.patient-cards__start'),
			}
		})
		expect(content.title).toBe('Patient intake')
		expect(content.description).toBe('This is a short intake form')
		expect(content.hasStart).toBe(true)
	})

	test('Start button advances to first input card', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		expect(await getStage(page)).toBe('input')
		expect(await getCurrentCardIndex(page)).toBe(0)
	})

	test('welcome is not counted in progress (progress shows 1 / 2 on first input card)', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		const progressText = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards__progress-text')?.textContent?.trim() ?? null
		})
		expect(progressText).toBe('1 / 2')
	})

	test('Back from first input card returns to welcome', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__back')
		expect(await getStage(page)).toBe('welcome')
	})

	test('welcome renders even when description is absent', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(
			page,
			`
form: Onlytitle
sections:
  - section: S
    fields:
      - field: Q
        type: text-field
`,
		)
		await waitForInternal(page)
		const result = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const r = internal?.shadowRoot
			return {
				title: r?.querySelector('.patient-cards__welcome-title')?.textContent?.trim() ?? null,
				hasDescription: !!r?.querySelector('.patient-cards__welcome-description'),
				hasStart: !!r?.querySelector('.patient-cards__start'),
			}
		})
		expect(result.title).toBe('Onlytitle')
		expect(result.hasDescription).toBe(false)
		expect(result.hasStart).toBe(true)
	})
})

// ============================================================
// Card sequence -> review
// ============================================================
test.describe('Phase 2 / card sequence -> review', () => {
	const yaml = `
form: F
description: D
sections:
  - section: A
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
  - section: B
    fields:
      - field: Q3
        type: text-field
`

	test('Continue on last input card goes to review', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		// 1 -> 2
		await clickByClass(page, 'patient-cards__continue')
		// 2 -> 3 (last)
		await clickByClass(page, 'patient-cards__continue')
		expect(await getStage(page)).toBe('input')
		expect(await getCurrentCardIndex(page)).toBe(2)
		// 3 -> review
		await clickByClass(page, 'patient-cards__continue--to-review')
		expect(await getStage(page)).toBe('review')
	})

	test('review is not counted in progress (no progress chrome on review stage)', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue--to-review')
		const hasProgress = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards__progress')
		})
		expect(hasProgress).toBe(false)
	})
})

// ============================================================
// Review card content + edit-jumps
// ============================================================
test.describe('Phase 2 / review card', () => {
	const yaml = `
form: F
description: D
sections:
  - section: A
    fields:
      - field: First name
        type: text-field
      - field: Last name
        type: text-field
  - section: B
    fields:
      - field: City
        type: text-field
`

	async function navigateToReview(page: Page) {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue--to-review')
	}

	test('review lists all field labels grouped by section', async ({ page }) => {
		await navigateToReview(page)
		const dom = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const r = internal?.shadowRoot
			const sections = Array.from(r?.querySelectorAll('.patient-cards__review-section-title') ?? []).map((e) => (e as HTMLElement).textContent?.trim())
			const labels = Array.from(r?.querySelectorAll('.patient-cards__review-label') ?? []).map((e) => (e as HTMLElement).textContent?.trim())
			return { sections, labels }
		})
		expect(dom.sections).toEqual(['A', 'B'])
		expect(dom.labels).toEqual(['First name', 'Last name', 'City'])
	})

	test('review shows actual entered values', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		// Set values BEFORE entering the input stage (it doesn't matter when — they're on the container)
		await setStringValue(page, 'First name', 'Alice')
		await setStringValue(page, 'Last name', 'Smith')
		await setStringValue(page, 'City', 'Brussels')
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue--to-review')

		const values = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return Array.from(internal?.shadowRoot?.querySelectorAll('.patient-cards__review-value') ?? []).map((e) => (e as HTMLElement).textContent?.trim())
		})
		expect(values).toEqual(['Alice', 'Smith', 'Brussels'])
	})

	test('empty fields render an em-dash placeholder', async ({ page }) => {
		await navigateToReview(page)
		const placeholders = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return Array.from(internal?.shadowRoot?.querySelectorAll('.patient-cards__review-empty') ?? []).length
		})
		expect(placeholders).toBe(3)
	})

	test('Edit button jumps to specific input card with cameFromReview semantics', async ({ page }) => {
		await navigateToReview(page)
		await clickEditForCardIndex(page, 1) // jump to 'Last name' card (index 1)
		expect(await getStage(page)).toBe('input')
		expect(await getCurrentCardIndex(page)).toBe(1)
		// The Continue button should be the "return to review" variant
		const hasReturnToReview = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards__continue--return-to-review')
		})
		expect(hasReturnToReview).toBe(true)
	})

	test('Continue from edit-jumped card returns directly to review', async ({ page }) => {
		await navigateToReview(page)
		await clickEditForCardIndex(page, 0)
		await clickByClass(page, 'patient-cards__continue--return-to-review')
		expect(await getStage(page)).toBe('review')
	})

	test('Back from review returns to the last input card', async ({ page }) => {
		await navigateToReview(page)
		await clickByClass(page, 'patient-cards__back')
		expect(await getStage(page)).toBe('input')
		expect(await getCurrentCardIndex(page)).toBe(2) // last card index
	})
})

// ============================================================
// Submit + confirmation
// ============================================================
test.describe('Phase 2 / submit and confirmation', () => {
	const yaml = `
form: F
description: D
sections:
  - section: A
    fields:
      - field: Q1
        type: text-field
`

	async function navigateToReview(page: Page) {
		await gotoHarness(page)
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue--to-review')
	}

	test('Submit on review fires patient-form-submit with detail.submittedAt', async ({ page }) => {
		await navigateToReview(page)
		// Hook the event before clicking.
		await page.evaluate(() => {
			const w = window as any
			w.__submitEventCount = 0
			w.__submitEventDetail = null
			const el = document.querySelector('icure-form')
			el?.addEventListener('patient-form-submit', (e: Event) => {
				w.__submitEventCount++
				w.__submitEventDetail = (e as CustomEvent).detail
			})
		})
		await clickByClass(page, 'patient-cards__submit')
		const { count, detail } = await page.evaluate(() => ({ count: (window as any).__submitEventCount, detail: (window as any).__submitEventDetail }))
		expect(count).toBe(1)
		expect(detail).toBeTruthy()
		expect(detail.submittedAt).toBeTruthy()
		// submittedAt should be a Date-ish (will be serialized to ISO string by page.evaluate's structured clone)
		const ts = new Date(detail.submittedAt).getTime()
		expect(Number.isFinite(ts)).toBe(true)
	})

	test('After submit, confirmation stage is shown', async ({ page }) => {
		await navigateToReview(page)
		await clickByClass(page, 'patient-cards__submit')
		expect(await getStage(page)).toBe('confirmation')
		const heading = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards__confirmation-heading')?.textContent?.trim() ?? null
		})
		expect(heading).toBe('Thank you')
	})

	test('No Back button is available on confirmation', async ({ page }) => {
		await navigateToReview(page)
		await clickByClass(page, 'patient-cards__submit')
		const hasBack = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards__back')
		})
		expect(hasBack).toBe(false)
	})

	test('Confirmation is not counted in progress (no progress chrome)', async ({ page }) => {
		await navigateToReview(page)
		await clickByClass(page, 'patient-cards__submit')
		const hasProgress = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return !!internal?.shadowRoot?.querySelector('.patient-cards__progress')
		})
		expect(hasProgress).toBe(false)
	})
})
