import { Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
export const hasContentClassPlugin = function (root?: DocumentFragment): Plugin {
	return new Plugin({
		view: (v: EditorView) => {
			v.state.doc.textContent && v.state.doc.textContent.length && (root?.getElementById('root') as HTMLElement)?.classList?.add('has-content')
			return {
				update: (v: EditorView) => {
					v.state.doc.textContent && v.state.doc.textContent.length
						? (root?.getElementById('root') as HTMLElement)?.classList?.add('has-content')
						: (root?.getElementById('root') as HTMLElement)?.classList?.remove('has-content')
				},
			}
		},
	})
}
