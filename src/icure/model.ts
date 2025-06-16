import { CodeStub } from '@icure/cardinal-sdk'
import { Metadata } from '../components/model'

export class CodeStubWithId extends CodeStub {
	id: string

	constructor(partial: Partial<CodeStub> & { id: string }) {
		super(partial)
		this.id = partial.id
	}
}

export interface ServiceMetadata extends Metadata {
	label: string
	index?: number
	valueDate?: number
	author?: string
	responsible?: string
	codes?: CodeStub[]
	tags?: CodeStubWithId[] //Tags must have an id for the UI to work properly
}
