import { Contact, Content, Service } from '@icure/api'
import { sortedBy } from '../utils/no-lodash'
import { FormValuesContainer, Version, VersionedData } from '../generic'
import { ServiceMetadata } from '../icure'
import { BooleanType, DateTimeType, FieldMetadata, FieldValue, MeasureType, NumberType, PrimitiveType, StringType, TimestampType } from '../components/model'

export class BridgedFormValuesContainer implements FormValuesContainer<FieldValue, FieldMetadata> {
	/**
	 * Creates an instance of BridgedFormValuesContainer.
	 * @param responsible
	 * @param contact The displayed contact (may be in the past). === to currentContact if the contact is the contact of the day
	 * @param contactFormValuesContainer
	 */
	constructor(private responsible: string, private contact: Contact, private contactFormValuesContainer: ContactFormValuesContainer) {
		this.contact = contact
		this.contactFormValuesContainer = contactFormValuesContainer
	}

	contentToPrimitiveType(content: Content): PrimitiveType | undefined {
		if (content.numberValue || content.numberValue === 0) {
			return { type: 'number', value: content.numberValue }
		}
		if (content.measureValue?.value || content.measureValue?.value === 0) {
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
		return undefined
	}

	getValues(revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => string[]): VersionedData<FieldValue> {
		return Object.entries(
			this.contactFormValuesContainer.getValues((id, history) => {
				return revisionsFilter(
					id,
					history
						.filter(({ modified }) => !this.contact.created || !modified || modified <= this.contact.created)
						.map(({ revision, modified, value: sm }) => ({
							revision,
							modified,
							value: {
								label: sm.label,
								owner: sm.owner,
								valueDate: sm.valueDate,
							},
						})),
				)
			}),
		).reduce(
			(acc, [id, history]) => ({
				...acc,
				[id]: history.map(({ revision, modified, value: s }) => ({
					revision,
					modified,
					value: Object.entries(s.content ?? {}).reduce((acc, [lng, cnt]) => {
						const converted = this.contentToPrimitiveType(cnt)
						return converted ? { ...acc, [lng]: { value: converted, codes: s.codes } } : acc
					}, {}),
				})),
			}),
			{},
		)
	}
	getMetadata(id: string, revisions: string[]): VersionedData<FieldMetadata> {
		return Object.entries(this.contactFormValuesContainer.getMetadata(id, revisions)).reduce(
			(acc, [id, history]) => ({
				...acc,
				[id]: history.map(({ revision, modified, value: s }) => ({
					revision,
					modified,
					value: {
						label: s.label,
						owner: s.owner,
						valueDate: s.valueDate,
						tags: s.tags,
					},
				})),
			}),
			{},
		)
	}
	setValue(label: string, language: string, fv: FieldValue, id?: string | undefined): string {
		const value = fv[language].value
		return this.contactFormValuesContainer.setValue(
			label,
			language,
			{
				id: id,
				codes: fv[language].codes,
				content: {
					[language]: {
						...(value.type === 'number' ? { numberValue: (value as NumberType).value } : {}),
						...(value.type === 'measure' ? { measureValue: { value: (value as MeasureType).value, unit: (value as MeasureType).unit } } : {}),
						...(value.type === 'string' ? { stringValue: (value as StringType).value } : {}),
						...(value.type === 'datetime' ? { fuzzyDateValue: (value as DateTimeType).value } : {}),
						...(value.type === 'boolean' ? { booleanValue: (value as BooleanType).value } : {}),
						...(value.type === 'timestamp' ? { instantValue: (value as TimestampType).value } : {}),
					},
				},
			},
			id,
		)
	}
	setMetadata(label: string, meta: FieldMetadata, id?: string | undefined): string {
		return this.contactFormValuesContainer.setMetadata(
			label,
			{
				label: meta.label,
				responsible: this.responsible,
				owner: meta.owner,
				valueDate: meta.valueDate,
				tags: meta.tags,
			},
			id,
		)
	}
	delete(serviceId: string): void {
		this.contactFormValuesContainer.delete(serviceId)
	}
	compute<T, S>(formula: string, sandbox?: S | undefined): Promise<T | undefined> {
		return this.contactFormValuesContainer.compute(formula, sandbox)
	}
	getChildren(subform: string): { [form: string]: FormValuesContainer<FieldValue, FieldMetadata>[] } {
		return Object.entries(this.contactFormValuesContainer.getChildren(subform)).reduce(
			(acc, [form, fvc]) => ({
				...acc,
				[form]: fvc.map((fvc) => new BridgedFormValuesContainer(this.responsible, this.contact, fvc)),
			}),
			{},
		)
	}
}

export class ContactFormValuesContainer implements FormValuesContainer<Service, ServiceMetadata> {
	currentContact: Contact //The contact of the moment, used to record new modifications
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
		this.contactsHistory = sortedBy(contactsHistory, 'created', 'desc')
		this.serviceFactory = serviceFactory
		this.interpreter = interpreter
	}

