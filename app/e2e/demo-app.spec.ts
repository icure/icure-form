import { test, expect, Page, ConsoleMessage } from '@playwright/test'

// Slugs MUST mirror the entries in app/demo-app.ts (`samples[].slug`).
const SAMPLE_SLUGS = [
	'01-components-gallery',
	'02-formulas',
	'03-async-formulas',
	'04-validation',
	'05-conditional-actions',
	'06-subforms',
	'07-tabs-layout',
	'08-rich-text',
	'09-legacy-json',
	'10-clinical-workflow',
	'11-delegated-edition',
] as const

type CapturedConsoleMessage = {
	type: string
	text: string
	location: string
	args: string[]
}

type CapturedPageError = {
	message: string
	stack?: string
}

// Attach console + page-error listeners. Returns the collectors and an
// `unsubscribe` that detaches them.
function attachLogCapture(page: Page) {
	const consoleMessages: CapturedConsoleMessage[] = []
	const pageErrors: CapturedPageError[] = []

	const onConsole = async (msg: ConsoleMessage) => {
		const location = msg.location()
		// Resolve handles to their string representation so objects logged via
		// `console.warn('…', obj)` show up in the report rather than `JSHandle@object`.
		const args = await Promise.all(
			msg.args().map(async (arg) => {
				try {
					return await arg.jsonValue().then((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
				} catch {
					try {
						return await arg.evaluate((node) => String(node))
					} catch {
						return '<unserialisable>'
					}
				}
			}),
		)
		consoleMessages.push({
			type: msg.type(),
			text: msg.text(),
			location: `${location.url}:${location.lineNumber}:${location.columnNumber}`,
			args: args.map((a) => (a == null ? String(a) : a)),
		})
	}

	const onPageError = (err: Error) => {
		pageErrors.push({ message: err.message, stack: err.stack })
	}

	page.on('console', onConsole)
	page.on('pageerror', onPageError)

	return {
		consoleMessages,
		pageErrors,
		unsubscribe: () => {
			page.off('console', onConsole)
			page.off('pageerror', onPageError)
		},
	}
}

// Wait until <decorated-form id="…"> is visible inside <demo-app>'s shadow root,
// then drill in until the inner <icure-form> has rendered its grid (or printed
// "missing form" / "Loading…", which is the harmless transient).
async function waitForSampleRendered(page: Page, slug: string) {
	await page.waitForFunction(
		(slug) => {
			const demo = document.querySelector('demo-app')
			const decorated = demo?.shadowRoot?.querySelector('decorated-form:not([id=""]):not([style*="display: none"])')
			if (!decorated) return false
			const icureForm = decorated.shadowRoot?.querySelector('icure-form')
			if (!icureForm?.shadowRoot) return false
			const slotted = icureForm.shadowRoot.querySelector('.icure-form, .tab-container, p')
			return !!slotted && !!(slotted.textContent || slotted.children.length)
		},
		slug,
		{ timeout: 20_000 },
	)
	// Give async formulas / computed properties a moment to settle.
	await page.waitForTimeout(800)
}

// Clear demo-app localStorage so each sample starts from a clean slate.
async function freshLoad(page: Page, slug: string) {
	await page.addInitScript(() => {
		try {
			localStorage.clear()
		} catch {
			/* ignore */
		}
	})
	await page.goto(`/#${slug}`, { waitUntil: 'domcontentloaded' })
}

function summariseLogs(slug: string, c: ReturnType<typeof attachLogCapture>): string {
	const lines: string[] = []
	lines.push(`=== ${slug} ===`)
	if (c.pageErrors.length > 0) {
		lines.push('Page errors:')
		c.pageErrors.forEach((e, i) => lines.push(`  [${i}] ${e.message}\n${e.stack ? `      ${e.stack.split('\n').slice(0, 6).join('\n      ')}` : ''}`))
	}
	const interestingConsole = c.consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning' || m.text.includes('extractFormulas') || m.text.includes('extractValidators'))
	if (interestingConsole.length > 0) {
		lines.push('Console (errors/warnings/extract*):')
		interestingConsole.forEach((m, i) => lines.push(`  [${i}] ${m.type} ${m.text}\n      args: ${m.args.join(' | ')}\n      at  ${m.location}`))
	}
	return lines.join('\n')
}

test.describe('demo-app — each sample loads cleanly', () => {
	for (const slug of SAMPLE_SLUGS) {
		test(slug, async ({ page }) => {
			const capture = attachLogCapture(page)
			try {
				await freshLoad(page, slug)
				await waitForSampleRendered(page, slug)
				// Selected list item must match the hash.
				const selectedTitle = await page.evaluate((slug) => {
					const demo = document.querySelector('demo-app')
					const items = demo?.shadowRoot?.querySelectorAll('.master ul li.selected')
					return items && items.length > 0 ? items[0].textContent?.trim() : null
				}, slug)
				expect(selectedTitle, `selected list item for #${slug}`).toBeTruthy()
				// Page must not have thrown. Print every console/page event when it has.
				if (capture.pageErrors.length > 0) {
					throw new Error(`Page errors during ${slug}:\n${summariseLogs(slug, capture)}`)
				}
				// Anything that hit our extract* defensive paths in decorated-form is a
				// regression — the root cause should be fixed, not papered over.
				const extractWarnings = capture.consoleMessages.filter((m) => m.text.includes('extractFormulas') || m.text.includes('extractValidators'))
				if (extractWarnings.length > 0) {
					throw new Error(`Unexpected extract* warnings during ${slug}:\n${summariseLogs(slug, capture)}`)
				}
			} finally {
				capture.unsubscribe()
				// Always attach the captured log to the report — even on success it's
				// useful to confirm no warnings slipped through.
				test.info().annotations.push({ type: 'console-log', description: summariseLogs(slug, capture) })
			}
		})
	}
})
