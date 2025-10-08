import { CodeStub, Content, Service } from '@icure/api'
import { BooleanType, CompoundType, DateTimeType, MeasureType, NumberType, PrimitiveType, StringType, TimestampType } from '../components/model'

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

export function isContentEqual(content1: Content | undefined, content2: Content | undefined): boolean {
	if (!content1 && !content2) {
		return true
	}
	if (!content1 || !content2) {
		return false
	}
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

export const primitiveTypeToContent = (language: string, value: PrimitiveType): Content => {
	return {
		...(value.type === 'number' ? { numberValue: (value as NumberType).value } : {}),
		...(value.type === 'measure'
			? {
					measureValue: {
						value: (value as MeasureType).value,
						unit: (value as MeasureType).unit,
					},
			  }
			: {}),
		...(value.type === 'string' ? { stringValue: (value as StringType).value } : {}),
		...(value.type === 'datetime' ? { fuzzyDateValue: (value as DateTimeType).value } : {}),
		...(value.type === 'boolean' ? { booleanValue: (value as BooleanType).value } : {}),
		...(value.type === 'timestamp' ? { instantValue: (value as TimestampType).value } : {}),
		...(value.type === 'compound'
			? {
					compoundValue: Object.entries((value as CompoundType).value).map(([label, value]) => ({
						label,
						content: {
							[language]: primitiveTypeToContent(language, value),
						},
					})),
			  }
			: {}),
	}
}
export const contentToPrimitiveType = (language: string, content: Content | undefined): PrimitiveType | undefined => {
	if (!content) {
		return undefined
	}
	if (content.numberValue || content.numberValue === 0) {
		return { type: 'number', value: content.numberValue }
	}
	if (content.measureValue?.value || content.measureValue?.value === 0 || content.measureValue?.unit?.length) {
		return { type: 'measure', value: content.measureValue?.value, unit: content.measureValue?.unit }
	}
	if (content.stringValue) {
		return { type: 'string', value: content.stringValue }
	}
	if (content.fuzzyDateValue) {
		return { type: 'datetime', value: content.fuzzyDateValue }
	}
	if (content.booleanValue) {
		return { type: 'boolean', value: content.booleanValue }
	}
	if (content.instantValue) {
		return { type: 'timestamp', value: content.instantValue }
	}
	if (content.compoundValue) {
		return {
			type: 'compound',
			value: content.compoundValue.reduce((acc: { [label: string]: PrimitiveType }, { label, content }) => {
				const primitiveValue = contentToPrimitiveType(language, content?.[language])
				return label && primitiveValue ? { ...acc, [label]: primitiveValue } : acc
			}, {}),
		}
	}

	return undefined
}
export const codeStubToCode = (c: CodeStub) => ({
	id: c.id ?? `${c.type}|${c.code}|${c.version}`,
	label: c.label ?? {},
})
