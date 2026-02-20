import { FieldMetadata, FieldValue } from '../../../model'
import { Version, VersionedData } from '../../../../generic'

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

export const extractValues = <V extends FieldValue>(
	value: VersionedData<V> | undefined,
	metadataProvider: (id: string, revisions: (string | null)[]) => VersionedData<FieldMetadata>,
	id?: string,
): [string, Version<V>[]][] => {
	if (!value) {
		return []
	}
	if (id && value[id]) {
		return [[id, value[id]]]
	} else {
		return Object.entries(value).sort(([id1, v1], [id2, v2]) => {
			const m1 = metadataProvider(id1, v1[0].revision ? [v1[0].revision] : [null])[id1]
			const m2 = metadataProvider(id2, v2[0].revision ? [v2[0].revision] : [null])[id2]
			return (m1?.[0]?.value?.index ?? 0) - (m2?.[0]?.value?.index ?? 0)
		})
	}
}
