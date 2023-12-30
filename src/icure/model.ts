import { CodeStub } from '@icure/api'

export interface ServiceMetadata {
	label: string
	valueDate?: number
	owner?: string
	responsible?: string
	codes?: CodeStub[]
	tags?: CodeStub[]
}
