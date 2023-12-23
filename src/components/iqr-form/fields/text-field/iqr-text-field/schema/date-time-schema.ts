import { SchemaSpec } from 'prosemirror-model'

export type DateSchema = 'date'
export type TimeSchema = 'time'
export type DateTimeSchema = 'date-time'

export function getDateSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'date',
			},

			date: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', 0]
				},
				regexp: '[0-9]',
				mask: '--/--/----',
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}

export function getTimeSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'time',
			},

			time: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', 0]
				},
				regexp: '[0-9]',
				mask: '--:--:--',
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}

export function getDateTimeSpec(): SchemaSpec {
	return {
		topNode: 'paragraph',
		nodes: {
			paragraph: {
				content: 'date time',
			},

			date: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', { class: 'date' }, 0]
				},
				regexp: '[0-9]',
				mask: '--/--/----',
			},

			time: {
				content: 'inline*',
				group: 'block',
				parseDOM: [{ tag: 'span' }],
				toDOM() {
					return ['span', { class: 'time' }, 0]
				},
				regexp: '[0-9]',
				mask: '--:--:--',
			},

			text: {
				group: 'inline',
			},
		},
		marks: {},
	}
}
