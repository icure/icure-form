import { MarkSpec, NodeSpec } from 'prosemirror-model'

export function reduceNodes(nodes: { [key: string]: NodeSpec }, selector: (key: string, spec: NodeSpec) => boolean = () => true): { [key: string]: NodeSpec } {
	return Object.keys(nodes).reduce((r, k) => (selector(k, nodes[k]) ? Object.assign(r, { [k]: nodes[k] }) : r), {} as { [key: string]: NodeSpec })
}

export function reduceMarks(marks: { [key: string]: MarkSpec }, selector: (key: string, spec: MarkSpec) => boolean = () => true): { [key: string]: MarkSpec } {
	return Object.keys(marks).reduce((r, k) => (selector(k, marks[k]) ? Object.assign(r, { [k]: marks[k] }) : r), {} as { [key: string]: MarkSpec })
}
