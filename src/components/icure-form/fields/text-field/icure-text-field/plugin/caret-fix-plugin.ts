import { Plugin } from 'prosemirror-state'
export const caretFixPlugin = function (): Plugin {
	let focusing = false
	return new Plugin({
		props: {
			handleDOMEvents: {
				focus: (view) => {
					if (focusing) {
						focusing = false
					} else {
						focusing = true
						setTimeout(() => {
							;(view.dom as HTMLElement).blur()
							;(view.dom as HTMLElement).focus()
						}, 0)
					}
					return false
				},
			},
		},
	})
}
