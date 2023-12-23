import { Contact, Form, Service } from '@icure/api'
import { FormValuesContainer } from './formValuesContainer'

export type VersionedData<T> = {
	[id: string]: T[]
}

export interface FormHierarchy {
	form: Form
	formValuesContainer: FormValuesContainer
	children: FormHierarchy[] //All services in a service history have the same id as id
}

export interface ServiceWithContact {
	service: Service
	contact: Contact
}

export enum LabelPosition {
	float = 'float',
	sideRight = 'sideRight',
	sideLeft = 'sideLeft',
	above = 'above',
	hidden = 'hidden',
}

export interface Labels {
	[position: string]: string
}
