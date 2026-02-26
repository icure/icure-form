import { Contact, Form, Form as ICureForm, Service, CodeStub } from '@icure/api'
import { sortedBy } from '../utils/no-lodash'
import { ComputationResult, FormValuesContainer, Version, VersionedData } from '../generic'
import { ServiceMetadata } from './model'
import { FieldMetadata, FieldValue, PrimitiveType, Validator } from '../components/model'
import { areCodesEqual, codeStubToCode, contentToPrimitiveType, isContentEqual, primitiveTypeToContent } from './icure-utils'
import { parsePrimitive } from '../utils/primitive'
import { anyDateToDate, dateToFuzzyDate } from '../utils/dates'
import { normalizeCodes } from '../utils/code-utils'

let _ordinal = 0

function notify<Value, Metadata>(
	l: (fvc: FormValuesContainer<Value, Metadata>, changedKeys: string[] | null, force: boolean) => void,
	fvc: FormValuesContainer<Value, Metadata>,
	changedKeys: string[] | null,
	force = false,
) {
	l(fvc, changedKeys, force)
}

function primitiveTypeToString(pt: PrimitiveType): string {
	switch (pt.type) {
		case 'string':
			return pt.value
		case 'number':
			return pt.value.toString()
		case 'boolean':
			return pt.value.toString()
		case 'measure':
			return pt.value !== undefined ? `${pt.value}${pt.unit ? ' ' + pt.unit : ''}` : ''
		case 'timestamp':
			return new Date(pt.value).toISOString()
		case 'datetime':
			return pt.value.toString()
		case 'compound':
			return Object.entries(pt.value)
				.map(([k, v]) => `${k}: ${primitiveTypeToString(v)}`)
				.join(', ')
	}
}

/** This class is a bridge between the ICure API and the generic FormValuesContainer interface.
 * It wraps around a ContactFormValuesContainer and provides a series of services:
 * - It computes dependent values when the form is created
 * - It broadcasts changes from the wrapped ContactFormValuesContainer to its listeners
 * - It provides a way to compute formulas in a sandboxed environment
 * - It bridges the setValues and setMetadata methods with the wrapped ContactFormValuesContainer by
 * 		- converting the FieldValue to a Service
 * 		- converting the FieldMetadata to a ServiceMetadata
 * - It bridges the getValues and getMetadata methods with the wrapped ContactFormValuesContainer by
 * 		- converting the Service to a FieldValue
 * 		- converting the ServiceMetadata to a FieldMetadata
 * - It lazily creates bridges the children by
 *    - lazily creating BridgedFormValuesContainer when the children of the wrapped ContactFormValuesContainer are accessed
 *    - creating a new ContactFormValuesContainer and wrapping it in a BridgedFormValuesContainer when a child is added
 *
 * The icure-form typically accepts a BridgedFormValuesContainer as a prop and uses it to interact with the form.
 *
 * This class is fairly generic and can be used as an inspiration or subclassed for other bridges
 */
export class BridgedFormValuesContainer implements FormValuesContainer<FieldValue, FieldMetadata> {
	private contact: Contact
	private contactFormValuesContainer: ContactFormValuesContainer
	private _id = ''
	private readonly mutateAndNotify: (newContactFormValuesContainer: ContactFormValuesContainer, changedKeys: string[] | null) => void
	private dependentValuesComputationIteration?: Promise<[string | undefined, FieldMetadata, string, FieldValue | undefined][]> = undefined

	toString(): string {
		return `Bridged(${this.contactFormValuesContainer.rootForm.formTemplateId}[${this.contactFormValuesContainer.rootForm.id}]) - ${this._id}`
	}

	/**
	 * Creates an instance of BridgedFormValuesContainer.
	 * @param responsible The id of the data owner responsible for the creation of the values
	 * @param contactFormValuesContainer The wrapped ContactFormValuesContainer
	 * @param interpreter A function that can interpret formulas
	 * @param contact The displayed contact (may be in the past). === to currentContact if the contact is the contact of the day
	 * @param initialValuesProvider A lambda that provides the initial values of the form
	 * @param dependentValuesProvider A function that provides the dependent values (computed on the basis of other values) for a given anchorId and templateId
	 * @param validatorsProvider A function that provides the validators for a given anchorId and templateId
	 * @param language The language in which the values are displayed
	 * @param changeListeners The listeners that will be notified when the values change
	 * @param interpreterContext A map with keys that are the names of the variables and values that are the functions that return the values of the variables
	 * @param dependenciesCache
	 */
	constructor(
		private responsible: string,
		contactFormValuesContainer: ContactFormValuesContainer,
		private interpreter?: <
			T,
			S extends {
				[key: string | symbol]: unknown
			},
		>(
			formula: string,
			sandbox: S,
		) => Promise<T | undefined>,
		contact?: Contact,
		private initialValuesProvider: (
			anchorId?: string,
			templateId?: string,
		) => {
			metadata: FieldMetadata
			revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
			formula: string
		}[] = () => [],
		private dependentValuesProvider: (
			anchorId: string | undefined,
			templateId: string | undefined,
		) => {
			metadata: FieldMetadata
			revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
			formula: string
		}[] = () => [],
		private validatorsProvider: (
			anchorId: string | undefined,
			templateId: string,
		) => {
			metadata: FieldMetadata
			validators: Validator[]
		}[] = () => [],
		private language = 'en',
		private changeListeners: ((newValue: BridgedFormValuesContainer, changedKeys: string[] | null, force: boolean) => void)[] = [],
		private interpreterContext: { [variable: string]: () => unknown } = {},
		private dependenciesCache: { [formula: string]: string[] } = {},
	) {
		//Before start to broadcast changes, we need to fill in the contactFormValuesContainer with the dependent values
		this.contactFormValuesContainer = contactFormValuesContainer
		this._id = `[${contactFormValuesContainer._id}]`
		console.log(`+ BFVC ${this._id} created`)
		this.mutateAndNotify = (newContactFormValuesContainer: ContactFormValuesContainer, changedKeys: string[] | null, force = false) => {
			if (this.changeListeners.length === 0) {
				return
			}
			if (!force && this.contactFormValuesContainer === newContactFormValuesContainer) {
				return
			}

			this.contactFormValuesContainer.unregisterChangeListener(this.mutateAndNotify)
			newContactFormValuesContainer.unregisterChangeListener(this.mutateAndNotify)

			const newBridgedFormValueContainer = new BridgedFormValuesContainer(
				this.responsible,
				newContactFormValuesContainer,
				this.interpreter,
				this.contact === this.contactFormValuesContainer.currentContact ? newContactFormValuesContainer.currentContact : this.contact,
				this.initialValuesProvider,
				this.dependentValuesProvider,
				this.validatorsProvider,
				this.language,
				this.changeListeners,
				this.interpreterContext,
				this.dependenciesCache,
			)

			const initPromise = newBridgedFormValueContainer.init(changedKeys, this.dependentValuesComputationIteration)
			this.changeListeners.forEach((l) => notify(l, newBridgedFormValueContainer, changedKeys))

			initPromise.catch((e) => {
				console.log('Error while initializing new BridgedFormValuesContainer', e)
			})
		}
		this.contactFormValuesContainer.registerChangeListener(this.mutateAndNotify)
		this.contact = contact ?? contactFormValuesContainer.currentContact
	}

