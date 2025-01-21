import { CodeStub } from '@icure/cardinal-sdk'

export interface ServiceMetadata {
	label: string
	index?: number
	valueDate?: number
	author?: string
	responsible?: string
	codes?: CodeStub[]
	tags?: CodeStub[]
}
