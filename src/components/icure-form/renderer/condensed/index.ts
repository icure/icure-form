import { html } from 'lit'
import { Renderer } from '../index'
import { makeFormRenderer } from '../form/form'

const renderCondensedLayout = makeFormRenderer(true)

/**
 * Read-only review of a filled form, as condensed text: the `form` renderer's grid and fields, always
 * read-only, with no field frame or input background, multi-line fields as tall as their text and
 * tightened spacing.
 *
 * The fields live in nested shadow roots, out of reach of this renderer's selectors, so the look
 * travels as the `--icure-*` custom properties set by `.icure-form-condensed` (`style.scss`): custom
 * properties inherit across shadow boundaries. A host skin that redraws the fields honours the same
 * properties to stay frameless here.
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
	_readonly,
	displayMetadata,
	sectionWrapper,
) => {
	const template = await renderCondensedLayout(
		form,
		props,
		formsValueContainer,
		translationProvider,
		revisionsFilter,
		ownersProvider,
		optionsProvider,
		actionListener,
		languages,
		true,
		displayMetadata,
		sectionWrapper,
	)
	return html`<div class="icure-form-condensed">${template}</div>`
}
