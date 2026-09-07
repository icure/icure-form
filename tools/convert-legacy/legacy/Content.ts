/**
 * The type of the content recorded in the documents for the service
 */
function b64_2ab(v: any) {
	if (v instanceof ArrayBuffer) {
		return v
	}
	if (v instanceof Uint8Array) {
		return v.buffer
	}
	if (typeof v === 'string') {
		const bs = atob(v as string)
		const data = new Uint8Array(bs.length)
		for (let i = 0; i < bs.length; i++) {
			data[i] = bs.charCodeAt(i)
		}
		return data.buffer
	}
	return v
}

export class Content {
	stringValue?: string
	numberValue?: number
	booleanValue?: boolean
	instantValue?: number
	/**
	 * Known values in a date. The format could have a all three (day, month and year) or values on any of these three, whatever is known.
	 */
	fuzzyDateValue?: number
	binaryValue?: ArrayBuffer
	/**
	 * Id of the document in which the content is being filled.
	 */
	documentId?: string
	measureValue?: { [key: string]: any }
	medicationValue?: { [key: string]: any }
	/**
	 * The service for which the content is being filled
	 */
	compoundValue?: Array<{ [key: string]: any }>

	constructor(json: JSON | any) {
		Object.assign(this as Content, json, json.binaryValue ? { binaryValue: b64_2ab(json.binaryValue) } : {})
	}
}
