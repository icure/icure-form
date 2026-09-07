import { Field, FieldValue, PrimitiveType } from '../components/model'
import { VersionedData } from '../generic'

// `FieldType` is not exported from `src/components/model`; `Field['type']` picks up the exact same union
// from the `type` property of the `Field` class without duplicating it here.
type FieldType = Field['type']

type NonValueBearingFieldType = 'label' | 'action'

// `Record<Exclude<FieldType, NonValueBearingFieldType>, true>` requires this literal to have exactly one
// key per value-bearing member of the `FieldType` union: adding, removing or renaming a `FieldType` member
// makes this object literal fail to type-check (missing or excess property) until it is updated here.
const VALUE_BEARING_FIELD_TYPES_MAP: Record<Exclude<FieldType, NonValueBearingFieldType>, true> = {
	'text-field': true,
	'measure-field': true,
	'number-field': true,
	'token-field': true,
	'items-list-field': true,
	'date-picker': true,
	'time-picker': true,
	'date-time-picker': true,
	'multiple-choice': true,
	'dropdown-field': true,
	'radio-button': true,
	checkbox: true,
}

export const VALUE_BEARING_FIELD_TYPES: ReadonlySet<FieldType> = new Set(Object.keys(VALUE_BEARING_FIELD_TYPES_MAP) as FieldType[])

/**
 * A primitive is blank when it carries no displayable answer: absent, an empty/whitespace-only
 * string, a non-finite number or measure magnitude, or an unset boolean/timestamp/datetime.
 * A compound is blank when every one of its members is blank (a compound with no members is blank).
 */
export function isBlankPrimitive(p: PrimitiveType | undefined): boolean {
	if (p === undefined) return true
	switch (p.type) {
		case 'string':
			return p.value.trim().length === 0
		case 'number':
		case 'measure': {
			const value = p.value as number | undefined
			return value === undefined || Number.isNaN(value)
		}
		case 'boolean':
		case 'timestamp':
		case 'datetime': {
			const value = p.value as unknown
			return value === undefined
		}
		case 'compound':
			return Object.values(p.value).every((member) => isBlankPrimitive(member))
	}
}

/**
 * `true` when the stored values amount to no displayable answer for read-only review: `values` is
 * `undefined` or has no ids, or every id's most recent version (`versions[0]`) is either missing or
 * carries no codes and only blank content (in every language). Older versions are never consulted.
 */
export function isEmptyFieldValues(values: VersionedData<FieldValue> | undefined): boolean {
	if (values === undefined) return true
	const ids = Object.keys(values)
	if (ids.length === 0) return true
	return ids.every((id) => {
		const latest = values[id]?.[0]
		if (latest === undefined) return true
		const { content, codes } = latest.value
		return (codes ?? []).length === 0 && Object.values(content).every((p) => isBlankPrimitive(p))
	})
}
