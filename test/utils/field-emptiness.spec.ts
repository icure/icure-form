import { isBlankPrimitive, isEmptyFieldValues, VALUE_BEARING_FIELD_TYPES } from '../../src/utils/field-emptiness'
import { FieldValue } from '../../src/components/model'
import { VersionedData } from '../../src/generic'

describe('VALUE_BEARING_FIELD_TYPES', () => {
	it('excludes label and action', () => {
		expect(VALUE_BEARING_FIELD_TYPES.has('label' as any)).toBe(false)
		expect(VALUE_BEARING_FIELD_TYPES.has('action' as any)).toBe(false)
	})

	it('includes value-bearing field types', () => {
		expect(VALUE_BEARING_FIELD_TYPES.has('text-field')).toBe(true)
		expect(VALUE_BEARING_FIELD_TYPES.has('measure-field')).toBe(true)
		expect(VALUE_BEARING_FIELD_TYPES.has('checkbox')).toBe(true)
	})
})

describe('isBlankPrimitive', () => {
	it('is blank for undefined', () => {
		expect(isBlankPrimitive(undefined)).toBe(true)
	})

	it('is blank for an empty string', () => {
		expect(isBlankPrimitive({ type: 'string', value: '' })).toBe(true)
	})

	it('is blank for a whitespace-only string', () => {
		expect(isBlankPrimitive({ type: 'string', value: '   ' })).toBe(true)
	})

	it('is not blank for a non-empty string', () => {
		expect(isBlankPrimitive({ type: 'string', value: 'a' })).toBe(false)
	})

	it('is blank for a NaN number', () => {
		expect(isBlankPrimitive({ type: 'number', value: NaN })).toBe(true)
	})

	it('is not blank for a zero number', () => {
		expect(isBlankPrimitive({ type: 'number', value: 0 })).toBe(false)
	})

	it('is not blank for a false boolean', () => {
		expect(isBlankPrimitive({ type: 'boolean', value: false })).toBe(false)
	})

	it('is blank for a boolean with undefined value', () => {
		expect(isBlankPrimitive({ type: 'boolean', value: undefined as any })).toBe(true)
	})

	it('is not blank for a timestamp of 0', () => {
		expect(isBlankPrimitive({ type: 'timestamp', value: 0 })).toBe(false)
	})

	it('is blank for a measure with undefined value even with a unit', () => {
		expect(isBlankPrimitive({ type: 'measure', value: undefined, unit: 'kg' })).toBe(true)
	})

	it('is not blank for a measure with a value', () => {
		expect(isBlankPrimitive({ type: 'measure', value: 70, unit: 'kg' })).toBe(false)
	})

	it('is blank for a compound with no members', () => {
		expect(isBlankPrimitive({ type: 'compound', value: {} })).toBe(true)
	})

	it('is not blank for a compound with one non-blank member', () => {
		expect(isBlankPrimitive({ type: 'compound', value: { flag: { type: 'boolean', value: true } } })).toBe(false)
	})

	it('is blank for a compound whose only member is a blank string', () => {
		expect(isBlankPrimitive({ type: 'compound', value: { note: { type: 'string', value: '' } } })).toBe(true)
	})
})

describe('isEmptyFieldValues', () => {
	it('is empty for undefined', () => {
		expect(isEmptyFieldValues(undefined)).toBe(true)
	})

	it('is empty for no ids', () => {
		expect(isEmptyFieldValues({})).toBe(true)
	})

	it('is empty for one id whose latest version has empty content and no codes', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: {} } }],
		}
		expect(isEmptyFieldValues(values)).toBe(true)
	})

	it('is empty for one id with a blank string in the content', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: { en: { type: 'string', value: '' } } } }],
		}
		expect(isEmptyFieldValues(values)).toBe(true)
	})

	it('is not empty when the only content is in a language other than en', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: { fr: { type: 'string', value: 'bonjour' } } } }],
		}
		expect(isEmptyFieldValues(values)).toBe(false)
	})

	it('is not empty when codes are present even with empty content', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: {}, codes: [{ id: 'X', label: {} }] } }],
		}
		expect(isEmptyFieldValues(values)).toBe(false)
	})

	it('is not empty for a preserved invalid date stored as a raw string', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: { en: { type: 'string', value: '31/02/2024' } } } }],
		}
		expect(isEmptyFieldValues(values)).toBe(false)
	})

	it('is not empty when one id is blank and another is not', () => {
		const values: VersionedData<FieldValue> = {
			id1: [{ revision: '1', value: { content: { en: { type: 'string', value: '' } } } }],
			id2: [{ revision: '1', value: { content: { en: { type: 'string', value: 'filled' } } } }],
		}
		expect(isEmptyFieldValues(values)).toBe(false)
	})

	it('is empty when only the most recent version is considered, even if an older version is filled', () => {
		const values: VersionedData<FieldValue> = {
			id1: [
				{ revision: '2', value: { content: { en: { type: 'string', value: '' } } } },
				{ revision: '1', value: { content: { en: { type: 'string', value: 'old value' } } } },
			],
		}
		expect(isEmptyFieldValues(values)).toBe(true)
	})

	it('is empty for an id with an empty versions array', () => {
		const values: VersionedData<FieldValue> = {
			id1: [],
		}
		expect(isEmptyFieldValues(values)).toBe(true)
	})
})
