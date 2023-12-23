import { CodeStub, Contact, Content, Service } from '@icure/api'
import { groupBy, sortedBy } from '../utils/no-lodash'
import { DateAsIcureDate } from '../utils/icure-utils'
import { ServiceWithContact, VersionedData } from './models'

export function withLabel(label: string): (svc: Service) => boolean {
	return (svc: Service) => svc.label === label
}

export interface FormValuesContainer {
	getVersions(selector: (svc: Service) => boolean): VersionedData<any>
	setValue(label: string, serviceId: string, language: string, content: Content, codes: CodeStub[], tags: CodeStub[]): string
	setValueDate(serviceId: string, fuzzyDate: number | null): void
	setAuthor(serviceId: string, author: string | null): void
	setResponsible(serviceId: string, responsible: string | null): void
	delete(serviceId: string): void
	compute<T, S>(formula: string, sandbox?: S): Promise<T | undefined>
}

/**
 * Todo: create abstract class for FormValuesContainer to be compatible with all backends objects (like: contact, patient, hcparty, etc.)
 */
export class ContactFormValuesContainer implements FormValuesContainer {
	currentContact: Contact //The contact of the moment, used to record new modifications
	contact: Contact //The displayed contact (may be in the past). === to currentContact if the contact is the contact of the day todo: is it really useful ?
	contactsHistory: Contact[] //Must be sorted (most recent first), contains all the contacts linked to this form

	serviceFactory: (label: string, serviceId: string, language: string, content: Content, codes: CodeStub[], tags: CodeStub[]) => Service
	//Actions management
	interpretor: (formula: string, sandbox: any) => Promise<any>

	constructor(
		currentContact: Contact,
		contact: Contact,
		contactsHistory: Contact[],
		serviceFactory: (label: string, serviceId: string, language: string, content: Content, codes: CodeStub[], tags: CodeStub[]) => Service,
		interpretor: (formula: string, sandbox: any) => Promise<any>,
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
		this.interpretor = interpretor
	}

	getVersions(selector: (svc: Service) => boolean): VersionedData<ServiceWithContact> {
		return groupBy(
			this.getServicesInHistory(selector).sort((a, b) => (b?.contact?.created || +new Date()) - (a?.contact?.created || +new Date())),
			(swc) => swc.service.id || '',
		)
	}

	setValueDate(serviceId: string, fuzzyDate: number | null): void {
		const service = this.getServicesInCurrentContact(serviceId)
		service.valueDate = fuzzyDate || DateAsIcureDate(new Date())
	}

	setAuthor(serviceId: string, author: string | null): void {
		const service = this.getServicesInCurrentContact(serviceId)
		service.author = author || ''
	}

	setResponsible(serviceId: string, responsible: string | null): void {
		const service = this.getServicesInCurrentContact(serviceId)
		service.responsible = responsible || ''
	}

	setValue(label: string, serviceId: string, language: string, content: Content, codes: CodeStub[], tags: CodeStub[]): string {
		let service
		try {
			service = this.getServicesInCurrentContact(serviceId)
		} catch (e) {
			service = undefined
		}
		if (service) {
			service.content = service.content || {}
			service.content[language] = content
			service.codes = codes
			service.tags = tags
			return service.id || ''
		} else {
			service = this.serviceFactory(label, serviceId, language, content, codes, tags)
			this.currentContact.services = this.currentContact.services || []
			this.currentContact.services.push(service)
			return service.id || ''
		}
	}

	delete(serviceId: string): void {
		const service = this.getServicesInCurrentContact(serviceId)
		service.endOfLife = Date.now()
	}

	async compute<T, S>(formula: string, sandbox: S): Promise<T | undefined> {
		return await this.interpretor(formula, sandbox)
	}

	/** returns all services in history that match a selector
	 *
	 * @param selector a function used to select the services of interest, usually : withLabel("someLabel")
	 * @private
	 */
	private getServicesInHistory(selector: (svc: Service) => boolean): ServiceWithContact[] {
		return [this.currentContact].concat(this.contactsHistory).flatMap(
			(ctc) =>
				ctc.services?.filter(selector)?.map((s) => ({
					service: s,
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
