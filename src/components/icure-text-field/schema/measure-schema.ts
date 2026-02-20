import { Node, SchemaSpec } from 'prosemirror-model'
import { TextSelection, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

export type MeasureSchema = 'measure'

export function getMeasureSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'decimal unit?',
				parseDOM: [{ tag: 'p' }],
			},

			decimal: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', { class: 'measure' }, 0]
				},
			},

			unit: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span.unit' }],
				toDOM() {
					return ['span', { class: 'unit' }, 0]
				},
				editable: false,
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}

export const measureTransactionMapper = (tr: Transaction) => {
	const decimal = tr.doc.childCount && tr.doc.child(0).type.name === 'decimal' ? tr.doc.child(0) : null
	const decimalText = decimal?.textContent ?? ''
	const unit = tr.doc.childCount > 1 && tr.doc.child(1).type.name === 'unit' ? tr.doc.child(1) : null
	const unitText = unit?.textContent
	const schema = tr.doc.type.schema

	const from = tr.selection.from

	if (decimalText?.match(/^[0-9.,-]+$/)) {
		return tr
	}

	const combinedText = (decimalText ?? '') + (unitText ?? '')

	const newUnitText = combinedText.replace(/^[0-9.,-]*/, '').trimStart()
	const newDecimalText = combinedText.replace(/^([0-9.,-]*) *.*$/, '$1').trim()

	if (newDecimalText === decimalText && newUnitText === unitText) {
		return tr
	}

	const patchedTr = tr.replaceWith(0, tr.doc.content.size, [
		schema.nodes['paragraph'].create(
			{},
			[
				schema.nodes['decimal'].create({}, newDecimalText.length ? [schema.text(newDecimalText)] : []),
				newUnitText?.length ? schema.nodes['unit'].create({}, schema.text(newUnitText)) : undefined,
			].filter((x) => !!x) as Node[],
		),
	])

	const newFrom =
		patchedTr.steps.slice(tr.steps.length).reduce((acc, step) => step.getMap().map(acc), from) +
		(newUnitText?.charAt(0) !== unitText?.charAt(0) && (newUnitText?.length ?? 0) > (unitText?.length ?? 0) ? 2 : 0) +
		((newDecimalText?.length ?? 0) > (decimalText?.length ?? 0) && (newUnitText?.length ?? 0) < (unitText?.length ?? 0) ? -2 : 0)

	return patchedTr.setSelection(TextSelection.create(patchedTr.doc, Math.min(newFrom, tr.doc.content.size - 1)))
}

export const measureOnFocusHandler = (view: EditorView) => {
	const doc = view.state.tr.doc
	const decimal = doc.childCount && doc.child(0).type.name === 'decimal' ? doc.child(0) : null
	const decimalText = decimal?.textContent ?? ''
	const unit = doc.childCount > 1 && doc.child(1).type.name === 'unit' ? doc.child(1) : null
	const unitText = unit?.textContent

	if (unitText?.length && !decimalText?.length) {
		console.log('Setting selection to 1')
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, 1)))
	}
}
