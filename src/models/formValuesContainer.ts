import { CodeStub, Contact, Content, Service } from '@icure/api'
import { groupBy, sortedBy } from '../utils/no-lodash'
import { Version, VersionedData } from './models'

export function withLabel(label: string): (svc: Service) => boolean {
	return (svc: Service) => svc.label === label
}

export interface FormValuesContainer<Item, Content, Metadata> {
	getVersions(selector: (item: Item) => boolean): VersionedData<Item, Version<Item>>
	setValue(label: string, language: string, data: Content, id?: string): string
	setMetadata(label: string, meta: Metadata, id?: string): string
	delete(serviceId: string): void
	compute<T, S>(formula: string, sandbox?: S): Promise<T | undefined>
	getChildren(subform: string): { [form: string]: FormValuesContainer<Item, Content, Metadata>[] }
}

export class ServiceMetadata {
	valueDate?: number
	owner?: string
	responsible?: string
	codes?: CodeStub[]
	tags?: CodeStub[]
}

export class ServiceWithContactVersion implements Version<Service> {
	value: Service
	contact: Contact
}

export class ContactFormValuesContainer implements FormValuesContainer<Service, Content, ServiceMetadata> {
	currentContact: Contact //The contact of the moment, used to record new modifications
	contact: Contact //The displayed contact (may be in the past). === to currentContact if the contact is the contact of the day todo: is it really useful ?
	contactsHistory: Contact[] //Must be sorted (most recent first), contains all the contacts linked to this form

	serviceFactory: (label: string, serviceId?: string) => Service
	//Actions management
	interpreter: (formula: string, sandbox: any) => Promise<any>

	constructor(
		currentContact: Contact,
		contact: Contact,
		contactsHistory: Contact[],
		serviceFactory: (label: string, serviceId?: string) => Service,
		interpreter: (formula: string, sandbox: any) => Promise<any>,
	) {
		if (!contactsHistory.includes(contact) && contact !== currentContact) {
			throw new Error('Illegal argument, the history must contain the contact')
		}
		if (contactsHistory.includes(currentContact)) {
			throw new Error('Illegal argument, the history must not contain the currentContact')
		}
		this.currentContact = currentContact
		this.contact = contact
		this.contactsHistory = sortedBy(contactsHistory, 'created', 'desc')
		this.serviceFactory = serviceFactory
		this.interpreter = interpreter
	}

	getChildren(subform: string): { [form: string]: FormValuesContainer<Service, Content, ServiceMetadata>[] } {
		throw new Error('Method not implemented.')
	}

	getVersions(selector: (svc: Service) => boolean): VersionedData<Service, ServiceWithContactVersion> {
		return groupBy(
			this.getServicesInHistory(selector).sort((a, b) => (b?.contact?.created || +new Date()) - (a?.contact?.created || +new Date())),
			(swc) => swc.value.id || '',
		)
	}

	setMetadata(label: string, meta: ServiceMetadata, id?: string): string {
		const service = (id && this.getServicesInCurrentContact(id)) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		meta.responsible && (service.responsible = meta.responsible)
		meta.owner && (service.author = meta.owner)
		meta.valueDate && (service.valueDate = meta.valueDate)
		meta.codes && (service.codes = meta.codes)
		meta.tags && (service.tags = meta.tags)

		return service.id
	}

	setValue(label: string, language: string, content: Content, id?: string): string {
		const service = (id && this.getServicesInCurrentContact(id)) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		service.content = service.content || {}
		service.content[language] = content

		return service.id
	}

	delete(serviceId: string): void {
		const service = this.getServicesInCurrentContact(serviceId)
		service.endOfLife = Date.now()
	}

	async compute<T, S>(formula: string, sandbox: S): Promise<T | undefined> {
		return await this.interpreter(formula, sandbox)
	}

	/** returns all services in history that match a selector
	 *
	 * @param selector a function used to select the services of interest, usually : withLabel("someLabel")
	 * @private
	 */
	private getServicesInHistory(selector: (svc: Service) => boolean): ServiceWithContactVersion[] {
		return [this.currentContact].concat(this.contactsHistory).flatMap(
			(ctc) =>
				ctc.services?.filter(selector)?.map((s) => ({
					value: s,
					contact: ctc,
				})) || [],
		)
	}

	private getServicesInCurrentContact(id: string): Service {
		const service = (this.currentContact.services || [])?.find((s) => s.id === id)
		if (!service) {
			throw new Error('Service not found')
		}
		return service
	}
}