	getChildren(subform: string): { [form: string]: ContactFormValuesContainer[] } {
		throw new Error('Method not implemented.')
	}

	getValues(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => string[]): VersionedData<Service> {
		return Object.entries(this.getServicesInHistory(revisionsFilter)).reduce(
			(acc, [id, history]) => ({
				...acc,
				[id]: [...history].sort((a, b) => (b?.modified || +new Date()) - (a?.modified || +new Date())),
			}),
			{},
		)
	}

	getMetadata(id: string, revisions: string[]): VersionedData<ServiceMetadata> {
		return [this.currentContact]
			.concat(this.contactsHistory)
			.filter((ctc) => ctc.rev && revisions.includes(ctc.rev))
			.reduce(
				(acc, ctc) =>
					(ctc.services ?? [])
						.filter((s) => s.id === id)
						.reduce(
							(acc, s) =>
								s.id
									? {
											...acc,
											[s.id]: (acc[s.id] ?? (acc[s.id] = [])).concat({
												revision: ctc.rev,
												modified: s.modified,
												value: {
													label: s.label ?? s.id,
													owner: s.author,
													responsible: s.responsible,
													valueDate: s.valueDate,
													tags: s.tags,
												},
											}),
									  }
									: acc,
							acc,
						) ?? acc,
				{} as { [id: string]: Version<ServiceMetadata>[] },
			) //index services in history by id
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

	setValue(label: string, language: string, value: Service, id?: string): string {
		const service = (id && this.getServicesInCurrentContact(id)) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		const newContent = value.content?.[language]
		if (newContent) {
			service.content = service.content || {}
			service.content[language] = newContent
		}
		const newCodes = value.codes
		if (newCodes) {
			service.codes = newCodes
		}

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
	 * @private
	 * @param revisionsFilter
	 */
	private getServicesInHistory(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => string[]): VersionedData<Service> {
		const indexedServices = [this.currentContact]
			.concat(this.contactsHistory)
			.reduce(
				(acc, ctc) =>
					ctc.services?.reduce(
						(acc, s) => (s.id ? { ...acc, [s.id]: (acc[s.id] ?? (acc[s.id] = [])).concat({ revision: ctc.rev, modified: ctc.created, value: s }) } : acc),
						acc,
					) ?? acc,
				{} as VersionedData<Service>,
			) //index services in history by id
		return Object.entries(indexedServices)
			.map(([id, history]) => {
				const keptRevisions = revisionsFilter(
					id,
					history.map(({ revision, modified, value: s }) => ({
						revision,
						modified,
						value: {
							label: s.label ?? s.id ?? '',
							owner: s.author,
							responsible: s.responsible,
							valueDate: s.valueDate,
							codes: s.codes,
							tags: s.tags,
						},
					})),
				)
				return [id, history.filter(({ revision }) => revision && keptRevisions.includes(revision))] as [string, Version<Service>[]]
			})
			.reduce((acc, [id, history]) => ({ ...acc, [id]: history }), {})
	}

	private getServicesInCurrentContact(id: string): Service {
		const service = (this.currentContact.services || [])?.find((s) => s.id === id)
		if (!service) {
			throw new Error('Service not found')
		}
		return service
	}
}
