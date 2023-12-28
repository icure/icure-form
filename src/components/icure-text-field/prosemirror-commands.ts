import { findWrapping, liftTarget } from 'prosemirror-transform'
import { Fragment, NodeType, Slice } from 'prosemirror-model'
import { EditorState, NodeSelection, Transaction } from 'prosemirror-state'

// :: (NodeType, ?Object) → (state: EditorState, dispatch: ?(tr: Transaction)) → bool
// Wrap the selection in a node of the given type with the given
// attributes.
export function wrapInIfNeeded(nodeType: NodeType, attrs?: { [key: string]: unknown }) {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const { $from, $to, to } = state.selection
		const range = $from.blockRange($to)
		if (!range) {
			return false
		}
		const same = range.$from.sharedDepth(to)
		if (same) {
			const pos = $from.before(same)
			if (NodeSelection.create(state.doc, pos).$from?.node()?.type === nodeType) {
				return false
			}
		}

		const wrapping = range && findWrapping(range, nodeType, attrs)
		if (!wrapping || !range) return false
		if (dispatch) dispatch(state.tr.wrap(range, wrapping).scrollIntoView())
		return true
	}
}

// :: (NodeType, ?Object) → (state: EditorState, dispatch: ?(tr: Transaction)) → bool
// Wrap the selection in a node of the given type with the given
// attributes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function unwrapFrom(nodeType: NodeType) {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const { $from, $to } = state.selection
		const range = $from.blockRange($to)
		const depth = range && liftTarget(range)

		if (depth === null || depth === undefined) {
			return false
		}

		const gapStart = $from.before(depth + 1),
			gapEnd = $to.after(depth + 1)
		const frag = Fragment.from($from.node())

		if (dispatch) dispatch(state.tr.replaceRange(gapStart, gapEnd, new Slice(frag, 0, 0)).scrollIntoView())
		return true
	}
}