	/* init can be called several times on the same instance but the initialisation will only be done once */
	async init(changedKeys: string[] | null = null, pendingComputationIteration?: Promise<[string | undefined, FieldMetadata, string, FieldValue | undefined][]>): Promise<BridgedFormValuesContainer> {
		if (this.contactFormValuesContainer.mustBeInitialised()) {
			await this.computeInitialValues()
		}
		let changedKeysByInit: string[] = []
		if (pendingComputationIteration) {
			const changes = await pendingComputationIteration

			if (changes.length > 0) {
				this.quietlyApplyChangesOnContactFormValueContainer(changes)
				changedKeysByInit = await this.computeDependentValues([...(changedKeys ?? []), ...changes.map(([, metadata]) => metadata.label)])
			} else {
				changedKeysByInit = await this.computeDependentValues(changedKeys)
			}
		} else {
			changedKeysByInit = await this.computeDependentValues(changedKeys)
		}

		//After all the silent updates, we need a last one that causes a new BridgedFormValuesContainer to be created and broadcasted to the listeners, so that they get the final values with all the dependencies computed
		this.contactFormValuesContainer.changeListeners.forEach((l) => notify(l, this.contactFormValuesContainer, changedKeysByInit, changedKeysByInit.length > 0))

		return this
	}

	getLabel(): string {
		return this.contactFormValuesContainer.getLabel()
	}

	getFormId(): string | undefined {
		return this.contactFormValuesContainer.getFormId()
	}

	getContactFormValuesContainer() {
		return this.contactFormValuesContainer
	}

	registerChangeListener(listener: (newValue: BridgedFormValuesContainer, changedKeys: string[] | null, force: boolean) => void): void {
		this.changeListeners.push(listener)
	}

	unregisterChangeListener(listener: (newValue: BridgedFormValuesContainer, changedKeys: string[] | null, force: boolean) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
	}

