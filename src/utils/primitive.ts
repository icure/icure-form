import { PrimitiveType } from '../components/model'
import { anyDateToDate } from './dates'

export const normalizeUnit = (value: number, unit?: string): number => {
	if (!unit) {
		return value
	}
	switch (unit) {
		case 'kg':
			return value
		case 'g':
			return value / 1000
		case 'mg':
			return value / 1000000
		case 'l':
			return value
		case 'ml':
			return value / 1000
		case 'cl':
			return value / 100
		case 'm':
			return value
		case 'cm':
			return value / 100
		case 'mm':
			return value / 1000
		case 's':
			return value
		case 'min':
			return value * 60
		case 'h':
			return value * 60 * 60
		case 'd':
			return value * 60 * 60 * 24
		case 'week':
			return value * 60 * 60 * 24 * 7
		case 'month':
			return value * 60 * 60 * 24 * 30
		case 'year':
			return value * 60 * 60 * 24 * 365.25
	}
	return value
}

/** What a formula sees of a schema drawing: its stencil and its number of strokes, nothing else. */
export interface ParsedSchemaDrawing {
	stencil: string | null
	strokes: number
}

export type ParsedPrimitiveType = number | string | boolean | Date | ParsedSchemaDrawing | ParsedPrimitiveType[]
export const parsePrimitive = (value: PrimitiveType, toString = false, language?: string): ParsedPrimitiveType | undefined => {
	switch (value.type) {
		case 'measure':
			return value.value || value.value === 0 ? (toString ? `${value.value} ${value.unit ?? ''}` : normalizeUnit(+value.value, value.unit)) : undefined
		case 'datetime':
			return toString ? anyDateToDate(value.value)?.toLocaleString() : anyDateToDate(value.value)
		case 'timestamp':
			return toString ? anyDateToDate(value.value)?.toLocaleString() : anyDateToDate(value.value)
		case 'number':
			return toString ? (+value.value).toString() : +value.value
		case 'boolean':
			return toString ? value.value.toString() : value.value
		case 'string':
			return toString ? value.value.toString() : value.value
		case 'compound':
			return Object.values(value.value)
				.map((x) => parsePrimitive(x, toString, language))
				.filter((x) => x !== undefined) as ParsedPrimitiveType[]
		case 'schema': {
			const strokes = value.value?.strokes?.length ?? 0
			return toString ? `${strokes}` : { stencil: value.value?.stencil ?? null, strokes }
		}
	}
}
