/**
 * Translation keys emitted by the patient-cards renderer for its chrome strings.
 *
 * Host apps provide translations via the existing `translationProvider` on `<icure-form>`. When the
 * provider returns the key unchanged (no translation registered), the renderer falls back to the
 * English defaults below.
 *
 * The full key set is exported as `PatientRendererKeys`. The defaults map is exported as
 * `patientRendererDefaults`. Tests and integrators can rely on these constants.
 */

export const PatientRendererKeys = {
	start: 'patient-renderer.start',
	continue: 'patient-renderer.continue',
	back: 'patient-renderer.back',
	submit: 'patient-renderer.submit',
	progress: 'patient-renderer.progress',
	reviewHeading: 'patient-renderer.review-heading',
	reviewEdit: 'patient-renderer.review-edit',
	reviewEmpty: 'patient-renderer.review-empty',
	reviewErrorsTitle: 'patient-renderer.review-errors-title',
	confirmationHeading: 'patient-renderer.confirmation-heading',
	confirmationBody: 'patient-renderer.confirmation-body',
} as const

export type PatientRendererKey = keyof typeof PatientRendererKeys

export const patientRendererDefaults: Record<PatientRendererKey, string> = {
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
	key: PatientRendererKey,
	substitutions?: Record<string, string | number>,
): string {
	const fullKey = PatientRendererKeys[key]
	const fallback = patientRendererDefaults[key]
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