	getDefaultValueProvider(label: string): (() => Promise<FieldValue | undefined>) | undefined {
		const formula = this.initialValuesProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId).find(
			({ metadata }) => metadata.label === label,
		)?.formula
		return formula ? async () => this.convertRawValue(await this.compute(formula)) : undefined
	}

	getValues(revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]): VersionedData<FieldValue> {
		return Object.entries(
			this.contactFormValuesContainer.getValues((id, history) =>
				revisionsFilter(
					id,
					history
						.filter(({ modified }) => !this.contact.created || !modified || modified <= this.contact.created)
						.map(({ revision, modified, value: sm }) => ({
							revision,
							modified,
							value: {
								label: sm.label,
								owner: sm.responsible,
								tags: sm.tags?.map(codeStubToCode),
								valueDate: sm.valueDate,
							},
						})),
				),
			),
		).reduce((acc, [id, history]) => {
			return {
				...acc,
				[id]: history.map(({ revision, modified, value: s }) => ({
					revision,
					modified,
					value: {
						content: Object.entries(s.content ?? {}).reduce((acc, [lng, cnt]) => {
							const converted = contentToPrimitiveType(lng, cnt)
							return converted ? { ...acc, [lng]: converted } : acc
						}, {}),
						codes: s.codes?.map(codeStubToCode),
					},
				})),
			}
		}, {} as VersionedData<FieldValue>)
	}

	getMetadata(id: string, revisions: (string | null)[]): VersionedData<FieldMetadata> {
		return Object.entries(this.contactFormValuesContainer.getMetadata(id, revisions)).reduce(
			(acc, [id, history]) => ({
				...acc,
				[id]: history.map(({ revision, modified, value: s }) => ({
					revision,
					modified,
					value: {
						label: s.label,
						owner: s.responsible,
						valueDate: s.valueDate,
						tags: s.tags,
						discordantMetadata: () => ({
							...(s.responsible !== this.responsible ? { owner: this.responsible } : {}),
							...(Math.abs(+(anyDateToDate(s.valueDate) ?? 0) - +(anyDateToDate(this.contact.created) ?? 0)) > 24 * 3600000 ? { valueDate: s.valueDate } : {}),
						}),
					},
				})),
			}),
			{},
		)
	}

	private convertRawValue(rawValue: unknown): FieldValue | undefined {
		if (rawValue && typeof rawValue === 'object' && 'content' in rawValue) {
			return rawValue as FieldValue
		}

		if (Array.isArray(rawValue)) {
			return rawValue.reduce(
				(acc: FieldValue, it, idx) => {
					const fv = this.convertRawValue(it)
					if (fv === undefined) {
						return acc
					}
					acc.codes = [...(fv.codes ?? []), ...(acc.codes ?? [])]
					acc.content['*'] = fv.content['*']?.value
						? {
								...acc.content['*'],
								[(fv.codes ?? [])[0].id ?? idx.toString()]: fv.content['*'].value,
						  }
						: acc.content['*']
					return acc
				},
				{ content: { '*': { type: 'compound', value: {} } } },
			)
		}

		if (typeof rawValue === 'number') {
			return { content: { '*': { type: 'number', value: rawValue } } }
		}

		if (typeof rawValue === 'string') {
			return { content: { '*': { type: 'string', value: rawValue } } }
		}

		if (typeof rawValue === 'boolean') {
			return { content: { '*': { type: 'boolean', value: rawValue } } }
		}

		if (rawValue instanceof Date) {
			return { content: { '*': { type: 'timestamp', value: dateToFuzzyDate(rawValue) } } }
		}

		if (rawValue && typeof rawValue === 'object' && 'unit' in rawValue && 'value' in rawValue && typeof rawValue.value === 'number') {
			return { content: { '*': { type: 'measure', value: rawValue.value, unit: rawValue.unit?.toString() ?? '' } } }
		}

		return undefined
	}

	//This method mutates the BridgedFormValuesContainer but can only be called from the constructor
	private async computeInitialValues() {
		if (this.contactFormValuesContainer.rootForm.formTemplateId) {
			await Promise.all(
				this.initialValuesProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId).map(async ({ metadata, revisionsFilter, formula }) => {
					try {
						const currentValue = this.getValues(revisionsFilter)
						if (!currentValue || !Object.keys(currentValue).length) {
							const computedValue = (await this.compute(formula)).value
							const newValue = computedValue ? this.convertRawValue(computedValue) : undefined
							if (newValue !== undefined) {
								const lng = this.language ?? 'en'
								if (newValue && !newValue.content[lng] && newValue.content['*']) {
									newValue.content[lng] = newValue.content['*']
								}
								if (newValue) {
									delete newValue.content['*']
								}
								setValueOnContactFormValuesContainer(this.contactFormValuesContainer, metadata.label, lng, newValue, undefined, metadata, (fvc: ContactFormValuesContainer) => {
									const currentContact = this.contactFormValuesContainer.currentContact
									this.contactFormValuesContainer = fvc
									if (this.contact === currentContact) {
										this.contact = fvc.currentContact
									}
								})
							}
						}
					} catch (e) {
						console.log(`Error while computing formula : ${formula}`, e)
					}
				}),
			)
		}
	}

	//This method mutates the BridgedFormValuesContainer but can only be called from the constructor
	private async computeDependentValues(changedKeys: string[] | null) {
		const iterate = async (changedKeys: string[] | null, iterationCount: number): Promise<[string, FieldMetadata, string, FieldValue | undefined][]> => {
			if (this.contactFormValuesContainer.rootForm.formTemplateId) {
				console.log(`% ${iterationCount}, keys: ${changedKeys ? changedKeys.join(', ') : 'all'}`)
				return await Promise.all(
					this.dependentValuesProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId).map(async ({ metadata, revisionsFilter, formula }) => {
						try {
							if (!changedKeys || !this.dependenciesCache[formula] || this.dependenciesCache[formula].some((d) => changedKeys.includes(d))) {
								const currentValue = this.getValues(revisionsFilter)
								try {
									const computationResult = await this.compute(formula)
									this.dependenciesCache[formula] = [...(this.dependenciesCache[formula] ?? []), ...computationResult.dependencies].filter((d, idx, array) => array.indexOf(d) === idx)
									const newValue = computationResult.value ? this.convertRawValue(computationResult.value) : undefined

									if (newValue !== undefined || (currentValue != undefined && Object.keys(currentValue).length > 0 && currentValue[Object.keys(currentValue)[0]][0].value)) {
										const lng = this.language ?? 'en'
										if (newValue && !newValue.content[lng] && newValue.content['*']) {
											newValue.content[lng] = newValue.content['*']
										}
										if (newValue) {
											delete newValue.content['*']
										}
										return [Object.keys(currentValue ?? {})[0], metadata, lng, newValue] as [string, FieldMetadata, string, FieldValue | undefined]
									}
								} catch (e) {
									console.log(`Error while computing formula : ${formula}`, e)
								}
							}
						} catch (e) {
							console.log(`Error while computing formula : ${formula}`, e)
						}
						return null
					}),
				).then((results) => results.filter((r) => !!r))
			} else {
				return []
			}
		}

		let latestKeys = changedKeys
		let iterationCount = 0
		const allChangedKeys: string[] = []
		while (true) {
			if (latestKeys != null && latestKeys.length === 0) {
				this.dependentValuesComputationIteration = undefined
				break
			}
			const changes = await (this.dependentValuesComputationIteration = iterate(latestKeys, iterationCount++))
			latestKeys = this.quietlyApplyChangesOnContactFormValueContainer(changes)
			allChangedKeys.push(...latestKeys)
		}

		return allChangedKeys
	}

	private quietlyApplyChangesOnContactFormValueContainer(changes: [string | undefined, FieldMetadata, string, FieldValue | undefined][]): string[] {
		const allChangedKeys: string[] = []
		const interceptor = (fvc: ContactFormValuesContainer, changedKeys: string[] | null) => {
			const currentContact = this.contactFormValuesContainer.currentContact
			this.contactFormValuesContainer = fvc
			if (this.contact === currentContact) {
				this.contact = fvc.currentContact
			}
			allChangedKeys.push(...(changedKeys ?? []))
		}

		changes.forEach(([id, metadata, language, newValue]) => {
			try {
				setValueOnContactFormValuesContainer(this.contactFormValuesContainer, metadata.label, language, newValue ?? undefined, id, metadata, interceptor)
			} catch (e) {
				console.log(`Error while applying dependent value change for ${metadata.label} (${id})`, e)
			}
		})

		return allChangedKeys
	}

	setValue(label: string, language: string, fv?: FieldValue, id?: string, metadata?: FieldMetadata): void {
		setValueOnContactFormValuesContainer(this.contactFormValuesContainer, label, language, fv, id, metadata)
	}

	setMetadata(meta: FieldMetadata, id?: string | undefined): void {
		this.contactFormValuesContainer.setMetadata(
			{
				label: meta.label,
				responsible: meta.owner,
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

	async compute<T>(formula: string): Promise<ComputationResult<T>> {
		const dependencies = new Set<string>()
		// noinspection JSUnusedGlobalSymbols
		const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
			if (!content) {
				return undefined
			}
			const primitive = content[this.language] ?? content['*'] ?? content[Object.keys(content)[0]]
			return primitive && parsePrimitive(primitive, toString)
		}
		const text = (item?: { content: { [key: string]: PrimitiveType } } | { content: { [key: string]: PrimitiveType } }[]) => {
			if (!item) {
				return undefined
			}
			const items: { content: { [key: string]: PrimitiveType } }[] = Array.isArray(item) ? item : [item]
			return items
				.map((it) => parseContent(it.content, true)?.toString())
				.filter((it) => !!it)
				.join(', ')
		}
		const log = console.log
		// noinspection JSUnusedGlobalSymbols
		const native = {
			parseInt: parseInt,
			parseFloat: parseFloat,
			Date: Date,
			Math: Math,
			Number: Number,
			String: String,
			Boolean: Boolean,
			Array: Array,
			Object: Object,
			hasOption: (
				it: {
					codes: CodeStub[]
				},
				option: string,
			) => it && it.codes?.some((c) => c.id === option || c.id?.split('|')?.[1] === option),
			score: (it: { codes: CodeStub[] }) => {
				return it
					? (it.codes ?? []).reduce((acc, c) => {
							try {
								return acc + parseInt(c.id?.split('|')?.[1] ?? '0')
							} catch (e) {
								return acc
							}
					  }, 0)
					: 0
			},
			parseContent,
			validate: {
				notBlank: (self: any, label: string) => {
					const value = parseContent((self[label as any] as any)?.[0]?.content)
					return !!(value as any)?.trim()?.length
				},
			},
			text,
			log,
			Promise,
		} as { [key: string]: any }
		const proxy: { [key: string]: string | symbol } = new Proxy({} as { [key: string]: string | symbol }, {
			has: (target: { [key: string]: string | symbol }, key: string | symbol) =>
				!!native[key as string] || key === 'self' || !!this.interpreterContext[key as string] || Object.keys(this.getVersionedValuesForKey(key) ?? {}).length > 0,
			get: (target: { [key: string]: string | symbol }, key: string | symbol) => {
				if (key === 'undefined') {
					return undefined
				}
				const nativeValue = native[key as string]
				if (!!nativeValue) {
					return nativeValue
				}
				if (key === 'self') {
					return proxy
				} else {
					dependencies.add(key.toString())
					return this.interpreterContext[key as string] ? this.interpreterContext[key as string]() : Object.values(this.getVersionedValuesForKey(key)).map((v) => v[0]?.value)
				}
			},
		})
		return { value: await this.interpreter?.(formula, proxy), dependencies: Array.from(dependencies) }
	}

	async getChildren(): Promise<FormValuesContainer<FieldValue, FieldMetadata>[]> {
		return await Promise.all(
			(
				await this.contactFormValuesContainer.getChildren()
			).map((fvc) =>
				new BridgedFormValuesContainer(
					this.responsible,
					fvc,
					this.interpreter,
					this.contact,
					this.initialValuesProvider,
					this.dependentValuesProvider,
					this.validatorsProvider,
					this.language,
					[],
					this.interpreterContext,
				).init(),
			),
		)
	}

	getValidationErrors(): Promise<[FieldMetadata, string] | null>[] {
		if (this.contactFormValuesContainer.rootForm.formTemplateId) {
			return this.validatorsProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId).flatMap(({ metadata, validators }) =>
				validators.map(async ({ validation, message }): Promise<[FieldMetadata, string] | null> => {
					try {
						if (!(await this.compute(validation))) {
							return [metadata, message]
						}
					} catch (e) {
						console.log(`Error while computing validation : ${validation}`, e)
					}
					return null
				}),
			)
		} else {
			return []
		}
	}

	async addChild(anchorId: string, templateId: string, label: string): Promise<void> {
		await this.contactFormValuesContainer.addChild(anchorId, templateId, label)
	}

	async removeChild(container: BridgedFormValuesContainer): Promise<void> {
		await this.contactFormValuesContainer.removeChild(container.contactFormValuesContainer)
	}

	synchronise() {
		this.contactFormValuesContainer.synchronise()
		return this
	}
}

