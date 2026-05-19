import { SchemaSpec as ProseMirrorSchemaSpec } from 'prosemirror-model'
import { SchemaSpec } from './schema-spec'

export type DateSchema = 'date'
export type TimeSchema = 'time'
export type DateTimeSchema = 'date-time'

export function getDateSpec(): ProseMirrorSchemaSpec {
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

export function getTimeSpec(): ProseMirrorSchemaSpec {
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

export function getDateTimeSpec(): ProseMirrorSchemaSpec {
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

export const dateSchemaSpec: SchemaSpec = {
	proseMirror: getDateSpec(),
	multivalue: false,
}

export const timeSchemaSpec: SchemaSpec = {
	proseMirror: getTimeSpec(),
	multivalue: false,
}

export const dateTimeSchemaSpec: SchemaSpec = {
	proseMirror: getDateTimeSpec(),
	multivalue: false,
}
