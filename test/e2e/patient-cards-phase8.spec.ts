import { test, expect, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ============================================================
// Phase 8: theme + animations + accessibility
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

async function clickByClass(page: Page, cls: string) {
	const ok = await page.evaluate((c: string) => {
		const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
		const btn = internal?.shadowRoot?.querySelector(`.${c}`) as HTMLElement | null
		if (!btn || (btn as HTMLButtonElement).disabled) return false
		btn.click()
		return true
	}, cls)
	if (!ok) throw new Error(`Button .${cls} not clickable`)
	await page.waitForTimeout(150)
}

const sampleYaml = `
form: F
description: D
sections:
  - section: S
    fields:
      - field: Q1
        type: text-field
      - field: Q2
        type: text-field
`

// ============================================================
// ARIA & semantic roles
// ============================================================
test.describe('Phase 8 / ARIA semantics', () => {
	test('progress bar has role="progressbar" with aria attributes', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		const attrs = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const pb = internal?.shadowRoot?.querySelector('.patient-cards__progress') as HTMLElement | null
			return {
				role: pb?.getAttribute('role'),
				min: pb?.getAttribute('aria-valuemin'),
				max: pb?.getAttribute('aria-valuemax'),
				now: pb?.getAttribute('aria-valuenow'),
				label: pb?.getAttribute('aria-label'),
			}
		})
		expect(attrs.role).toBe('progressbar')
		expect(attrs.min).toBe('1')
		expect(attrs.max).toBe('2')
		expect(attrs.now).toBe('1')
		expect(attrs.label).toBe('1 / 2')
	})

	test('progress text has aria-live="polite" for screen-reader announcements', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		const live = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards__progress-text')?.getAttribute('aria-live')
		})
		expect(live).toBe('polite')
	})

	test('validation error banner has role="alert"', async ({ page }) => {
		await gotoHarness(page)
		// Cross-card validator: A's validator references B (on a later card). At A's card the
		// validator is deferred to review; at review with mismatched values it fails and the
		// error banner appears with role="alert".
		const yaml = `
form: F
sections:
  - section: S
    fields:
      - field: A
        type: text-field
        validators:
          - validation: |
              return text(self['A']) === text(self['B'])
            message: A must equal B
      - field: B
        type: text-field
`
		await initPatientCards(page, yaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await page.evaluate(() => {
			const fvc = (window as any).__currentFvc
			fvc.setValue('A', 'en', { content: { en: { type: 'string', value: 'one' } } })
		})
		await page.waitForTimeout(300)
		await clickByClass(page, 'patient-cards__continue')
		await page.evaluate(() => {
			const fvc = (window as any).__currentFvc
			fvc.setValue('B', 'en', { content: { en: { type: 'string', value: 'two' } } })
		})
		await page.waitForTimeout(300)
		await clickByClass(page, 'patient-cards__continue--to-review')
		// Wait for async review validator evaluation to complete (banner appears).
		await page.waitForFunction(
			() => {
				const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
				return !!internal?.shadowRoot?.querySelector('.patient-cards__review-errors')
			},
			{ timeout: 5_000 },
		)
		const role = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards__review-errors')?.getAttribute('role')
		})
		expect(role).toBe('alert')
	})
})

// ============================================================
// Focus management
// ============================================================
test.describe('Phase 8 / focus management', () => {
	test('Start button receives focus on welcome stage', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await page.waitForTimeout(200)
		const focusedTag = await page.evaluate(() => {
			// Find deep active element across shadow boundaries.
			let active: Element | null = document.activeElement
			while (active && (active as any).shadowRoot && (active as any).shadowRoot.activeElement) {
				active = (active as any).shadowRoot.activeElement
			}
			return active?.className ?? null
		})
		expect(focusedTag).toContain('patient-cards__start')
	})

	test('Focus moves to Continue / interactive field on entering input stage', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await page.waitForTimeout(300)
		const focusInfo = await page.evaluate(() => {
			let active: Element | null = document.activeElement
			while (active && (active as any).shadowRoot && (active as any).shadowRoot.activeElement) {
				active = (active as any).shadowRoot.activeElement
			}
			return {
				className: (active as HTMLElement | null)?.className ?? null,
				tagName: active?.tagName.toLowerCase() ?? null,
				editable: (active as HTMLElement | null)?.isContentEditable ?? false,
			}
		})
		// Either an editable element inside the field, or the Continue button as fallback if no editable was found.
		const looksGood = !!(focusInfo.editable || focusInfo.className?.includes('patient-cards__continue') || focusInfo.tagName === 'input' || focusInfo.tagName === 'textarea')
		expect(looksGood).toBe(true)
	})
})

// ============================================================
// Touch targets
// ============================================================
test.describe('Phase 8 / touch targets', () => {
	test('primary buttons render with min height/width ≥ 44px', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		const sizes = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const btn = internal?.shadowRoot?.querySelector('.patient-cards__start') as HTMLElement
			if (!btn) return null
			const rect = btn.getBoundingClientRect()
			return { width: rect.width, height: rect.height }
		})
		expect(sizes).not.toBeNull()
		expect(sizes!.height).toBeGreaterThanOrEqual(44)
		expect(sizes!.width).toBeGreaterThanOrEqual(44)
	})
})

