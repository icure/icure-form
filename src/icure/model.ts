import { CodeStub } from '@icure/api'

export interface ServiceMetadata {
	label: string
	index?: number
	valueDate?: number
	author?: string
	responsible?: string
	codes?: CodeStub[]
	tags?: CodeStub[]
}
