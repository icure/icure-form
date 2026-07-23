import {
	extractDatePrimitive,
	extractDateTimePrimitive,
	extractTimePrimitive,
	isDateTimeSchemaName,
	hasEnteredValue,
	isInvalidDateTimeInput,
} from '../../src/components/icure-text-field/primitive-extractors'

describe('primitive extractors', () => {
	describe('extractDatePrimitive', () => {
		it('converts a valid date', () => {
			expect(extractDatePrimitive('25/12/2023')).toEqual({ type: 'datetime', value: 20231225 })
		})
		it('returns undefined for empty input', () => {
			expect(extractDatePrimitive('')).toBeUndefined()
			expect(extractDatePrimitive(undefined)).toBeUndefined()
		})
		it('returns undefined for an invalid date without throwing', () => {
			expect(() => extractDatePrimitive('99/99/9999')).not.toThrow()
			expect(extractDatePrimitive('99/99/9999')).toBeUndefined()
			expect(extractDatePrimitive('not a date')).toBeUndefined()
		})
	})

	describe('extractTimePrimitive', () => {
		it('converts a valid time', () => {
			expect(extractTimePrimitive('14:30:15')).toEqual({ type: 'datetime', value: 143015 })
		})
		it('treats dashes as zeroes', () => {
			expect(extractTimePrimitive('14:30:--')).toEqual({ type: 'datetime', value: 143000 })
		})
		it('returns undefined for placeholder and empty input', () => {
			expect(extractTimePrimitive('--:--:--')).toBeUndefined()
			expect(extractTimePrimitive('')).toBeUndefined()
			expect(extractTimePrimitive(undefined)).toBeUndefined()
		})
		it('returns undefined for an invalid time without throwing', () => {
			expect(() => extractTimePrimitive('99:99:99')).not.toThrow()
			expect(extractTimePrimitive('99:99:99')).toBeUndefined()
		})
	})

	describe('extractDateTimePrimitive', () => {
		it('converts a valid date-time', () => {
			expect(extractDateTimePrimitive('25/12/2023', '14:30:15')).toEqual({ type: 'datetime', value: 20231225143015 })
		})
		it('returns undefined when a part is missing', () => {
			expect(extractDateTimePrimitive('25/12/2023', '')).toBeUndefined()
			expect(extractDateTimePrimitive('', '14:30:15')).toBeUndefined()
			expect(extractDateTimePrimitive(undefined, undefined)).toBeUndefined()
		})
		it('returns undefined for invalid input without throwing', () => {
			expect(() => extractDateTimePrimitive('99/99/9999', '99:99:99')).not.toThrow()
			expect(extractDateTimePrimitive('99/99/9999', '99:99:99')).toBeUndefined()
		})
	})

	describe('isDateTimeSchemaName', () => {
		it('recognises the three date/time schemas', () => {
			expect(isDateTimeSchemaName('date')).toBe(true)
			expect(isDateTimeSchemaName('time')).toBe(true)
			expect(isDateTimeSchemaName('date-time')).toBe(true)
		})
		it('rejects other schemas', () => {
			expect(isDateTimeSchemaName('measure')).toBe(false)
			expect(isDateTimeSchemaName('styled-text-with-codes')).toBe(false)
		})
	})

	describe('hasEnteredValue', () => {
		it('is false for the empty mask and empty/undefined input', () => {
			expect(hasEnteredValue('--/--/----')).toBe(false)
			expect(hasEnteredValue('--:--:--')).toBe(false)
			expect(hasEnteredValue('')).toBe(false)
			expect(hasEnteredValue(undefined)).toBe(false)
		})
		it('is true once any digit is entered', () => {
			expect(hasEnteredValue('25/--/----')).toBe(true)
			expect(hasEnteredValue('14:30:15')).toBe(true)
		})
	})

	describe('isInvalidDateTimeInput', () => {
		it('is false for non-date/time schemas', () => {
			expect(isInvalidDateTimeInput('measure', 'abc', undefined, undefined)).toBe(false)
		})
		it('is false for the empty mask (empty, not invalid)', () => {
			expect(isInvalidDateTimeInput('date', '--/--/----', undefined, extractDatePrimitive('--/--/----'))).toBe(false)
			expect(isInvalidDateTimeInput('time', '--:--:--', undefined, extractTimePrimitive('--:--:--'))).toBe(false)
			expect(isInvalidDateTimeInput('date-time', '--/--/----', '--:--:--', extractDateTimePrimitive('--/--/----', '--:--:--'))).toBe(false)
		})
		it('is false for valid entered values', () => {
			expect(isInvalidDateTimeInput('date', '25/12/2023', undefined, extractDatePrimitive('25/12/2023'))).toBe(false)
			expect(isInvalidDateTimeInput('time', '14:30:15', undefined, extractTimePrimitive('14:30:15'))).toBe(false)
			expect(isInvalidDateTimeInput('date-time', '25/12/2023', '14:30:15', extractDateTimePrimitive('25/12/2023', '14:30:15'))).toBe(false)
		})
		it('is true for non-empty unparseable values', () => {
			expect(isInvalidDateTimeInput('date', '99/99/9999', undefined, extractDatePrimitive('99/99/9999'))).toBe(true)
			expect(isInvalidDateTimeInput('time', '25:59:99', undefined, extractTimePrimitive('25:59:99'))).toBe(true)
		})
		it('treats a partially-filled date-time as invalid', () => {
			expect(isInvalidDateTimeInput('date-time', '25/12/2023', '--:--:--', extractDateTimePrimitive('25/12/2023', '--:--:--'))).toBe(true)
		})
	})
})
