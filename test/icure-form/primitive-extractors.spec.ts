import { extractDatePrimitive, extractDateTimePrimitive, extractTimePrimitive } from '../../src/components/icure-text-field/primitive-extractors'

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
})
