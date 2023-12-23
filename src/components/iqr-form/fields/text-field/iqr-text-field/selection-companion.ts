import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'

export class SelectionCompanion {
	private readonly companion: HTMLDivElement
	private delay: () => boolean = () => false
	private lastTime = 0

	constructor(view: EditorView, delay: () => boolean) {
		this.companion = document.createElement('div')
		this.companion.className = 'companion'

		view.dom?.parentNode?.appendChild(this.companion)

		this.delay = delay

		this.update(view, undefined)
	}

	update(view: EditorView, lastState?: EditorState): void {
		const state = view.state
		// Don't do anything if the document/selection didn't change
		if (lastState && lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection)) {
			return
		}

		// Hide the companion if the selection is empty
		if (state.selection.empty) {
			this.companion.style.display = 'none'
			return
		}

		// Otherwise, reposition it and update its content
		const { to } = state.selection
		// These are in screen coordinates
		const end = view.coordsAtPos(to)
		this.display(end, (this.lastTime = +new Date()))
	}

	private display(pos: { left: number; right: number; top: number; bottom: number }, time: number) {
		if (time !== this.lastTime) return
		if (this.delay()) {
			setTimeout(() => this.display(pos, time), 100)
			return
		}
		this.companion.style.display = ''
		const box = this.companion.offsetParent?.getBoundingClientRect()
		if (box) {
			this.companion.style.left = pos.right - box.left + 'px'
			this.companion.style.top = pos.top - box.top - 2 + 'px'
			this.companion.style.height = pos.bottom - pos.top + 2 + 'px'
			this.companion.textContent = '+'
		}
	}

	destroy(): void {
		this.companion.remove()
	}
}
