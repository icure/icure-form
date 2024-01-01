import { normalizeCode } from '@icure/api'
import { Field, FieldMetadata, FieldValue } from '../components/model'
import { FormValuesContainer, Version, VersionedData } from '../generic'
import { dateToFuzzyDate } from './icure-utils'

function getRevisionsFilter(field: Field): (id: string, history: Version<FieldMetadata>[]) => string[] {
	return (id, history) =>
		history
			.filter((fmd) => (field.tags?.length ? field.tags.every((t) => fmd?.value?.tags?.some((tt) => normalizeCode(tt).id === t)) : fmd?.value?.label === field.label()))
			.map((fmd) => fmd.revision)
			.filter((r) => r !== undefined) as string[] //null is used as a new revision indicator
}

export const fieldValuesProvider =
	(formValuesContainer: FormValuesContainer<FieldValue, FieldMetadata>, field: Field): (() => VersionedData<FieldValue>) =>
	() =>
		formValuesContainer.getValues(getRevisionsFilter(field))

export const handleValueChanged =
	(formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>, owner?: string, field?: Field) => (label: string, language: string, value: FieldValue, id?: string) => {
		if (formsValueContainer) {
			return formsValueContainer?.setValue(
				label,
				language,
				value,
				id,
				!id && field // If the id is not set, we are creating a new value. In this case, we set the metadata.
					? {
							label: field.label(),
							valueDate: dateToFuzzyDate(new Date()),
							owner: owner,
							tags: field.tags?.map((t) => ({
								id: t,
								label: {},
							})),
					  }
					: undefined,
			)
		}
		return undefined
	}

export const handleMetadataChanged = (formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>) => (label: string, metadata: FieldMetadata, id?: string) => {
	if (formsValueContainer) {
		return (formsValueContainer: FormValuesContainer<FieldValue, FieldMetadata>) => formsValueContainer?.setMetadata(label, metadata, id)
	}
	return undefined
}
