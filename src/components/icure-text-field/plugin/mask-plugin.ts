import { EditorState, Plugin, TextSelection, Transaction } from 'prosemirror-state'
import { Node, ResolvedPos } from 'prosemirror-model'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'

export const maskPlugin = function (): Plugin {
	const maskText = ($pos: ResolvedPos, text: string, mask: string, tr: Transaction, setSelection = true) => {
		const textFromBeginning = $pos.parent.textBetween(0, $pos.parentOffset) + text
		const trailingText = $pos.parent.textBetween($pos.parentOffset, $pos.parent.content.size)

		let t = textFromBeginning
		let skip = 0
		let completed = false

		if (t.length === 0) {
			t += trailingText.substring(text.length + skip)
			completed = true
		}

		for (let i = 0; i < mask.length && i < t.length; i++) {
			if (
				(mask[i] === '.' &&
					t[i]
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '')
						.match(/\w|-/)) ||
				(mask[i] === '-' && t[i].match(/\d/))
			) {
				//skip
			} else {
				if (mask[i] === t[i]) {
					//skip
				} else {
					t = t.substring(0, i) + mask[i] + t.substring(i)
					if (!completed) skip++
				}
			}
			if (t.length === i + 1 && !completed) {
				t += trailingText.substring(text.length + skip)
				completed = true
			}
		}

		const tail = t.length > mask.length ? t.substring(mask.length) : ''
		t = t.substring(0, mask.length)

		const trail = t.length < mask.length ? mask.substring(t.length) : ''
		if (t === textFromBeginning && trail === trailingText) {
			return undefined
		}

		const currentSel = tr.selection

		tr = tr.insertText(t + trail, $pos.pos - $pos.parentOffset, $pos.pos - $pos.parentOffset + $pos.parent.content.size)
		if (setSelection) {
			tr = tr.setSelection(TextSelection.create(tr.doc, Math.min($pos.pos + text.length + skip, tr.doc.content.size - 1)))
		} else {
			tr = tr.setSelection(TextSelection.create(tr.doc, Math.min(currentSel.$anchor.pos, tr.doc.content.size - 1), Math.min(currentSel.$head.pos, tr.doc.content.size - 1)))
		}
		tr.setMeta('tailText', tail)

		return tr
	}

	function applyDocMasks(state: EditorState): Transaction | undefined {
		let tr = undefined
		let posMark = 0
		//Scan nodes and add mask when needed
		while ((tr || state).doc && posMark < (tr || state).doc.content.size) {
			const $pos = (tr || state).doc.resolve(posMark)
			const node: Node | undefined = $pos.node($pos.depth) || undefined
			const mask: string | undefined = node?.type.spec.mask
			if (mask) {
				tr = tr || state.tr
				tr = maskText(tr.doc.resolve(posMark), '', mask, tr, false) || tr
				const $newPos = tr.doc.resolve(posMark)
				const newNode = $newPos.node($newPos.depth)
				if (newNode) {
					posMark += newNode.content.size + 1
				} else posMark++
			} else {
				posMark++
			}
		}
		return tr
	}

	return new Plugin({
		view: (v: EditorView) => {
			const tr = applyDocMasks(v.state)
			if (tr) v.updateState(v.state.apply(tr))
			return {}
		},
		props: {
			decorations(state) {
				let $pos = state.doc.resolve(Math.min(state.selection.$from.pos, state.doc.content.size))
				let node = $pos.parent
				let start = $pos.pos - $pos.parentOffset

				if (node.type.spec.mask) {
					if (node.type.spec.mask.length === $pos.parentOffset && node.type.spec.mask.length === node.content.size) {
						//Move to the next one
						while ($pos.pos < state.doc.content.size - 1) {
							$pos = state.doc.resolve($pos.pos + 1)
							node = $pos.parent

							if (node && node.type.spec.mask) {
								start = $pos.pos - $pos.parentOffset
								break
							}
						}
					}

					return DecorationSet.create(state.doc, [Decoration.node(start - 1, start - 1 + node.nodeSize, { class: 'focused' })])
				}
				return undefined
			},
			handleTextInput: (view, from, to, text) => {
				if (view.composing) return false

				const state = view.state
				const $from = state.doc.resolve(from)
				const mask = $from.parent.type.spec.mask
				const regexp = $from.parent.type.spec.regexp

				if (!mask) return false

				const tr = maskText(
					$from,
					regexp && regexp.length
						? text
								.split('')
								.filter((x) => x.match(new RegExp(regexp)))
								.join('')
						: text,
					mask,
					state.tr,
				)
				if (tr) {
					const tail: string = tr.getMeta('tailText')
					if (tail?.length) {
						const nextPos = tr.selection.$to.pos < tr.doc.content.size ? tr.doc.resolve(tr.selection.$to.pos + 1) : undefined
						if (nextPos) {
							const nextNode = nextPos.node(nextPos.depth)
							if (nextNode && nextNode.type.spec.mask && nextNode.type.spec.mask.length) {
								maskText(nextPos, tail, nextNode.type.spec.mask, tr)
							} else if (nextNode && (nextNode.type.isText || nextNode.type.isTextblock)) {
								tr.insertText(tail, nextPos.pos, nextPos.pos)
							}
						}
					}
					view.dispatch(tr)
					return true
				}
				return false
			},
		},
		appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
			return applyDocMasks(newState)
		},
	})
}
