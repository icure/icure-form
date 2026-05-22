/**
 * Translation keys emitted by the card renderer for its chrome strings.
 *
 * Host apps provide translations via the existing `translationProvider` on `<icure-form>`. When the
 * provider returns the key unchanged (no translation registered), the renderer falls back to the
 * English defaults below.
 *
 * The full key set is exported as `CardRendererKeys`. The defaults map is exported as
 * `cardRendererDefaults`. Tests and integrators can rely on these constants.
 */

export const CardRendererKeys = {
	start: 'card-renderer.start',
	continue: 'card-renderer.continue',
	back: 'card-renderer.back',
	submit: 'card-renderer.submit',
	progress: 'card-renderer.progress',
	reviewHeading: 'card-renderer.review-heading',
	reviewEdit: 'card-renderer.review-edit',
	reviewEmpty: 'card-renderer.review-empty',
	reviewErrorsTitle: 'card-renderer.review-errors-title',
	confirmationHeading: 'card-renderer.confirmation-heading',
	confirmationBody: 'card-renderer.confirmation-body',
} as const

export type CardRendererKey = keyof typeof CardRendererKeys

export const cardRendererDefaults: Record<CardRendererKey, string> = {
	start: 'Start',
	continue: 'Continue',
	back: 'Back',
	submit: 'Submit',
	progress: '{current} / {total}',
	reviewHeading: 'Review your answers',
	reviewEdit: 'Edit',
	reviewEmpty: '—',
	reviewErrorsTitle: 'Please fix these before submitting',
	confirmationHeading: 'Thank you',
	confirmationBody: 'Your answers have been submitted.',
}

/**
 * Resolve a chrome string using the supplied translation provider.
 *
 * Behaviour:
 *   - If no provider or no language: returns the English default.
 *   - Otherwise: calls `provider(language, key)`. If the result equals the key (i.e. no translation
 *     registered for that key), returns the English default. Otherwise returns the provider's value.
 *
 * The `{current}` / `{total}` substitutions for the progress key are applied after translation
 * lookup, so host translations can re-order tokens.
 */
export function resolveChrome(
	provider: ((language: string, text: string) => string) | undefined,
	language: string | undefined,
	key: CardRendererKey,
	substitutions?: Record<string, string | number>,
): string {
	const fullKey = CardRendererKeys[key]
	const fallback = cardRendererDefaults[key]
	let value = fallback
	if (provider && language) {
		const translated = provider(language, fullKey)
		// When the provider knows nothing about the key, the convention is to return the key unchanged.
		// Treat that as "use the English fallback".
		value = translated && translated !== fullKey ? translated : fallback
	}
	if (substitutions) {
		for (const [k, v] of Object.entries(substitutions)) {
			value = value.split(`{${k}}`).join(String(v))
		}
	}
	return value
}
