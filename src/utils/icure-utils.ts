import parse from 'date-fns/parse'
import { CodeStub, Contact, Content, normalizeCode, Service } from '@icure/api'
import { Field } from '../components/iqr-form/model'
import { VersionedMeta, VersionedValue } from '../components'
import { FormValuesContainer, ServiceWithContact, VersionedData } from '../models'

export function fuzzyDate(epochOrLongCalendar?: number): Date | undefined {
	if (!epochOrLongCalendar && epochOrLongCalendar !== 0) {
		return undefined
	}
	if (epochOrLongCalendar >= 18000101 && epochOrLongCalendar < 25400000) {
		return parse('' + epochOrLongCalendar, 'YYYYMMDD', new Date())
	} else if (epochOrLongCalendar >= 18000101000000) {
		return parse('' + epochOrLongCalendar, 'YYYYMMDDHHmmss', new Date())
	} else {
		return new Date(epochOrLongCalendar)
	}
}

export function DateAsIcureDate(date: Date): number {
	return parseInt(
		`${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}${date.getHours().toString().padStart(2, '0')}:${date
			.getMinutes()
			.toString()
			.padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`,
	)
}

export function currentTime() {
	const now = new Date()
	return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
}

export function currentDate() {
	const now = new Date()
	return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`
}

export function currentDateTime() {
	return `${currentDate()} ${currentTime()}`
}

export function isCodeEqual(c1: CodeStub, c2: CodeStub): boolean {
	const idParts1 = c1.id?.split('|')
	const idParts2 = c2.id?.split('|')
	const type1 = c1.type || idParts1?.[0]
	const type2 = c2.type || idParts2?.[0]
	const code1 = c1.code || idParts1?.[1]
	const code2 = c2.code || idParts2?.[1]
	const version1 = c1.version || idParts1?.[2]
	const version2 = c2.version || idParts2?.[2]
	return type1 === type2 && code1 === code2 && version1 === version2
}

export function areCodesEqual(c1s: CodeStub[], c2s: CodeStub[]): boolean {
	return c1s.every((c1) => c2s.some((c2) => isCodeEqual(c1, c2)) || false) && c2s.every((c2) => c1s.some((c1) => isCodeEqual(c1, c2)) || false)
}

export function isServiceEqual(svc1: Service, svc2: Service): boolean {
	return (
		svc1.id === svc2.id && svc1.valueDate === svc2.valueDate && areCodesEqual(svc1.codes || [], svc2.codes || []) && isServiceContentEqual(svc1.content || {}, svc2.content || {})
	)
}

export function isContentEqual(content1: Content, content2: Content): boolean {
	return (
		((!content1.binaryValue && !content2.binaryValue) || content1.binaryValue === content2.binaryValue) &&
		(((content1.booleanValue === null || content1.booleanValue === undefined) && (content2.booleanValue === null || content2.booleanValue === undefined)) ||
			content1.booleanValue === content2.booleanValue) &&
		((!content1.documentId && !content2.documentId) || content1.documentId === content2.documentId) &&
		(((content1.fuzzyDateValue === null || content1.fuzzyDateValue === undefined) && (content2.fuzzyDateValue === null || content2.fuzzyDateValue === undefined)) ||
			content1.fuzzyDateValue === content2.fuzzyDateValue) &&
		((!content1.instantValue && !content2.instantValue) || content1.instantValue === content2.instantValue) &&
		((!content1.measureValue && !content2.measureValue) || content1.measureValue === content2.measureValue) &&
		((!content1.medicationValue && !content2.medicationValue) || content1.medicationValue === content2.medicationValue) &&
		((!content1.stringValue && !content2.stringValue) || content1.stringValue === content2.stringValue) &&
		(((content1.numberValue === null || content1.numberValue === undefined) && (content2.numberValue === null || content2.numberValue === undefined)) ||
			content1.numberValue === content2.numberValue) &&
		((!content1.compoundValue && !content2.compoundValue) ||
			((content1.compoundValue?.every((s1) => content2.compoundValue?.some((s2) => isServiceEqual(s1, s2))) || false) &&
				(content2?.compoundValue?.every((s2) => content1?.compoundValue?.some((s1) => isServiceEqual(s1, s2))) || false)))
	)
}

export function isServiceContentEqual(content1: { [language: string]: Content }, content2: { [language: string]: Content }): boolean {
	return Object.keys(content1).reduce((isEqual, lng) => isEqual && isContentEqual(content1[lng], content2[lng]), true as boolean)
}

export function convertServicesToVersionedValues(versions: VersionedData<ServiceWithContact>, extractValueFromContent: (content: Content) => string): VersionedValue[] {
	return Object.entries(versions).map(([key, value]) => ({
		id: key,
		versions: value.map((s) => ({
			revision: '' + s.service?.modified,
			modified: s.service?.modified || 0,
			value: Object.entries(s.service?.content || {}).reduce((acc, [lng, content]) => ({ ...acc, [lng]: extractValueFromContent(content) }), {}),
		})),
	}))
}

export function convertServicesToVersionedMetas(versions: VersionedData<ServiceWithContact>): VersionedMeta[] {
	return Object.entries(versions).map(([key, value]) => ({
		id: key,
		metas: value.map((s) => ({
			revision: '' + s.service?.modified,
			modified: s.service?.modified || 0,
			valueDate: s.service?.valueDate,
			owner: s.service?.responsible ? { id: s.service?.responsible } : undefined,
		})),
	}))
}

export function getVersions(formsValueContainer: FormValuesContainer, field: Field): VersionedData<ServiceWithContact> {
	return (
		formsValueContainer?.getVersions((svc) =>
			field.tags?.length ? field.tags.every((t) => (svc.tags || []).some((tt) => normalizeCode(tt).id === t)) : svc.label === field.label(),
		) || {}
	)
}

export function setServices(ctc: Contact, newServices: Service[], modifiedServices: Service[]): Contact {
	return new Contact({
		...ctc,
		services: newServices.concat(ctc.services?.map((s) => modifiedServices.find((r) => r.id === s.id) || s) || []),
	})
}
