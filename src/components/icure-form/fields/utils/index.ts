import { FieldMetadata, FieldValue } from '../../../model'
import { VersionedData } from '../../../../generic'

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