/**
 * This class is a form values container that uses a hierarchy of forms as a data source. The actual values are extracted from the services of the contacts.
 * The `currentContact` is the contact that has been selected by the user, any later contact should be ignored.
 * The `contactsHistory` is used to provide the full history of the services.
 * The hierarchy of ContactFormValuesContainer has to be maintained by the manager of the instances of this class (typically the BridgedFormValuesContainer).
 * Each ContactFormValuesContainer has a reference to its `rootForm`.
 * The `serviceFactory` and `formFactory` are used to create new services and add sub-forms.
 */
export class ContactFormValuesContainer implements FormValuesContainer<Service, ServiceMetadata> {
	rootForm: ICureForm
	currentContact: Contact //The contact of the moment, used to record new modifications
	contactsHistory: Contact[] //Must be sorted (most recent first), contains all the contacts linked to this form
	children: ContactFormValuesContainer[] //Direct children of the ContactFormValuesContainer
	anchorId?: string //The anchorId in the parent form
	serviceFactory: (label: string, serviceId?: string) => Service
	formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<ICureForm>
	formRecycler: (formId: string) => Promise<void>

	changeListeners: ((newValue: ContactFormValuesContainer, changedKeys: string[] | null, force: boolean) => void)[]

	_id = ''
	private _initialised = false
	private indexedServices: { [id: string]: Version<Service>[] }

