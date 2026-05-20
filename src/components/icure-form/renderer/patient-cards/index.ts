import { html } from 'lit'
import { Renderer } from '../index'

// Side-effect import: register the internal element. The default theme already exposes the user-facing
// <icure-form> tag; this adds the internal stateful element used by renderer="patient-cards".
import './register'

/**
 * Patient-cards renderer.
 *
 * Returns a single internal element instance that holds card-index / Continue / Back state.
 * Provider props are forwarded; the internal element drives everything else.
 */
export const render: Renderer = async (
	form,
	props,
	formsValueContainer,
	translationProvider,
	revisionsFilter,
	ownersProvider,
	optionsProvider,
	actionListener,
	languages,
	readonly,
	displayMetadata,
) => {
	return html`<icure-patient-cards-internal
		.form=${form}
		.formValuesContainer=${formsValueContainer}
		.translationProvider=${translationProvider}
		.revisionsFilter=${revisionsFilter}
		.ownersProvider=${ownersProvider}
		.optionsProvider=${optionsProvider}
		.actionListener=${actionListener}
		.languages=${languages}
		.language=${props.language}
		.labelPosition=${props.labelPosition}
		.questionsPerCard=${props.questionsPerCard ?? 1}
		?readonly=${!!readonly}
		?displayMetadata=${!!displayMetadata}
	></icure-patient-cards-internal>`
}

export { IcurePatientCardsInternal } from './internal'
export { flatten, flattenWithVisibility } from './flatten'
export type { Card } from './flatten'
export { PatientRendererKeys, patientRendererDefaults, resolveChrome } from './translation-keys'
export type { PatientRendererKey } from './translation-keys'
