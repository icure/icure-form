import { MarkSpec } from 'prosemirror-model'
import OrderedMap from 'orderedmap'

export function hasMark(ms: { [key: string]: MarkSpec } | OrderedMap<MarkSpec> | null | undefined, mark: string): boolean {
	if (!ms) {
		return false
	}
	if (!!ms.get) {
		return !!(ms as OrderedMap<MarkSpec>).get(mark)
	} else {
		return !!ms[mark]
	}
}