	toString(): string {
		return `Contact(${this.rootForm.formTemplateId}[${this.rootForm.id}]) - ${this._id}`
	}

	mustBeInitialised() {
		return !this._initialised
	}

	/**
	 * Returns a contact that combines the content of the contact in this form with the content of all contents stored in the children
	 */
	coordinatedContact(): Contact {
		const childrenContacts = this.children.map((c) => c.coordinatedContact())
		const thisKeptServiceIds = (this.currentContact.subContacts ?? []).filter((sc) => sc.formId === this.rootForm.id).flatMap((sc) => (sc.services ?? []).map((s) => s.serviceId))
		return {
			...this.currentContact,
			services: childrenContacts.reduce((acc: Service[], c: Contact) => acc.concat(c.services ?? []), []).concat((this.currentContact.services ?? []).filter((s) => thisKeptServiceIds.includes(s.id))),
			subContacts: childrenContacts
				.reduce((acc: Service[], c: Contact) => acc.concat(c.subContacts ?? []), [])
				.concat((this.currentContact.subContacts ?? []).filter((s) => s.formId === this.rootForm.id)),
		}
	}

	/**
	 * Returns a contact that combines the content of the contact in this form with the content of all contents stored in the children
	 */
	allForms(): Form[] {
		return [this.rootForm].concat(this.children.flatMap((c) => c.allForms()))
	}

	constructor(
		rootForm: ICureForm,
		currentContact: Contact,
		contactsHistory: Contact[],
		serviceFactory: (label: string, serviceId?: string) => Service,
		children: ContactFormValuesContainer[],
		formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<ICureForm>,
		formRecycler: (formId: string) => Promise<void>,
		changeListeners: ((newValue: ContactFormValuesContainer, changedKeys: string[] | null, force: boolean) => void)[] = [],
		anchorId?: string,
		initialised = true,
	) {
		this.rootForm = rootForm
		this._id = `${(rootForm.formTemplateId ?? '').substring(0, 4)}.${++_ordinal}`
		console.log(`+ CFVC: ${this._id} with children { ${children.map((c) => c._id).join(', ')} }`)

		if (contactsHistory.includes(currentContact)) {
			throw new Error('Illegal argument, the history must not contain the currentContact')
		}
		this.currentContact = currentContact
		this.contactsHistory = sortedBy(contactsHistory, 'created', 'desc')
		this.children = children
		this.anchorId = anchorId
		this.serviceFactory = serviceFactory
		this.formFactory = formFactory
		this.formRecycler = formRecycler
		this.changeListeners = changeListeners
		this._initialised = initialised

		this.indexedServices = [this.currentContact].concat(this.contactsHistory).reduce((acc, ctc) => {
			return (
				ctc.services
					?.filter((s) => ctc.subContacts?.some((sc) => sc.formId === this.rootForm.id && sc.services?.some((sss) => sss.serviceId === s.id)))
					?.reduce(
						(acc, s) =>
							s.id
								? {
										...acc,
										[s.id]: (acc[s.id] ?? (acc[s.id] = [])).concat({
											revision: ctc.rev ?? null,
											modified: ctc.created,
											value: s,
										}),
								  }
								: acc,
						acc,
					) ?? acc
			)
		}, {} as VersionedData<Service>)

		this.synchronise()
	}

	synchronise() {
		this.children.forEach((childFVC) => {
			this.registerChildFormValuesContainer(childFVC.synchronise(), childFVC.anchorId ?? '')
		})
		return this
	}

