import { FieldMetadata, FieldValue } from '../../../model'
import { Version, VersionedData } from '../../../../generic'

export const singleValueProvider = (valueProvider?: () => VersionedData<FieldValue>, id?: string) =>
	valueProvider &&
	(() =>
		id && valueProvider
			? {
					id: valueProvider()[id],
			  }
			: {})

export const handleSingleValueChanged = (handleValueChanged?: (label: string, language: string, value: FieldValue, id?: string) => string | undefined, id?: string) =>
	handleValueChanged && ((label: string, language: string, value: FieldValue) => handleValueChanged?.(label, language, value, id))

export const handleSingleMetadataChanged = (handleMetadataChanged?: (label: string, metadata: FieldMetadata, id?: string) => string | undefined, id?: string) =>
	handleMetadataChanged && ((label: string, value: FieldMetadata) => handleMetadataChanged?.(label, value, id))

export const extractSingleValue = <V extends FieldValue>(value?: VersionedData<V>, id?: string): [string, Version<V>[]] | [undefined, undefined] => {
	if (!value) {
		return [undefined, undefined]
	}
	if (id && value[id]) {
		return [id, value[id]]
	} else {
		if (Object.keys(value).length > 1) {
			console.log('Warning: multiple values found for a single value field')
		}
		const id = Object.keys(value)[0]
		return [id, value[id]]
	}
}
