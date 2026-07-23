import { format, isValid, parse } from 'date-fns'
import { PrimitiveType } from '../model'

/**
 * Convert a `dd/MM/yyyy` text into a `datetime` primitive.
 *
 * Returns `undefined` for empty or unparseable input. `parse` yields an
 * Invalid Date when the text is not a valid date, and `format` throws
 * `RangeError: Invalid time value` on such a value, so we guard with
 * `isValid` before formatting.
 */
export const extractDatePrimitive = (text: string | undefined): PrimitiveType | undefined => {
	if (!text) return undefined
	const parsed = parse(text, 'dd/MM/yyyy', new Date())
	return isValid(parsed) ? { type: 'datetime', value: parseInt(format(parsed, 'yyyyMMdd')) } : undefined
}

/**
 * Convert a `HH:mm:ss` text into a `datetime` primitive holding a `HHmmss`
 * value. Placeholder text (starting with `--:`) and unparseable input yield
 * `undefined`. See {@link extractDatePrimitive} for the `isValid` rationale.
 */
export const extractTimePrimitive = (text: string | undefined): PrimitiveType | undefined => {
	if (!text || text.startsWith('--:')) return undefined
	const parsed = parse(text.replaceAll('-', '0'), 'HH:mm:ss', new Date())
	return isValid(parsed) ? { type: 'datetime', value: parseInt(format(parsed, 'HHmmss')) } : undefined
}

/**
 * Convert a `dd/MM/yyyy` date text and a `HH:mm:ss` time text into a `datetime`
 * primitive holding a `yyyyMMddHHmmss` value. Missing parts or unparseable
 * input yield `undefined`. See {@link extractDatePrimitive} for the `isValid`
 * rationale.
 */
export const extractDateTimePrimitive = (dateText: string | undefined, timeText: string | undefined): PrimitiveType | undefined => {
	if (!dateText || !timeText) return undefined
	const parsed = parse(dateText + ' ' + timeText, 'dd/MM/yyyy HH:mm:ss', new Date())
	return isValid(parsed) ? { type: 'datetime', value: parseInt(format(parsed, 'yyyyMMddHHmmss')) } : undefined
}

export type DateTimeSchemaName = 'date' | 'time' | 'date-time'

/** True for the three schemas whose text is parsed into a datetime primitive. */
export const isDateTimeSchemaName = (schema: string): schema is DateTimeSchemaName => schema === 'date' || schema === 'time' || schema === 'date-time'

/**
 * True when the text carries at least one entered digit, i.e. it is more than
 * the empty mask (`--/--/----`, `--:--:--`). This is what separates an empty
 * field (passes) from one the user typed into.
 */
export const hasEnteredValue = (text: string | undefined): boolean => /\d/.test(text ?? '')

/**
 * True when a date/time field has been typed into but its text does not parse
 * to a value. `extracted` is the result the field already computed with the
 * matching `extract*Primitive` helper. Empty/all-mask input is not invalid.
 * For `date-time`, either part carrying a digit counts as "entered".
 */
export const isInvalidDateTimeInput = (schema: string, firstText: string | undefined, lastText: string | undefined, extracted: PrimitiveType | undefined): boolean => {
	if (!isDateTimeSchemaName(schema)) return false
	const entered = schema === 'date-time' ? hasEnteredValue(firstText) || hasEnteredValue(lastText) : hasEnteredValue(firstText)
	return entered && extracted === undefined
}
