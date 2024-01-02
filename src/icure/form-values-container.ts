import { Contact, Content, Service } from '@icure/api'
import { sortedBy } from '../utils/no-lodash'
import { FormValuesContainer, Version, VersionedData } from '../generic'
import { ServiceMetadata } from '../icure'
import { BooleanType, CompoundType, DateTimeType, FieldMetadata, FieldValue, MeasureType, NumberType, PrimitiveType, StringType, TimestampType } from '../components/model'
import { areCodesEqual, isContentEqual } from '../utils/icure-utils'
import { codeStubToCode } from '../utils/code-utils'

export class BridgedFormValuesContainer implements FormValuesContainer<FieldValue, FieldMetadata> {
	private contact: Contact

	/**
	 * Creates an instance of BridgedFormValuesContainer.
	 * @param responsible
	 * @param contact The displayed contact (may be in the past). === to currentContact if the contact is the contact of the day
	 * @param contactFormValuesContainer
	 * @param interpreter
	 * @param changeListeners
	 */
	constructor(
		private responsible: string,
		private contactFormValuesContainer: ContactFormValuesContainer,
		private interpreter?: <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S) => T | undefined,
		contact?: Contact,
		changeListeners: ((newValue: BridgedFormValuesContainer) => void)[] = [],
	) {
		this.contact = contact ?? contactFormValuesContainer.currentContact
		this.changeListeners = changeListeners
		const listener = (newContactFormValuesContainer: ContactFormValuesContainer) => {
			newContactFormValuesContainer.unregisterChangeListener(listener) //Will be added again on the next line
			const newBridgedFormValueContainer = new BridgedFormValuesContainer(this.responsible, newContactFormValuesContainer, this.interpreter, this.contact, this.changeListeners)
			this.changeListeners.forEach((l) => l(newBridgedFormValueContainer))
		}
		this.contactFormValuesContainer.registerChangeListener(listener)
	}

	private changeListeners: ((newValue: BridgedFormValuesContainer) => void)[]

	registerChangeListener(listener: (newValue: BridgedFormValuesContainer) => void): void {
		this.changeListeners.push(listener)
	}
	unregisterChangeListener(listener: (newValue: BridgedFormValuesContainer) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
	}

	private primitiveTypeToContent(language: string, value: PrimitiveType): Content {
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
								[language]: this.primitiveTypeToContent(language, value),
							},
						})),
				  }
				: {}),
		}
	}

	contentToPrimitiveType(language: string, content: Content | undefined): PrimitiveType | undefined {
		if (!content) {
			return undefined
		}
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
		if (content.compoundValue) {
			return {
				type: 'compound',
				value: content.compoundValue.reduce((acc: { [label: string]: PrimitiveType }, { label, content }) => {
					const primitiveValue = this.contentToPrimitiveType(language, content?.[language])
					return label && primitiveValue ? { ...acc, [label]: primitiveValue } : acc
				}, {}),
			}
		}

		return undefined
	}

	getValues(revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]): VersionedData<FieldValue> {
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
								tags: sm.tags?.map(codeStubToCode),
								valueDate: sm.valueDate,
							},
						})),
				)
			}),
		).reduce((acc, [id, history]) => {
			return {
				...acc,
				[id]: history.map(({ revision, modified, value: s }) => ({
					revision,
					modified,
					value: {
						content: Object.entries(s.content ?? {}).reduce((acc, [lng, cnt]) => {
							const converted = this.contentToPrimitiveType(lng, cnt)
							return converted ? { ...acc, [lng]: converted } : acc
						}, {}),
						codes: s.codes?.map(codeStubToCode),
					},
				})),
			}
		}, {} as VersionedData<FieldValue>)
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
	setValue(label: string, language: string, fv: FieldValue, id?: string, metadata?: FieldMetadata): string {
		const value = fv.content[language]
		return this.contactFormValuesContainer.setValue(
			label,
			language,
			{
				id: id,
				codes: fv.codes,
				content: {
					[language]: this.primitiveTypeToContent(language, value),
				},
			},
			id,
			metadata,
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

	private getVersionedValuesForKey(key: string | symbol) {
		return this.getValues((id, history) => (history?.[0]?.value?.label && key === history[0].value.label ? [history?.[0]?.revision] : []))
	}

	compute<T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox?: S): T | undefined {
		const proxy: S = new Proxy({} as S, {
			has: (target: S, key: string | symbol) => key === 'self' || Object.keys(this.getVersionedValuesForKey(key) ?? {}).length > 0,
			get: (target: S, key: string | symbol) => (key === 'self' ? proxy : Object.values(this.getVersionedValuesForKey(key)).map((v) => v[0]?.value)),
		})
		return this.interpreter?.(formula, sandbox ?? proxy)
	}
	getChildren(subform: string): { [form: string]: FormValuesContainer<FieldValue, FieldMetadata>[] } {
		return Object.entries(this.contactFormValuesContainer.getChildren(subform)).reduce(
			(acc, [form, fvc]) => ({
				...acc,
				[form]: fvc.map((fvc) => new BridgedFormValuesContainer(this.responsible, fvc, this.interpreter, this.contact)),
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

	changeListeners: ((newValue: ContactFormValuesContainer) => void)[]

	constructor(
		currentContact: Contact,
		contactsHistory: Contact[],
		serviceFactory: (label: string, serviceId?: string) => Service,
		changeListeners: ((newValue: ContactFormValuesContainer) => void)[] = [],
	) {
		if (contactsHistory.includes(currentContact)) {
			throw new Error('Illegal argument, the history must not contain the currentContact')
		}
		this.currentContact = currentContact
		this.contactsHistory = sortedBy(contactsHistory, 'created', 'desc')
		this.serviceFactory = serviceFactory

		this.changeListeners = changeListeners
	}

	registerChangeListener(listener: (newValue: ContactFormValuesContainer) => void): void {
		this.changeListeners.push(listener)
	}

	unregisterChangeListener(listener: (newValue: ContactFormValuesContainer) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
	}

	getChildren(subform: string): { [form: string]: ContactFormValuesContainer[] } {
		throw new Error('Method not implemented.')
	}

	getValues(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => (string | null)[]): VersionedData<Service> {
		return Object.entries(this.getServicesInHistory(revisionsFilter)).reduce(
			(acc, [id, history]) =>
				history.length
					? {
							...acc,
							[id]: [...history].sort((a, b) => (b?.modified || +new Date()) - (a?.modified || +new Date())),
					  }
					: acc,
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
												revision: ctc.rev ?? null,
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
		const service = (id && this.getServiceInCurrentContact(id)) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		if (
			(meta.responsible && service.responsible !== meta.responsible) ||
			(meta.owner && service.author !== meta.owner) ||
			(meta.valueDate && service.valueDate !== meta.valueDate) ||
			(meta.codes && service.codes !== meta.codes) ||
			(meta.tags && service.tags !== meta.tags)
		) {
			const newService = new Service({ ...service, modified: Date.now() })
			meta.responsible && (newService.responsible = meta.responsible)
			meta.owner && (newService.author = meta.owner)
			meta.valueDate && (newService.valueDate = meta.valueDate)
			meta.codes && (newService.codes = meta.codes)
			meta.tags && (newService.tags = meta.tags)

			const newFormValuesContainer = new ContactFormValuesContainer(
				{ ...this.currentContact, services: this.currentContact.services?.map((s) => (s.id === service.id ? newService : s)) },
				this.contactsHistory,
				this.serviceFactory,
				this.changeListeners,
			)

			this.changeListeners.forEach((l) => l(newFormValuesContainer))
		}

		return service.id
	}

	setValue(label: string, language: string, value: Service, id?: string, metadata?: ServiceMetadata): string {
		const service = (id && this.getServiceInCurrentContact(id)) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		const newContent = value.content?.[language]
		const newCodes = value.codes ?? []
		if ((newContent && !isContentEqual(service.content?.[language], newContent)) || (newCodes && !areCodesEqual(newCodes, service.codes ?? []))) {
			const newService = new Service({ ...service, modified: Date.now() })
			const newContents = newContent ? { ...(service.content || {}), [language]: newContent } : { ...(service.content || {}) }
			if (!newContent) {
				delete newContents[language]
			}
			newService.content = newContents
			newService.codes = newCodes

			if (metadata) {
				newService.responsible = metadata.responsible ?? newService.responsible
				newService.author = metadata.owner ?? newService.author
				newService.valueDate = metadata.valueDate ?? newService.valueDate
				newService.tags = metadata.tags ?? newService.tags
				newService.label = metadata.label ?? newService.label
			}

			const newCurrentContact = {
				...this.currentContact,
				services: (this.currentContact.services ?? []).some((s) => s.id === service.id)
					? (this.currentContact.services ?? []).map((s) => (s.id === service.id ? newService : s))
					: [...(this.currentContact.services ?? []), newService],
			}
			const newFormValuesContainer = new ContactFormValuesContainer(
				newCurrentContact,
				this.contactsHistory.map((c) => (c === this.currentContact ? newCurrentContact : c)),
				this.serviceFactory,
				this.changeListeners,
			)

			this.changeListeners.forEach((l) => l(newFormValuesContainer))
		}

		return service.id
	}

	delete(serviceId: string): void {
		const service = this.getServiceInCurrentContact(serviceId)
		if (service) {
			const newFormValuesContainer = new ContactFormValuesContainer(
				{ ...this.currentContact, services: this.currentContact.services?.map((s) => (s.id === serviceId ? new Service({ ...service, endOfLife: Date.now() }) : s)) },
				this.contactsHistory,
				this.serviceFactory,
			)

			this.changeListeners.forEach((l) => l(newFormValuesContainer))
		}
	}

	compute<T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox?: S): T | undefined {
		throw new Error('Compute not supported at contact level')
	}

	/** returns all services in history that match a selector
	 *
	 * @private
	 * @param revisionsFilter
	 */
	private getServicesInHistory(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => (string | null)[]): VersionedData<Service> {
		const indexedServices = [this.currentContact]
			.concat(this.contactsHistory)
			.reduce(
				(acc, ctc) =>
					ctc.services?.reduce(
						(acc, s) => (s.id ? { ...acc, [s.id]: (acc[s.id] ?? (acc[s.id] = [])).concat({ revision: ctc.rev ?? null, modified: ctc.created, value: s }) } : acc),
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
				return [id, history.filter(({ revision }) => keptRevisions.includes(revision))] as [string, Version<Service>[]]
			})
			.reduce((acc, [id, history]) => ({ ...acc, [id]: history }), {})
	}

	private getServiceInCurrentContact(id: string): Service {
		const service = (this.currentContact.services || [])?.find((s) => s.id === id)
		if (!service) {
			throw new Error('Service not found')
		}
		return service
	}
}
