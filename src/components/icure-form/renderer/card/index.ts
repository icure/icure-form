import { html } from 'lit'
import { Renderer } from '../index'

// Side-effect import: register the internal element. The default theme already exposes the user-facing
// <icure-form> tag; this adds the internal stateful element used by renderer="card".
import './register'

/**
 * Card renderer.
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
	return html`<icure-card-internal
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
		.role=${props.role}
		?readonly=${!!readonly}
		?displayMetadata=${!!displayMetadata}
	></icure-card-internal>`
}

export { IcureCardInternal } from './internal'
export { flatten, flattenWithVisibility } from './flatten'
export type { Card } from './flatten'
export { CardRendererKeys, cardRendererDefaults, resolveChrome } from './translation-keys'
export type { CardRendererKey } from './translation-keys'