	//Make sure that when a child is changed, a new version of this is created with the updated child
	registerChildFormValuesContainer(childFormValueContainer: ContactFormValuesContainer, anchorId: string) {
		childFormValueContainer.changeListeners = [
			(newValue, changedKeys, force) => {
				if (changedKeys?.length === 0 && !force) {
					return
				}
				console.log(`Child ${newValue._id} ${childFormValueContainer.rootForm.formTemplateId} changed, updating parent ${this._id} ${this.rootForm.formTemplateId}`)
				const newContactFormValuesContainer = new ContactFormValuesContainer(
					this.rootForm,
					this.currentContact,
					this.contactsHistory,
					this.serviceFactory,
					this.children.map((c) => {
						return c.rootForm.id === childFormValueContainer.rootForm.id ? newValue : c
					}),
					this.formFactory,
					this.formRecycler,
					[],
					this.anchorId,
					true,
				)
				this.changeListeners.forEach((l) => notify(l, newContactFormValuesContainer, null))
			},
		]
	}

	static async fromFormsHierarchy(
		rootForm: ICureForm,
		currentContact: Contact,
		contactsHistory: Contact[],
		serviceFactory: (label: string, serviceId?: string) => Service,
		formChildrenProvider: (parentId: string | undefined) => Promise<ICureForm[]>,
		formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<ICureForm>,
		formRecycler: (formId: string) => Promise<void>,
		changeListeners: ((newValue: ContactFormValuesContainer) => void)[] = [],
	): Promise<ContactFormValuesContainer> {
		const contactFormValuesContainer = new ContactFormValuesContainer(
			rootForm,
			currentContact,
			contactsHistory,
			serviceFactory,
			rootForm.id
				? await Promise.all(
						(
							await formChildrenProvider(rootForm.id)
						).map(
							async (f) =>
								// eslint-disable-next-line max-len
								await ContactFormValuesContainer.fromFormsHierarchy(f, currentContact, contactsHistory, serviceFactory, formChildrenProvider, formFactory, formRecycler),
						),
				  )
				: [],
			formFactory,
			formRecycler,
			changeListeners,
			rootForm.descr,
			false,
		)
		contactFormValuesContainer.children.forEach((childFVC) => contactFormValuesContainer.registerChildFormValuesContainer(childFVC, childFVC.anchorId ?? 'all'))

		return contactFormValuesContainer
	}

	getLabel(): string {
		return this.rootForm.descr ?? ''
	}

	getFormId(): string | undefined {
		return this.rootForm?.formTemplateId
	}

	registerChangeListener(listener: (newValue: ContactFormValuesContainer, changedKeys: string[] | null, force: boolean) => void): void {
		this.changeListeners.push(listener)
	}

	unregisterChangeListener(listener: (newValue: ContactFormValuesContainer, changedKeys: string[] | null, force: boolean) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
	}

	async getChildren(): Promise<ContactFormValuesContainer[]> {
		return this.children
	}

	getValidationErrors(): Promise<[FieldMetadata, string] | null>[] {
		throw new Error('Validation not supported at contact level')
	}

