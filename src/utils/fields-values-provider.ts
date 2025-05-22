import { Field, FieldMetadata, FieldValue } from '../components/model'
import { FormValuesContainer, Version, VersionedData } from '../generic'

import { dateToFuzzyDate } from './dates'

export function getRevisionsFilter(field: Field): (id: string, history: Version<FieldMetadata>[]) => string[] {
	return (id, history) =>
		history
			.filter((fmd) => (field.tags?.length ? field.tags.every((t) => fmd?.value?.tags?.some((tt) => tt.id === t)) : fmd?.value?.label === field.label()))
			.map((fmd) => fmd.revision)
			.filter((r) => r !== undefined) as string[] //null is used as a new revision indicator
}

export const fieldValuesProvider =
	(formValuesContainer: FormValuesContainer<FieldValue, FieldMetadata>, field: Field): (() => VersionedData<FieldValue>) =>
	() =>
		formValuesContainer.getValues(getRevisionsFilter(field))

export function makeMetadata(field: Field, owner?: string, index?: number) {
	return {
		label: field.label(),
		valueDate: dateToFuzzyDate(new Date()),
		owner: owner,
		index: index,
		tags: field.tags?.map((t) => ({
			id: t,
			label: {},
		})),
	}
}

export const getValidationErrorProvider =
	(formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>, field?: Field): (() => Promise<[FieldMetadata, string][]>) =>
	async () => {
		const validators = formsValueContainer ? await formsValueContainer.getValidationErrors() : []
		return validators.filter(([metadata]) => metadata.label === field?.label())
	}

export const handleValueChangedProvider = (formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>, field?: Field, owner?: string) => {
	return (label: string, language: string, value?: FieldValue, id?: string) => {
		if (formsValueContainer) {
			formsValueContainer.setValue(
				label,
				language,
				value,
				id,
				!id && field // If the id is not set, we are creating a new value. In this case, we set the metadata.
					? makeMetadata(field, owner)
					: undefined,
			)
		}
	}
}

export const handleMetadataChangedProvider = (formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>) => {
	return (metadata: FieldMetadata, id?: string) => {
		if (formsValueContainer) {
			formsValueContainer.setMetadata(metadata, id)
		}
	}
}
