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