// ============================================================
// Mobile responsiveness at 360px
// ============================================================
test.describe('Phase 8 / responsive at 360px', () => {
	test.use({ viewport: { width: 360, height: 640 } })

	test('renderer is usable at 360px width without horizontal overflow', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		const overflow = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const card = internal?.shadowRoot?.querySelector('.patient-cards') as HTMLElement
			if (!card) return null
			const rect = card.getBoundingClientRect()
			return { width: rect.width, viewportWidth: window.innerWidth }
		})
		expect(overflow).not.toBeNull()
		expect(overflow!.width).toBeLessThanOrEqual(overflow!.viewportWidth)
	})

	test('Start button remains tap-target-sized at 360px', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		const sizes = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const btn = internal?.shadowRoot?.querySelector('.patient-cards__start') as HTMLElement
			const rect = btn?.getBoundingClientRect()
			return rect ? { width: rect.width, height: rect.height } : null
		})
		expect(sizes!.height).toBeGreaterThanOrEqual(44)
		expect(sizes!.width).toBeGreaterThanOrEqual(44)
	})
})

// ============================================================
// Theme CSS custom properties exposed
// ============================================================
test.describe('Phase 8 / theming hooks', () => {
	test('CSS custom properties are exposed on the internal element for host override', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		// Apply a host-side override and check the accent color propagates.
		await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as HTMLElement | null
			if (internal) internal.style.setProperty('--patient-cards-accent', 'rgb(255, 0, 128)')
		})
		await page.waitForTimeout(100)
		const accent = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const bar = internal?.shadowRoot?.querySelector('.patient-cards__progress-bar') as HTMLElement
			return bar ? getComputedStyle(bar).backgroundColor : null
		})
		// Welcome stage doesn't render the progress bar — first navigate to input.
		await clickByClass(page, 'patient-cards__start')
		const accentAfter = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			const bar = internal?.shadowRoot?.querySelector('.patient-cards__progress-bar') as HTMLElement
			return bar ? getComputedStyle(bar).backgroundColor : null
		})
		expect(accentAfter).toBe('rgb(255, 0, 128)')
	})
})

// ============================================================
// Keyboard navigation
// ============================================================
test.describe('Phase 8 / keyboard navigation', () => {
	test('Start button can be activated with Enter via keyboard', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await page.waitForTimeout(200)
		// Focus is already on Start from updated() lifecycle.
		await page.keyboard.press('Enter')
		await page.waitForTimeout(200)
		const stage = await page.evaluate(() => {
			const internal = document.querySelector('icure-form')?.shadowRoot?.querySelector('icure-patient-cards-internal') as any
			return internal?.shadowRoot?.querySelector('.patient-cards')?.getAttribute('data-stage') ?? null
		})
		expect(stage).toBe('input')
	})
})

// ============================================================
// axe-core WCAG 2.1 AA scan
// ============================================================
test.describe('Phase 8 / axe-core a11y scan', () => {
	// Helper: scan and filter violations originating in the patient-cards markup (not the harness page
	// and not embedded field components like icure-form-text-field which we don't ship the styles for).
	async function patientCardsViolations(page: Page) {
		// Let animations finish so opacity-tweening doesn't trip color-contrast checks.
		await page.waitForTimeout(600)
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
		return results.violations.filter((v) =>
			v.nodes.some((n) => {
				const html = n.html ?? ''
				const target = (n.target ?? []).join(' ')
				const inPatient = html.includes('patient-cards') || target.includes('patient-cards')
				const inFieldComponent =
					html.startsWith('<icure-form-text-field') ||
					html.startsWith('<icure-form-measure-field') ||
					html.startsWith('<icure-form-number-field') ||
					html.startsWith('<icure-form-token-field') ||
					html.startsWith('<icure-form-items-list-field') ||
					html.startsWith('<icure-form-date-picker') ||
					html.startsWith('<icure-form-time-picker') ||
					html.startsWith('<icure-form-date-time-picker') ||
					html.startsWith('<icure-form-dropdown-field') ||
					html.startsWith('<icure-form-radio-button') ||
					html.startsWith('<icure-form-checkbox') ||
					target.includes('icure-form-text-field') ||
					target.includes('icure-form-measure-field') ||
					target.includes('icure-form-number-field') ||
					target.includes('icure-form-token-field') ||
					target.includes('icure-form-items-list-field') ||
					target.includes('icure-form-date-picker') ||
					target.includes('icure-form-time-picker') ||
					target.includes('icure-form-date-time-picker') ||
					target.includes('icure-form-dropdown-field') ||
					target.includes('icure-form-radio-button') ||
					target.includes('icure-form-checkbox')
				return inPatient && !inFieldComponent
			}),
		)
	}

	test('welcome stage has no WCAG 2.1 AA serious violations', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		const ours = await patientCardsViolations(page)
		const critical = ours.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		expect(critical, JSON.stringify(critical.map((v) => ({ id: v.id, impact: v.impact, help: v.help })), null, 2)).toEqual([])
	})

	test('input stage has no WCAG 2.1 AA serious violations', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		const ours = await patientCardsViolations(page)
		const critical = ours.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		expect(critical, JSON.stringify(critical.map((v) => ({ id: v.id, impact: v.impact, help: v.help })), null, 2)).toEqual([])
	})

	test('review stage has no WCAG 2.1 AA serious violations', async ({ page }) => {
		await gotoHarness(page)
		await initPatientCards(page, sampleYaml)
		await waitForInternal(page)
		await clickByClass(page, 'patient-cards__start')
		await clickByClass(page, 'patient-cards__continue')
		await clickByClass(page, 'patient-cards__continue--to-review')
		const ours = await patientCardsViolations(page)
		const critical = ours.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		expect(critical, JSON.stringify(critical.map((v) => ({ id: v.id, impact: v.impact, help: v.help })), null, 2)).toEqual([])
	})
})
