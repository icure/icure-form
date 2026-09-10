import equal from 'fast-deep-equal'

import { EditorView } from 'prosemirror-view'
import { EditorState, Transaction } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { Suggestion } from '../../generic'
import { emptyTreeState, parentPath, replacementTerms, reveal, SuggestionRow, toggleExpanded, TreePath, TreeUiState, visibleRows } from '../../utils/suggestion-tree'
import { suggestionQueryStart } from './suggestion-query'

export type SuggestionInsertHandler = (from: number, to: number, sug: Suggestion) => Promise<Transaction | undefined>

const TAB_ICN =
	'<svg class="tab-icn" viewBox="0 0 24 24"><path d="M12.29 8.12L15.17 11H2c-.55 0-1 .45-1 1s.45 1 1 1h13.17l-2.88 2.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l4.59-4.59c.39-.39.39-1.02 0-1.41L13.7 6.7c-.39-.39-1.02-.39-1.41 0-.38.39-.39 1.03 0 1.42zM20 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg>'
const RETURN_ICN =
	'<svg class="return-icn" viewBox="0 0 24 24"><path d="M19 8v3H5.83l2.88-2.88c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0L2.71 11.3c-.39.39-.39 1.02 0 1.41L7.3 17.3c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L5.83 13H20c.55 0 1-.45 1-1V8c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg>'
const CHEVRON_SVG = '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * The floating autocomplete list under a text or token field.
 *
 * Rows are the visible rows of the provider's result tree (see src/utils/suggestion-tree.ts): nodes at any depth plus
 * "N more" rows, in one flat `<ul>` so keyboard focus is an index into `rows`. Keyboard: Tab focuses the list or inserts
 * the focused row, ↑/↓ move, → expands a collapsed node, ← collapses an expanded node or moves to the parent, Enter
 * inserts (or reveals on a "N more" row). Pointer: `mousedown` on a chevron toggles, on a "N more" row reveals, on a row
 * inserts; the event is prevented so the editor keeps focus and selection (the palette hides itself on any editor
 * update where the text did not change). Flat results render the same elements and classes as before hierarchy existed.
 */
export class SuggestionPalette {
	private readonly palette: HTMLDivElement
	private readonly view: EditorView
	private readonly insertHandler?: SuggestionInsertHandler
	private delay: () => boolean = () => false
	private lastTime = 0
	private suggestionProvider: (terms: string[]) => Promise<Suggestion[]>
	private previousFingerprint?: string

	private suggestionStopWordsProvider: () => Set<string>
	private currentFocus?: number
	private hasFocus = false
	private roots: Suggestion[] = []
	private rows: SuggestionRow[] = []
	private treeState: TreeUiState = emptyTreeState()
	private lastQueryTerms: string[] = []
	private schema: Schema

	constructor(
		schema: Schema,
		view: EditorView,
		suggestionProvider: (terms: string[]) => Promise<Suggestion[]>,
		suggestionStopWordsProvider: () => Set<string>,
		delay?: () => boolean,
		insertHandler?: SuggestionInsertHandler,
	) {
		this.schema = schema
		this.view = view
		this.insertHandler = insertHandler
		this.suggestionStopWordsProvider = suggestionStopWordsProvider
		this.suggestionProvider = suggestionProvider
		this.palette = document.createElement('div')
		this.palette.className = 'suggestion-palette'
		this.palette.addEventListener('mousedown', (event) => this.onMouseDown(event))

		view.dom?.parentNode?.appendChild(this.palette)

		delay && (this.delay = delay)

		this.update(view, undefined)
	}

	focusItem(idx?: number): void {
		const ul = this.palette.getElementsByTagName('ul')[0]
		if (ul) {
			ul.classList.toggle('focused', idx !== undefined)
			const lis = ul.getElementsByTagName('li')
			Array.from(lis).forEach((li) => li.classList.remove('focused'))
			idx !== undefined && lis[idx]?.classList.add('focused')
			this.currentFocus = idx
		}
	}

	focus(): boolean {
		if (this.palette.style.display === 'none') return false
		this.hasFocus = true
		this.focusItem(0)
		return true
	}

	focusOrInsert(view: EditorView, transactionProvider: SuggestionInsertHandler): boolean {
		if (this.palette.style.display === 'none') return false
		return this.hasFocus ? this.insert(view, transactionProvider) : this.focus()
	}

	insert(view: EditorView, transactionProvider: SuggestionInsertHandler): boolean {
		if (this.palette.style.display === 'none' || !this.hasFocus || this.currentFocus === undefined) return false
		const row = this.rows[this.currentFocus]
		if (!row) return false
		if (row.kind === 'more') {
			this.treeState = reveal(this.treeState, row.path)
			this.rerender()
			return true
		}
		return this.insertSuggestion(view, row.suggestion, transactionProvider)
	}

