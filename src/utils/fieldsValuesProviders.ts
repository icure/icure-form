import { Field } from '../components/iqr-form/model'
import { Meta, VersionedMeta, VersionedValue } from '../components'
import { convertServicesToVersionedMetas, convertServicesToVersionedValues, getVersions } from './icure-utils'
import { CodeStub, Content } from '@icure/api'
import { FormValuesContainer } from '../models'
import { v4 as uuid } from 'uuid'

export function numberFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () =>
		convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) =>
			content.numberValue || content.numberValue === 0 ? new Intl.NumberFormat('fr').format(content.numberValue) : '',
		)
}

export function measureFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () =>
		convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) =>
			content.measureValue?.value || content.measureValue?.value === 0 ? `${new Intl.NumberFormat('fr').format(content.measureValue.value)} ${content.measureValue?.unit}` : '',
		)
}

export function textFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () => convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) => content.stringValue || '')
}

export function dateFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () =>
		convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) => `${content.fuzzyDateValue}`.replace(/(....)(..)(..)/, '$3$2$1') || '')
}

export function dateTimeFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () =>
		convertServicesToVersionedValues(
			getVersions(formValuesContainer, field),
			(content: Content) => `${content.fuzzyDateValue}`.replace(/(....)(..)(..)(......)/, '$3$2$1 $4') || '',
		)
}

export function timeFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () => convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) => `${content.fuzzyDateValue}`)
}

export function dropdownFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () => convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) => `${content.stringValue}`)
}

export function radioButtonFieldValuesProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedValue[] {
	return () => convertServicesToVersionedValues(getVersions(formValuesContainer, field), (content: Content) => `${content.stringValue}`)
}

export function metaProvider(formValuesContainer: FormValuesContainer, field: Field): () => VersionedMeta[] {
	return () => convertServicesToVersionedMetas(getVersions(formValuesContainer, field))
}

export function handleFieldValueChangedProvider(
	field: Field,
	formValuesContainer: FormValuesContainer,
	formValuesContainerChanged: (newValue: FormValuesContainer) => void,
): (language: string, content: { asString: string; content?: Content }, serviceId?: string | undefined, codes?: CodeStub[]) => string {
	return (language: string, value: { asString: string; content?: Content }, serviceId?: string | undefined, codes?: CodeStub[]) => {
		const sId = !serviceId || serviceId == '' ? uuid() : serviceId
		const id = formValuesContainer.setValue(
			field.shortLabel ?? field.label(),
			sId,
			language,
			value.content ?? createContent(field, value),
			[
				...(codes || [])?.filter((code) => code.type !== 'CD-UNIT'),
				field.type === 'measure-field'
					? new CodeStub({ id: 'CD-UNIT|' + value.asString.split(' ')[1] || '' + '|1', type: 'CD-UNIT', code: value.asString.split(' ')[1] || '', version: '1' })
					: undefined,
			].filter((c) => c !== undefined) as CodeStub[],
			(field.tags ?? []).map((s) => {
				const parts = s.split('|')
				return new CodeStub({ id: s, type: parts[0], code: parts[1], version: parts[2] })
			}),
		)
		formValuesContainerChanged(formValuesContainer)
		return id
	}
}

export function createContent(field: Field, value: { asString: string }): Content {
	if (!value.asString) return new Content({})
	switch (field.type) {
		case 'measure-field':
			return new Content({ measureValue: { value: value.asString?.split(' ')?.[0] || '', unit: value.asString?.split(' ')?.[1] || '' } })
		case 'date-picker':
			return new Content({ fuzzyDateValue: value.asString?.replace(/[\/-]/gm, '')?.replace(/(..)(..)(....)/, '$3$2$1') || '' })
		case 'date-time-picker':
			return new Content({ fuzzyDateValue: value.asString?.replace(/[\/-]/gm, '')?.replace(/(..)(..)(....)(......)/, '$3$2$1$4') || '' })
		case 'time-picker':
			return new Content({ fuzzyDateValue: value.asString?.replace(/[-:]/gm, '') || '' })
		case 'number-field':
			return new Content({ numberValue: Number(value?.asString) })
		case 'textfield':
		case 'multiple-choice':
		case 'dropdown-field':
		case 'radio-button':
		case 'checkbox':
		default:
			return new Content({ stringValue: value?.asString })
	}
}

export function handleMetaChangedProvider(formValuesContainer: FormValuesContainer): (serviceId: string, meta: Meta) => void {
	return (serviceId: string, meta: Meta) => {
		if (meta.owner !== undefined) formValuesContainer.setResponsible(serviceId, meta.owner === null ? null : meta.owner.id)
		if (meta.valueDate !== undefined) formValuesContainer.setValueDate(serviceId, meta.valueDate)
	}
}
