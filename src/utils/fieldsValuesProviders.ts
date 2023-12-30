import { normalizeCode } from '@icure/api'
import { Field, FieldMetadata, FieldValue } from '../components/model'
import { FormValuesContainer, Version, VersionedData } from '../generic'

function getRevisionsFilter(field: Field): (id: string, history: Version<FieldMetadata>[]) => string[] {
	return (id, history) =>
		history
			.filter((fmd) => (field.tags?.length ? field.tags.every((t) => fmd?.value?.tags?.some((tt) => normalizeCode(tt).id === t)) : fmd?.value?.label === field.label()))
			.map((fmd) => fmd.revision)
			.filter((r) => !!r) as string[]
}

export const fieldValuesProvider =
	(formValuesContainer: FormValuesContainer<FieldValue, FieldMetadata>, field: Field): (() => VersionedData<FieldValue>) =>
	() =>
		formValuesContainer.getValues(getRevisionsFilter(field))

export const handleValueChanged =
	(formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>, formValuesContainerChanged?: (newValue: FormValuesContainer<FieldValue, FieldMetadata>) => void) =>
	(label: string, language: string, value: FieldValue, id?: string) => {
		if (formsValueContainer) {
			const newId = formsValueContainer?.setValue(label, language, value, id)
			id && formValuesContainerChanged?.(formsValueContainer)
			return newId
		}
		return undefined
	}

export const handleMetadataChanged =
	(formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>, formValuesContainerChanged?: (newValue: FormValuesContainer<FieldValue, FieldMetadata>) => void) =>
	(label: string, metadata: FieldMetadata, id?: string) => {
		if (formsValueContainer) {
			const newId = (formsValueContainer: FormValuesContainer<FieldValue, FieldMetadata>) => formsValueContainer?.setMetadata(label, metadata, id)
			id && formValuesContainerChanged?.(formsValueContainer)
			return newId
		}
		return undefined
	}