	arrowUp(): boolean {
		if (!this.hasFocus) return false
		this.currentFocus && this.focusItem(this.currentFocus - 1)
		return true
	}

	arrowDown(): boolean {
		if (!this.hasFocus) return false
		this.currentFocus !== undefined && this.currentFocus < this.rows.length - 1 && this.focusItem(this.currentFocus + 1)
		return true
	}

	/** Expands the focused node when it is collapsed. Consumed only while the palette has focus. */
	arrowRight(): boolean {
		if (!this.hasFocus) return false
		const row = this.focusedRow()
		if (row?.kind === 'node' && row.hasChildren && !row.expanded) {
			this.treeState = toggleExpanded(this.treeState, row.path, false)
			this.rerender({ path: row.path, kind: 'node' })
		}
		return true
	}

	/** Collapses the focused node when it is expanded, otherwise moves focus to its parent. Consumed only while focused. */
	arrowLeft(): boolean {
		if (!this.hasFocus) return false
		const row = this.focusedRow()
		if (!row) return true
		if (row.kind === 'node' && row.expanded) {
			this.treeState = toggleExpanded(this.treeState, row.path, true)
			this.rerender({ path: row.path, kind: 'node' })
			return true
		}
		const parent = row.kind === 'more' ? row.path : parentPath(row.path)
		const idx = parent === undefined ? -1 : this.rows.findIndex((r) => r.kind === 'node' && r.path === parent)
		idx >= 0 && this.focusItem(idx)
		return true
	}

	update(view: EditorView, lastState?: EditorState): void {
		const state = view.state

		// Hide the palette if the selection is not empty
		this.focusItem(undefined)
		this.hasFocus = false

		// The palette belongs to a focused editor. A plugin view is re-created (with this constructor's initial update)
		// whenever the field rebuilds its editor state, e.g. after the blur that saves the value; without this guard the
		// new palette would search the current text and open under an editor the user has just left.
		if (!view.hasFocus()) {
			this.palette.style.display = 'none'
			return
		}

		if (!state.selection.empty) {
			this.palette.style.display = 'none'
			return
		}

		const $pos = state.selection.$head
		if (lastState?.doc.textContent === state.doc.textContent) {
			this.palette.style.display = 'none'
			return
		}

		// The query is the text typed since the last linked (already coded) word of the paragraph, not the whole paragraph.
		const paragraphStart = $pos.pos && $pos.depth ? $pos.before() + 1 : 0
		const text = state.doc.textBetween(suggestionQueryStart(state.doc, paragraphStart, $pos.pos, this.schema.marks['link']), $pos.pos)

		const words = text.split(/\s+/)
		const lastWordDelta = Math.min(
			words
				.concat()
				.reverse()
				.reduce((d, w) => (d < 0 ? d : w.length ? -d - w.length : d + 1), 0),
			-1,
		)
		if ($pos.pos > 1 && state.doc.rangeHasMark($pos.pos + lastWordDelta, $pos.pos, this.schema.marks['link'])) {
			this.palette.style.display = 'none'
			return
		}

		const terms = words.filter((x) => x.length > 2 && !this.suggestionStopWordsProvider().has(x))
		const lastTerms = terms.length > 3 ? terms.slice(-3) : terms
		const fingerprint = lastTerms.join(' ')

		const { to } = state.selection

		// Nothing to search yet: the palette only opens on typed words, so do not ask the provider (a provider answering
		// an empty query with its whole tree, as the dropdown's does, would otherwise open the palette on nothing).
		if (!lastTerms.length) {
			this.previousFingerprint = fingerprint
			this.palette.style.display = 'none'
			return
		}

		if (this.previousFingerprint !== fingerprint) {
			this.previousFingerprint = fingerprint
			// A new search: forget manual toggles and reveals.
			this.treeState = emptyTreeState()
			this.lastQueryTerms = lastTerms
			setTimeout(async () => {
				if (this.previousFingerprint !== fingerprint) return
				const res = await this.suggestionProvider(lastTerms)
				this.roots = res
				if (res.length) {
					this.render()
					// These are in screen coordinates
					const end = view.coordsAtPos(to)
					const start = view.coordsAtPos(Math.max(0, to - terms[terms.length - 1].length))

					this.display(start.left > end.left ? end : start, (this.lastTime = +new Date()))
				} else {
					this.palette.style.display = 'none'
				}
			}, 30)
		}
	}

	private focusedRow(): SuggestionRow | undefined {
		return this.currentFocus === undefined ? undefined : this.rows[this.currentFocus]
	}

	/** Rebuilds the `<ul>` from the current tree state. Does not touch focus. */
	private render(): void {
		this.rows = visibleRows(this.roots, true, this.treeState)
		const ul = document.createElement('ul')
		this.rows.forEach((row) => ul.appendChild(this.renderRow(row)))
		this.palette.replaceChildren(ul)
	}