	getDefaultValueProvider(): (() => Promise<FieldValue | undefined>) | undefined {
		return undefined
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

	getMetadata(id: string, revisions: (string | null)[]): VersionedData<ServiceMetadata> {
		return [this.currentContact]
			.concat(this.contactsHistory)
			.filter((ctc) => ctc.rev !== undefined && revisions.includes(ctc.rev))
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

	setMetadata(meta: ServiceMetadata, id?: string): void {
		const service = (id && this.getServiceInCurrentContact(id)) || this.serviceFactory(meta.label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		if (
			(meta.responsible && service.responsible !== meta.responsible) ||
			(meta.valueDate && service.valueDate !== meta.valueDate) ||
			(meta.codes && service.codes !== meta.codes) ||
			(meta.tags && service.tags !== meta.tags)
		) {
			const newService = new Service({ ...service, modified: Date.now() })
			meta.responsible && (newService.responsible = meta.responsible)
			meta.valueDate && (newService.valueDate = meta.valueDate)
			meta.codes && (newService.codes = normalizeCodes(meta.codes))
			meta.tags && (newService.tags = normalizeCodes(meta.tags))

			const newFormValuesContainer = new ContactFormValuesContainer(
				this.rootForm,
				{
					...this.currentContact,
					services: this.currentContact.services?.map((s) => (s.id === service.id ? newService : s)),
				},
				this.contactsHistory,
				this.serviceFactory,
				this.children,
				this.formFactory,
				this.formRecycler,
				this.changeListeners,
				this.anchorId,
				true,
			)

			this.changeListeners.forEach((l) => notify(l, newFormValuesContainer, [meta.label]))
		}
	}

	setValue(
		label: string,
		language: string,
		value?: Service,
		id?: string,
		metadata?: ServiceMetadata,
		changeListenersOverrider?: (fvc: ContactFormValuesContainer, changedKeys: string[] | null) => void,
	): void {
		const service = (id && this.getServicesInHistory((sid: string, history) => (sid === id ? history.map((x) => x.revision) : []))[id]?.[0]?.value) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}
		console.log(
			`Setting value of service ${service.label} [${service.id}] to ${Object.entries(value?.content ?? {}).map(([k, c]) => `${k}: ${JSON.stringify(contentToPrimitiveType(k, c))}`)} and md`,
			metadata,
		)
		const newContent = value?.content?.[language]

		const newCodes = value?.codes ? normalizeCodes(value.codes) : []
		if (!isContentEqual(service.content?.[language], newContent) || (newCodes && !areCodesEqual(newCodes, service.codes ?? []))) {
			const newService = new Service({ ...service, modified: Date.now() })
			const newContents = newContent
				? {
						...(service.content || {}),
						[language]: newContent,
				  }
				: { ...(service.content || {}) }
			if (!newContent) {
				delete newContents[language]
			}

			let newCurrentContact: Contact
			if (!Object.entries(newContents).filter(([, cnt]) => cnt !== undefined).length) {
				newCurrentContact = {
					...this.currentContact,
					subContacts: (this.currentContact.subContacts ?? []).some((sc) => sc.formId === this.rootForm.id)
						? (this.currentContact.subContacts ?? []).map((sc) => {
								if (sc.formId === this.rootForm.id) {
									return {
										...sc,
										services: (sc.services ?? []).filter((s) => s.serviceId !== service.id).concat([{ serviceId: service.id }]),
									}
								} else {
									return sc
								}
						  })
						: (this.currentContact.subContacts ?? []).concat({ formId: this.rootForm.id, services: [{ serviceId: service.id }] }),
					services: (this.currentContact.services ?? []).some((s) => s.id === service.id)
						? (this.currentContact.services ?? []).filter((s) => s.id !== service.id)
						: [...(this.currentContact.services ?? [])],
				}
			} else {
				newService.content = newContents
				newService.codes = newCodes

				if (metadata) {
					newService.responsible = metadata.responsible ?? newService.responsible
					newService.valueDate = metadata.valueDate ?? newService.valueDate
					newService.tags = metadata.tags ? normalizeCodes(metadata.tags) : newService.tags
					newService.label = metadata.label ?? newService.label
				}

				newCurrentContact = {
					...this.currentContact,
					subContacts: (this.currentContact.subContacts ?? []).some((sc) => sc.formId === this.rootForm.id)
						? (this.currentContact.subContacts ?? []).map((sc) => {
								if (sc.formId === this.rootForm.id) {
									return {
										...sc,
										services: (sc.services ?? []).filter((s) => s.serviceId !== service.id).concat([{ serviceId: service.id }]),
									}
								} else {
									return sc
								}
						  })
						: (this.currentContact.subContacts ?? []).concat({ formId: this.rootForm.id, services: [{ serviceId: service.id }] }),
					services: (this.currentContact.services ?? []).some((s) => s.id === service.id)
						? (this.currentContact.services ?? []).map((s) => (s.id === service.id ? newService : s))
						: [...(this.currentContact.services ?? []), newService],
				}
			}
			const newFormValuesContainer = new ContactFormValuesContainer(
				this.rootForm,
				newCurrentContact,
				this.contactsHistory.map((c) => (c === this.currentContact ? newCurrentContact : c)),
				this.serviceFactory,
				this.children,
				this.formFactory,
				this.formRecycler,
				this.changeListeners,
				this.anchorId,
				true,
			)

			changeListenersOverrider ? changeListenersOverrider(newFormValuesContainer, [label]) : this.changeListeners.forEach((l) => notify(l, newFormValuesContainer, [label]))
		}
	}

	delete(serviceId: string): void {
		const service = this.getServiceInCurrentContact(serviceId)
		if (service) {
			const newFormValuesContainer = new ContactFormValuesContainer(
				this.rootForm,
				{
					...this.currentContact,
					services: this.currentContact.services?.map((s) =>
						s.id === serviceId
							? new Service({
									...service,
									endOfLife: Date.now(),
							  })
							: s,
					),
				},
				this.contactsHistory,
				this.serviceFactory,
				this.children,
				this.formFactory,
				this.formRecycler,
				this.changeListeners,
				this.anchorId,
				true,
			)

			this.changeListeners.forEach((l) => notify(l, newFormValuesContainer, [service.label ?? service.id] /* only the label is going to propagate the changes for the formulas */))
		}
	}

	toMarkdownTable(): string {
		const tableRows: [string, string, string][] = []
		for (const [, versions] of Object.entries(this.indexedServices)) {
			if (!versions.length) continue
			const service = versions[0].value
			const label = service.label ?? service.id ?? ''
			const modifiedStr = service.modified ? new Date(service.modified).toISOString() : ''
			const contentParts: string[] = []
			for (const [lng, cnt] of Object.entries(service.content ?? {})) {
				const primitive = contentToPrimitiveType(lng, cnt)
				if (primitive) {
					contentParts.push(primitiveTypeToString(primitive))
				}
			}
			tableRows.push([label, modifiedStr, contentParts.join(', ')])
		}
		const headers: [string, string, string] = ['Label', 'Modified', 'Content']
		const colWidths = headers.map((h, i) => Math.max(h.length, ...tableRows.map((r) => r[i].length)))
		const pad = (s: string, w: number) => s + ' '.repeat(w - s.length)
		const formatRow = (cells: [string, string, string]) => '| ' + cells.map((c, i) => pad(c, colWidths[i])).join(' | ') + ' |'
		const separator = '|' + colWidths.map((w) => '-'.repeat(w + 2)).join('|') + '|'
		return [formatRow(headers), separator, ...tableRows.map(formatRow)].join('\n')
	}

	async compute<T>(): Promise<ComputationResult<T>> {
		throw new Error('Compute not supported at contact level')
	}

	/** returns all services in history that match a selector
	 *
	 * @private
	 * @param revisionsFilter
	 */
	private getServicesInHistory(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => (string | null)[]): VersionedData<Service> {
		//index services in history by id
		return Object.entries(this.indexedServices)
			.map(([id, history]) => {
				const keptRevisions = revisionsFilter(
					id,
					history.map(({ revision, modified, value: s }) => ({
						revision,
						modified,
						value: {
							label: s.label ?? s.id ?? '',
							owner: s.responsible,
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

	async addChild(anchorId: string, templateId: string, label: string): Promise<void> {
		const parentId = this.rootForm.id
		if (!parentId) return

		const newForm = await this.formFactory(parentId, anchorId, templateId, label)
		const childFVC = new ContactFormValuesContainer(newForm, this.currentContact, this.contactsHistory, this.serviceFactory, [], this.formFactory, this.formRecycler, [], anchorId, false)

		const newContactFormValuesContainer = new ContactFormValuesContainer(
			this.rootForm,
			this.currentContact,
			this.contactsHistory,
			this.serviceFactory,
			[...this.children, childFVC],
			this.formFactory,
			this.formRecycler,
			this.changeListeners,
			this.anchorId,
			true,
		)
		newContactFormValuesContainer.registerChildFormValuesContainer(childFVC, anchorId)
		this.changeListeners.forEach((l) => {
			notify(l, newContactFormValuesContainer, null)
		})
	}

	private getServiceInCurrentContact(id: string): Service | undefined {
		const service = (this.currentContact.services || [])?.find((s) => s.id === id)
		return service ?? undefined
	}

	async removeChild(container: ContactFormValuesContainer): Promise<void> {
		const newContactFormValuesContainer = new ContactFormValuesContainer(
			this.rootForm,
			this.currentContact,
			this.contactsHistory,
			this.serviceFactory,
			this.children.filter((c) => c.rootForm.id !== container.rootForm.id),
			this.formFactory,
			this.formRecycler,
			this.changeListeners,
			this.anchorId,
			true,
		)
		this.changeListeners.forEach((l) => notify(l, newContactFormValuesContainer, [`subForms_${container.anchorId ?? 'all'}`]))
	}
}

// Runtime validation for FieldValue — guards against mistyped data coming from
// external callers (formulas, SDK bridges, etc.) where the TypeScript types may
// not match the actual runtime values.
const validatePrimitiveType = (pt: PrimitiveType, path: string): void => {
	const v: any = pt.value
	switch (pt.type) {
		case 'string':
			if (typeof v !== 'string') {
				throw new Error(`${path}: expected string value, got ${typeof v}`)
			}
			break
		case 'number':
			if (typeof v !== 'number') {
				throw new Error(`${path}: expected number value, got ${typeof v}`)
			}
			break
		case 'boolean':
			if (typeof v !== 'boolean') {
				throw new Error(`${path}: expected boolean value, got ${typeof v}`)
			}
			break
		case 'timestamp':
			if (typeof v !== 'number') {
				throw new Error(`${path}: expected number value for timestamp, got ${typeof v}`)
			}
			break
		case 'datetime':
			if (typeof v !== 'number') {
				throw new Error(`${path}: expected number value for datetime, got ${typeof v}`)
			}
			break
		case 'measure': {
			const m: any = pt
			if (m.value !== undefined && typeof m.value !== 'number') {
				throw new Error(`${path}: expected number or undefined value for measure, got ${typeof m.value}`)
			}
			if (m.unit !== undefined && typeof m.unit !== 'string') {
				throw new Error(`${path}: expected string or undefined unit for measure, got ${typeof m.unit}`)
			}
			break
		}
		case 'compound':
			if (typeof v !== 'object' || v === null || Array.isArray(v)) {
				throw new Error(`${path}: expected object value for compound, got ${Array.isArray(v) ? 'array' : typeof v}`)
			}
			for (const [key, subValue] of Object.entries(v as { [label: string]: PrimitiveType })) {
				validatePrimitiveType(subValue, `${path}.compound[${key}]`)
			}
			break
		default:
			throw new Error(`${path}: unknown PrimitiveType type: ${(pt as any).type}`)
	}
}

const validateCode = (code: { id: string; label?: { [key: string]: string } }, path: string): void => {
	const id: any = code.id
	if (!id || typeof id !== 'string') {
		throw new Error(`${path}: code must have a non-empty string id, got ${JSON.stringify(id)}`)
	}
}

const validateFieldValue = (fv: FieldValue, language: string, label: string): void => {
	const pt = fv.content[language]
	if (pt) {
		validatePrimitiveType(pt, `FieldValue[${label}].content[${language}]`)
	}
	if (fv.codes) {
		fv.codes.forEach((code, i) => validateCode(code, `FieldValue[${label}].codes[${i}]`))
	}
}

const setValueOnContactFormValuesContainer = (
	cfvc: ContactFormValuesContainer,
	label: string,
	language: string,
	fv?: FieldValue,
	id?: string,
	metadata?: FieldMetadata,
	changeListenersOverrider?: (fvc: ContactFormValuesContainer, changedKeys: string[] | null) => void,
) => {
	if (fv) {
		validateFieldValue(fv, language, label)
	}
	const value = fv?.content[language]
	cfvc.setValue(
		label,
		language,
		{
			id: id,
			codes: fv?.codes ?? [],
			content: value
				? {
						[language]: primitiveTypeToContent(language, value),
				  }
				: undefined,
		},
		id,
		metadata
			? {
					label: metadata?.label ?? label,
					responsible: metadata?.owner,
					valueDate: metadata?.valueDate,
					tags: metadata?.tags,
			  }
			: undefined,
		changeListenersOverrider,
	)
}