	/** Re-renders after a toggle or reveal and keeps focus on the same row (by path), else on the same index. */
	private rerender(focusOn?: { path: TreePath; kind: SuggestionRow['kind'] }): void {
		const previous = this.currentFocus
		this.render()
		if (!this.hasFocus) return
		let idx = focusOn ? this.rows.findIndex((r) => r.path === focusOn.path && r.kind === focusOn.kind) : -1
		if (idx < 0 && previous !== undefined) idx = Math.min(previous, this.rows.length - 1)
		this.focusItem(idx >= 0 ? idx : undefined)
	}

	private renderRow(row: SuggestionRow): HTMLLIElement {
		const li = document.createElement('li')
		li.dataset.path = row.path
		if (row.kind === 'more') {
			li.className = 'more'
			li.style.setProperty('--depth', `${row.depth}`)
			li.setAttribute('aria-level', `${row.depth + 1}`)
			li.textContent = `… ${row.count} more`
			return li
		}
		const sug = row.suggestion
		li.id = sug.id
		li.setAttribute('data-code', `${sug.code}`)
		if (row.depth > 0 || row.hasChildren) {
			li.style.setProperty('--depth', `${row.depth}`)
			li.setAttribute('aria-level', `${row.depth + 1}`)
		}
		if (row.hasChildren) {
			const chevron = document.createElement('span')
			chevron.className = 'chevron'
			chevron.setAttribute('aria-expanded', `${row.expanded}`)
			chevron.innerHTML = CHEVRON_SVG
			li.appendChild(chevron)
		}
		li.appendChild(document.createTextNode(sug.text))
		const icons = document.createElement('div')
		icons.className = 'icn-container'
		icons.innerHTML = TAB_ICN + RETURN_ICN
		li.appendChild(icons)
		return li
	}

	private onMouseDown(event: MouseEvent): void {
		// Keep focus and selection in the editor: a blur or selection move would hide the palette before the action lands.
		event.preventDefault()
		const target = event.target as HTMLElement | null
		const li = target?.closest('li')
		if (!li) return
		const kind: SuggestionRow['kind'] = li.classList.contains('more') ? 'more' : 'node'
		const idx = this.rows.findIndex((r) => r.kind === kind && r.path === li.dataset.path)
		const row = this.rows[idx]
		if (!row) return
		if (row.kind === 'more') {
			this.treeState = reveal(this.treeState, row.path)
			this.rerender()
			return
		}
		if (target?.closest('.chevron') && row.hasChildren) {
			this.treeState = toggleExpanded(this.treeState, row.path, row.expanded)
			this.rerender({ path: row.path, kind: 'node' })
			return
		}
		this.hasFocus = true
		this.focusItem(idx)
		this.insertHandler && this.insertSuggestion(this.view, row.suggestion, this.insertHandler)
	}

	/**
	 * Replaces the typed occurrence of the suggestion's terms (own terms, else its first matched descendant's, else the
	 * query) with whatever the handler produces, then hides the palette.
	 */
	private insertSuggestion(view: EditorView, sug: Suggestion, transactionProvider: SuggestionInsertHandler): boolean {
		const sel = view.state.selection
		const stopWords = this.suggestionStopWordsProvider()
		const terms = replacementTerms(sug, this.lastQueryTerms)

		let length = terms.join(' ').length - 1
		while (
			sel.to - length >= 0 &&
			!equal(
				view.state.doc
					.textBetween(sel.to - length, sel.to)
					.split(/\s+/)
					.filter((x) => !stopWords.has(x)),
				terms,
			)
		) {
			length++
		}
		if (length > sel.to) {
			length = terms.join(' ').length
			while (sel.to - length >= 0 && !view.state.doc.textBetween(sel.to - length, sel.to).startsWith(terms[0])) {
				length++
			}
		}
		if (length <= sel.to) {
			transactionProvider(sel.to - length, sel.to, sug).then((tr) => tr && view.dispatch(tr.scrollIntoView()))
		}
		this.palette.style.display = 'none'
		return true
	}

	private display(pos: { left: number; right: number; top: number; bottom: number }, time: number): void {
		if (time !== this.lastTime) return
		if (this.delay()) {
			setTimeout(() => this.display(pos, time), 100)
			return
		}
		this.palette.style.display = ''
		const box = this.palette.offsetParent?.getBoundingClientRect()
		const palBox = this.palette.getBoundingClientRect()
		if (box) {
			this.palette.style.left = Math.max(0, Math.min(pos.left - box.left - 12, box.width - palBox.width)) + 'px'
			this.palette.style.top = pos.bottom - box.top + 4 + 'px'
		}
	}

	/** Hides the palette and drops its focus; used when the editor loses focus, which produces no ProseMirror transaction. */
	hide(): void {
		this.palette.style.display = 'none'
		this.hasFocus = false
		this.focusItem(undefined)
	}

	destroy(): void {
		this.palette.remove()
	}
}
