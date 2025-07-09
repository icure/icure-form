import { CodeStub, DecryptedContact, DecryptedForm as CardinalForm, DecryptedService, DecryptedSubContact } from '@icure/cardinal-sdk'
import { sortedBy } from '../utils/no-lodash'
import { FormValuesContainer, Version, VersionedData } from '../generic'
import { CodeStubWithId, ServiceMetadata } from './model'
import { FieldMetadata, FieldValue, Metadata as GenericMetadata, PrimitiveType, Validator } from '../components/model'
import { areCodesEqual, codeStubToCode, contentToPrimitiveType, isContentEqual, primitiveTypeToContent } from './icure-utils'
import { parsePrimitive } from '../utils/primitive'
import { anyDateToDate, dateToFuzzyDate } from '../utils/dates'
import { normalizeCodes } from '../utils/code-utils'

let bfvcIdGen = 0
let cfvcIdGen = 0

function notify<Value, Metadata>(
	l: (fvc: FormValuesContainer<Value, Metadata>, modifiedFields: GenericMetadata[], recurse?: boolean) => void,
	fvc: FormValuesContainer<Value, Metadata>,
	modifiedFields: GenericMetadata[] = [],
	context: string | undefined = undefined,
	id: string | undefined = undefined,
	recurse = false,
) {
	console.log(
		`${id ?? 'cc'}: Notifying listener with context [>>> ${(fvc as any)['_id']}] -> ${context} <- ${
			modifiedFields.length ? `and modified fields ${modifiedFields.map((f) => f.label).join(', ')}` : ''
		}`,
	)
	l(fvc, modifiedFields, recurse)
}

type Computation = {
	metadata: FieldMetadata
	revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
	computation: Promise<unknown>
	status: 'pending' | 'resolved' | 'rejected'
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
	private readonly contact: DecryptedContact
	private readonly contactFormValuesContainer: ContactFormValuesContainer
	private _id = `B-${(bfvcIdGen++).toString()}`
	private readonly mutateAndNotify: (newContactFormValuesContainer: ContactFormValuesContainer, modifiedFields: GenericMetadata[]) => Promise<BridgedFormValuesContainer>

	private readonly responsible: string
	private readonly interpreter?: <
		T,
		S extends {
			[key: string | symbol]: unknown
		},
	>(
		formula: string,
		sandbox: S,
	) => Promise<T | undefined>
	private readonly initialValuesProvider: (
		anchorId?: string,
		templateId?: string,
		modifiedFields?: GenericMetadata[],
	) => {
		metadata: FieldMetadata
		revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
		formula: string
	}[] = () => []
	private readonly dependentValuesProvider: (
		anchorId: string | undefined,
		templateId: string | undefined,
		modifiedFields?: GenericMetadata[],
	) => {
		metadata: FieldMetadata
		revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
		formula: string
	}[] = () => []
	private readonly validatorsProvider: (
		anchorId: string | undefined,
		templateId: string,
	) => {
		metadata: FieldMetadata
		validators: Validator[]
	}[] = () => []
	private readonly language: string = 'en'
	private changeListeners: ((newValue: BridgedFormValuesContainer, modifiedFields: GenericMetadata[]) => void)[] = []
	private readonly interpreterContext: { [variable: string]: () => unknown } = {}
	private readonly currentComputations: {
		[key: string]: {
			metadata: FieldMetadata
			revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
			computation: Promise<unknown>
			status: 'pending' | 'resolved' | 'rejected'
		}
	} = {}

	toString(): string {
		return `Bridged(${this.contactFormValuesContainer.rootForm.formTemplateId}[${this.contactFormValuesContainer.rootForm.id}]) - ${this._id}`
	}

	private options() {
		return {
			responsible: this.responsible,
			contactFormValuesContainer: this.contactFormValuesContainer,
			interpreter: this.interpreter,
			contact: this.contact,
			initialValuesProvider: this.initialValuesProvider,
			dependentValuesProvider: this.dependentValuesProvider,
			validatorsProvider: this.validatorsProvider,
			language: this.language,
			changeListeners: this.changeListeners,
			interpreterContext: this.interpreterContext,
			currentComputations: this.currentComputations,
		}
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
	 * @param currentComputations A list of ongoing computations that should be observed and not recomputed when the form is created.
	 * @param modifiedFields A list of fields that have been modified and should be considered when computing the initial values
	 * @param stackLevel The stack level at which the BridgedFormValuesContainer is created, used to limit recursion induced by default values computations
	 * @param context A string that describes the context in which the BridgedFormValuesContainer is created, used for debugging purposes
	 */
	constructor({
		responsible,
		contactFormValuesContainer,
		interpreter,
		contact,
		initialValuesProvider,
		dependentValuesProvider,
		validatorsProvider,
		language,
		changeListeners,
		interpreterContext,
		currentComputations,
		modifiedFields,
		stackLevel = 0,
		context,
	}: {
		responsible: string
		contactFormValuesContainer: ContactFormValuesContainer
		interpreter?: <T, S extends Record<string | symbol, unknown>>(formula: string, sandbox: S) => Promise<T | undefined>
		contact?: DecryptedContact
		initialValuesProvider?: (
			anchorId?: string,
			templateId?: string,
			modifiedFields?: GenericMetadata[],
		) => {
			metadata: FieldMetadata
			revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
			formula: string
		}[]
		dependentValuesProvider?: (
			anchorId: string | undefined,
			templateId: string | undefined,
			modifiedFields?: GenericMetadata[],
		) => {
			metadata: FieldMetadata
			revisionsFilter: (id: string, history: Version<FieldMetadata>[]) => (string | null)[]
			formula: string
		}[]
		validatorsProvider?: (
			anchorId: string | undefined,
			templateId: string,
		) => {
			metadata: FieldMetadata
			validators: Validator[]
		}[]
		language?: string
		changeListeners?: ((newValue: BridgedFormValuesContainer, modifiedFields: GenericMetadata[]) => void)[]
		interpreterContext?: Record<string, () => unknown>
		currentComputations?: Record<string, Computation>
		modifiedFields?: GenericMetadata[]
		stackLevel?: number
		context?: string
	}) {
		console.log(`${this._id}: Creating BridgedFormValuesContainer because ${context ?? 'no context provided'}`)
		//Before start to broadcast changes, we need to fill in the contactFormValuesContainer with the dependent values
		this.contactFormValuesContainer = contactFormValuesContainer
		this.responsible = responsible
		this.interpreter = interpreter
		this.initialValuesProvider = initialValuesProvider ?? (() => [])
		this.dependentValuesProvider = dependentValuesProvider ?? (() => [])
		this.validatorsProvider = validatorsProvider ?? (() => [])
		this.language = language ?? 'en'
		this.changeListeners = changeListeners ?? []
		this.interpreterContext = interpreterContext ?? {}
		this.contact = contact ?? contactFormValuesContainer.currentContact

		const isFormValueContainerObsolete = { current: false }

		this.mutateAndNotify = async (newContactFormValuesContainer: ContactFormValuesContainer, modifiedFields: GenericMetadata[], recurse = false) => {
			newContactFormValuesContainer.unregisterChangeListener(this.mutateAndNotify)
			const modifiedLabels = modifiedFields.map((f) => f.label)
			const newBridgedFormValueContainer = new BridgedFormValuesContainer({
				...this.options(),
				contactFormValuesContainer: newContactFormValuesContainer,
				contact: this.contact === this.contactFormValuesContainer.currentContact ? newContactFormValuesContainer.currentContact : this.contact,
				currentComputations: Object.entries(this.currentComputations).reduce((acc, [label, { metadata, revisionsFilter, computation, status }]) => {
					return modifiedLabels.includes(label)
						? { ...acc, [label]: { metadata, revisionsFilter, computation, status: 'resolved' } }
						: { ...acc, [label]: { metadata, revisionsFilter, computation, status } }
				}, {}),
				modifiedFields: modifiedFields,
				context: 'ContactFormValuesContainer change',
				stackLevel: recurse ? stackLevel + 1 : stackLevel,
			})
			isFormValueContainerObsolete.current = true
			this.changeListeners.forEach((l) => notify(l, newBridgedFormValueContainer, modifiedFields, 'ContactFormValuesContainer change', this._id))

			return newBridgedFormValueContainer
		}

		this.contactFormValuesContainer.registerChangeListener(this.mutateAndNotify)
		this.currentComputations =
			(modifiedFields && !modifiedFields.length) || stackLevel > 1000
				? currentComputations ?? {}
				: this.computeDependentValues(
						this.computeInitialValues(Object.fromEntries(Object.entries(currentComputations ?? {}).filter(([, c]) => c.status === 'pending')), modifiedFields),
						modifiedFields,
				  )

		//console.log(`bFVC with uuid ${this.uuid} has the following initial computations`, Object.keys(this.currentComputations).join(', '))

		Object.entries(this.currentComputations).forEach(([label, { metadata, revisionsFilter, computation: computationPromise, status }]) => {
			computationPromise
				.then((computationResult) => {
					if (isFormValueContainerObsolete.current) {
						return
					}
					//console.log(`Computed value for ${label} in ${this.uuid} with computation`, computation)

					const newValue = this.convertRawValue(computationResult)
					const currentValue = this.getValues(revisionsFilter)

					if (newValue !== undefined || currentValue != undefined) {
						const lng = this.language ?? 'en'
						if (newValue && !newValue.content[lng] && newValue.content['*']) {
							newValue.content[lng] = newValue.content['*']
						}
						if (newValue) {
							delete newValue.content['*']
						}
						console.log(`${this._id}: setValue for ${label}`)
						if (this.setValue(label, lng, newValue, Object.keys(currentValue ?? {})[0], metadata, undefined, true)) {
							console.log(`${this._id}: Obsolete because of update`)
						} else {
							if (status === 'pending' && !isFormValueContainerObsolete.current) {
								isFormValueContainerObsolete.current = true
								console.log(`${this._id}: Obsolete because of prune`)
								const newBridgedFormValueContainer = new BridgedFormValuesContainer({
									...this.options(),
									currentComputations: Object.entries(this.currentComputations).reduce(
										(acc, [cLabel, c]) => (cLabel !== label ? { ...acc, [cLabel]: c } : { ...acc, [cLabel]: { ...c, status: 'resolved' } }),
										{},
									),
									modifiedFields: [],
									context: 'Prune computed value',
								})
								this.changeListeners.forEach((l) => notify(l, newBridgedFormValueContainer, [], 'Prune computed value', this._id))
							}
						}
					}
				})
				.catch(console.error) // Ignore errors in computations, they will be logged in the console
		})
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

	registerChangeListener(listener: (newValue: BridgedFormValuesContainer, modifiedFields: GenericMetadata[]) => void): void {
		this.changeListeners.push(listener)
	}

	unregisterChangeListener(listener: (newValue: BridgedFormValuesContainer, modifiedFields: GenericMetadata[]) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
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

	private computeInitialValues(currentComputations: Record<string, Computation>, modifiedFields?: GenericMetadata[]): Record<string, Computation> {
		return this.contactFormValuesContainer.rootForm.formTemplateId
			? this.initialValuesProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId, modifiedFields).reduce(
					(acc, { metadata, revisionsFilter, formula }) => {
						if (currentComputations[metadata.label] === undefined) {
							const currentValue = this.getValues(revisionsFilter)
							return !currentValue || !Object.keys(currentValue).length
								? {
										...acc,
										[metadata.label]: { metadata, revisionsFilter, computation: this.compute(formula), status: 'pending' },
								  }
								: acc
						} else {
							return acc
						}
					},
					currentComputations,
			  )
			: currentComputations
	}

	private computeDependentValues(currentComputations: Record<string, Computation>, modifiedFields?: GenericMetadata[]): Record<string, Computation> {
		return this.contactFormValuesContainer.rootForm.formTemplateId
			? this.dependentValuesProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId, modifiedFields).reduce(
					(acc, { metadata, revisionsFilter, formula }) => {
						return currentComputations[metadata.label] === undefined
							? {
									...acc,
									[metadata.label]: { metadata, revisionsFilter, computation: this.compute(formula), status: 'pending' },
							  }
							: acc
					},
					currentComputations,
			  )
			: currentComputations
	}

	setValue(label: string, language: string, fv?: FieldValue, id?: string, metadata?: FieldMetadata, _?: undefined, recurse = false): boolean {
		console.log(`${this._id}: setValue on ${this.contactFormValuesContainer._id}`)
		return setValueOnContactFormValuesContainer(this.contactFormValuesContainer, label, language, fv, id, metadata, recurse)
	}

	setMetadata(meta: FieldMetadata, id?: string | undefined): boolean {
		return this.contactFormValuesContainer.setMetadata(
			{
				label: meta.label,
				responsible: meta.owner,
				valueDate: meta.valueDate,
				tags: meta.tags?.map((x) => new CodeStubWithId(x)),
			},
			id,
		)
	}

	delete(serviceId: string): void {
		this.contactFormValuesContainer.delete(serviceId)
	}

	private getVersionedValuesForKey(key: string | symbol) {
		return this.getValues((_id, history) => (history?.[0]?.value?.label && key === history[0].value.label ? [history?.[0]?.revision] : []))
	}

	async compute<
		T,
		S extends {
			[key: string | symbol]: unknown
		},
	>(formula: string, sandbox?: S): Promise<T | undefined> {
		// noinspection JSUnusedGlobalSymbols
		const parseContent = (content?: { [key: string]: PrimitiveType }, toString = false) => {
			if (!content) {
				return undefined
			}
			const primitive = content[this.language] ?? content['*'] ?? content[Object.keys(content)[0]]
			return primitive && parsePrimitive(primitive, toString)
		}
		const text = (
			item?:
				| { content: { [key: string]: PrimitiveType } }
				| {
						content: { [key: string]: PrimitiveType }
				  }[],
		) => {
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
		const proxy: S = new Proxy({} as S, {
			has: (_target: S, key: string | symbol) =>
				!!native[key as string] || key === 'self' || !!this.interpreterContext[key as string] || Object.keys(this.getVersionedValuesForKey(key) ?? {}).length > 0,
			get: (_target: S, key: string | symbol) => {
				if (key === 'undefined') {
					return undefined
				}
				const nativeValue = native[key as string]
				if (!!nativeValue) {
					return nativeValue
				}
				return key === 'self' ? proxy : this.interpreterContext[key as string] ? this.interpreterContext[key as string]() : Object.values(this.getVersionedValuesForKey(key)).map((v) => v[0]?.value)
			},
		})
		return this.interpreter?.(formula, sandbox ?? proxy)
	}

	isFieldBeingComputed(label: string): boolean {
		return this.currentComputations[label]?.status === 'pending'
	}

	async getChildren(): Promise<FormValuesContainer<FieldValue, FieldMetadata>[]> {
		const children = await Promise.all(
			(
				await this.contactFormValuesContainer.getChildren()
			).map(
				(fvc) =>
					new BridgedFormValuesContainer({
						responsible: this.responsible,
						contactFormValuesContainer: fvc,
						interpreter: this.interpreter,
						contact: this.contact,
						initialValuesProvider: this.initialValuesProvider,
						dependentValuesProvider: this.dependentValuesProvider,
						validatorsProvider: this.validatorsProvider,
						language: this.language,
						interpreterContext: this.interpreterContext,
						context: 'New child form',
					}),
			),
		)
		console.log(`${children.length} children found in ${this.contactFormValuesContainer.rootForm.formTemplateId} initialised with `, this.initialValuesProvider)
		return children
	}

	async getValidationErrors(): Promise<[FieldMetadata, string][]> {
		if (this.contactFormValuesContainer.rootForm.formTemplateId) {
			// noinspection ES6MissingAwait
			return await this.validatorsProvider(this.contactFormValuesContainer.rootForm.descr, this.contactFormValuesContainer.rootForm.formTemplateId).reduce(
				async (resPromise, { metadata, validators }) =>
					await validators.reduce(async (resPromise, { validation, message }) => {
						const res = await resPromise
						try {
							if (!(await this.compute(validation))) {
								res.push([metadata, message])
							}
						} catch (e) {
							console.warn(`Error while computing validation : ${validation}`, e)
						}
						return res
					}, resPromise),
				Promise.resolve([]) as Promise<[FieldMetadata, string][]>,
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
export class ContactFormValuesContainer implements FormValuesContainer<DecryptedService, ServiceMetadata> {
	rootForm: CardinalForm
	currentContact: DecryptedContact //The contact of the moment, used to record new modifications
	contactsHistory: DecryptedContact[] //Must be sorted (most recent first), contains all the contacts linked to this form
	children: ContactFormValuesContainer[] //Direct children of the ContactFormValuesContainer
	serviceFactory: (label: string, serviceId?: string) => DecryptedService
	formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<CardinalForm>
	formRecycler: (formId: string) => Promise<void>

	changeListeners: ((newValue: ContactFormValuesContainer, modifiedFields: GenericMetadata[], recurse?: boolean) => void)[]
	_id = `C-${(cfvcIdGen++).toString()}`
	private indexedServices: { [id: string]: Version<DecryptedService>[] }

	toString(): string {
		return `Contact(${this.rootForm.formTemplateId}[${this.rootForm.id}]) - ${this._id}`
	}

	/**
	 * Returns a contact that combines the content of the contact in this form with the content of all contents stored in the children
	 */
	coordinatedContact(): DecryptedContact {
		const childrenContacts = this.children.map((c) => c.coordinatedContact())
		const thisKeptServiceIds = (this.currentContact.subContacts ?? []).filter((sc) => sc.formId === this.rootForm.id).flatMap((sc) => (sc.services ?? []).map((s) => s.serviceId))
		return new DecryptedContact({
			...this.currentContact,
			services: childrenContacts
				.reduce((acc: DecryptedService[], c: DecryptedContact) => acc.concat(c.services ?? []), [])
				.concat((this.currentContact.services ?? []).filter((s) => thisKeptServiceIds.includes(s.id))),
			subContacts: childrenContacts
				.reduce((acc: DecryptedSubContact[], c: DecryptedContact) => acc.concat(c.subContacts ?? []), [])
				.concat((this.currentContact.subContacts ?? []).filter((s) => s.formId === this.rootForm.id)),
		})
	}

	/**
	 * Returns a contact that combines the content of the contact in this form with the content of all contents stored in the children
	 */
	allForms(): CardinalForm[] {
		return [this.rootForm].concat(this.children.flatMap((c) => c.allForms()))
	}

	constructor(
		rootForm: CardinalForm,
		currentContact: DecryptedContact,
		contactsHistory: DecryptedContact[],
		serviceFactory: (label: string, serviceId?: string) => DecryptedService,
		children: ContactFormValuesContainer[],
		formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<CardinalForm>,
		formRecycler: (formId: string) => Promise<void>,
		changeListeners: ((newValue: ContactFormValuesContainer, modifiedFields: GenericMetadata[]) => void)[] = [],
	) {
		//console.log(`Creating contact FVC (${rootForm.formTemplateId}) with ${children.length} children [${this._id}]`)

		if (contactsHistory.includes(currentContact)) {
			throw new Error('Illegal argument, the history must not contain the currentContact')
		}
		this.rootForm = rootForm
		this.currentContact = currentContact
		this.contactsHistory = sortedBy(contactsHistory, 'created', 'desc')
		this.children = children
		this.serviceFactory = serviceFactory
		this.formFactory = formFactory
		this.formRecycler = formRecycler
		this.changeListeners = changeListeners

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
		}, {} as VersionedData<DecryptedService>)

		this.synchronise()
	}

	synchronise() {
		this.children.forEach((childFVC) => {
			this.registerChildFormValuesContainer(childFVC.synchronise())
		})
		return this
	}

	//Make sure that when a child is changed, a new version of this is created with the updated child
	registerChildFormValuesContainer(childFormValueContainer: ContactFormValuesContainer) {
		childFormValueContainer.changeListeners = [
			(newValue) => {
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
				)
				this.changeListeners.forEach((l) => notify(l, newContactFormValuesContainer, [], `Child ${childFormValueContainer.rootForm.formTemplateId} changed`, this._id))
			},
		]
	}

	static async fromFormsHierarchy(
		rootForm: CardinalForm,
		currentContact: DecryptedContact,
		contactsHistory: DecryptedContact[],
		serviceFactory: (label: string, serviceId?: string) => DecryptedService,
		formChildrenProvider: (parentId: string | undefined) => Promise<CardinalForm[]>,
		formFactory: (parentId: string, anchorId: string, formTemplateId: string, label: string) => Promise<CardinalForm>,
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
		)
		contactFormValuesContainer.children.forEach((childFVC) => contactFormValuesContainer.registerChildFormValuesContainer(childFVC))

		return contactFormValuesContainer
	}

	getLabel(): string {
		return this.rootForm.descr ?? ''
	}

	getFormId(): string | undefined {
		return this.rootForm?.formTemplateId
	}

	registerChangeListener(listener: (newValue: ContactFormValuesContainer, modifiedFields: GenericMetadata[]) => void): void {
		this.changeListeners.push(listener)
	}

	unregisterChangeListener(listener: (newValue: ContactFormValuesContainer, modifiedFields: GenericMetadata[]) => void): void {
		this.changeListeners = this.changeListeners.filter((l) => l !== listener)
	}

	async getChildren(): Promise<ContactFormValuesContainer[]> {
		return this.children
	}

	async getValidationErrors(): Promise<[FieldMetadata, string][]> {
		throw new Error('Validation not supported at contact level')
	}

	getValues(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => (string | null)[]): VersionedData<DecryptedService> {
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
													tags: normalizeCodes(s.tags),
												},
											}),
									  }
									: acc,
							acc,
						) ?? acc,
				{} as { [id: string]: Version<ServiceMetadata>[] },
			) //index services in history by id
	}

	setMetadata(meta: ServiceMetadata, id?: string): boolean {
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
			const newService = new DecryptedService({ ...service, modified: Date.now() })
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
			)

			this.changeListeners.forEach((l) => notify(l, newFormValuesContainer, [meta], `Metadata change for service ${service.id}`, this._id))
			return true
		} else {
			return false
		}
	}

	setValue(
		label: string,
		language: string,
		value?: DecryptedService,
		id?: string,
		metadata?: ServiceMetadata,
		changeListenersOverrider?: (fvc: ContactFormValuesContainer) => void,
		recurse = false,
	): boolean {
		const service = (id && this.getServicesInHistory((sid: string, history) => (sid === id ? history.map((x) => x.revision) : []))[id]?.[0]?.value) || this.serviceFactory(label, id)
		if (!service.id) {
			throw new Error('Service id must be defined')
		}

		const newContent = value?.content?.[language]
		const newCodes = value?.codes ? normalizeCodes(value.codes) : []

		if (!isContentEqual(service.content?.[language], newContent) || (newCodes && !areCodesEqual(newCodes, service.codes ?? []))) {
			//console.log('Setting value of service', service.id, 'with', value, 'and metadata', metadata)

			const newService = new DecryptedService({ ...service, modified: Date.now() })
			const newContents = newContent
				? {
						...(service.content || {}),
						[language]: newContent,
				  }
				: { ...(service.content || {}) }
			if (!newContent) {
				delete newContents[language]
			}

			let newCurrentContact: DecryptedContact
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
						: (this.currentContact.subContacts ?? []).concat(
								new DecryptedSubContact({
									formId: this.rootForm.id,
									services: [{ serviceId: service.id }],
								}),
						  ),
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
						: (this.currentContact.subContacts ?? []).concat(
								new DecryptedSubContact({
									formId: this.rootForm.id,
									services: [{ serviceId: service.id }],
								}),
						  ),
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
			)

			changeListenersOverrider
				? changeListenersOverrider(newFormValuesContainer)
				: this.changeListeners.forEach((l) =>
						notify(
							l,
							newFormValuesContainer,
							[
								{
									valueDate: newService.valueDate,
									tags: normalizeCodes(newService.tags),
									label: newService.label ?? label,
								},
							],
							`Set value of service ${service.id}}`,
							this._id,
							recurse,
						),
				  )
			return true
		} else {
			return false
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
							? new DecryptedService({
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
			)

			this.changeListeners.forEach((l) => notify(l, newFormValuesContainer, [], `Delete service ${serviceId}`, this._id))
		}
	}

	async compute<T>(): Promise<T | undefined> {
		throw new Error('Compute not supported at contact level')
	}

	isFieldBeingComputed(): boolean {
		return false
	}

	/** returns all services in history that match a selector
	 *
	 * @private
	 * @param revisionsFilter
	 */
	private getServicesInHistory(revisionsFilter: (id: string, history: Version<ServiceMetadata>[]) => (string | null)[]): VersionedData<DecryptedService> {
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
							tags: normalizeCodes(s.tags),
						},
					})),
				)
				return [id, history.filter(({ revision }) => keptRevisions.includes(revision))] as [string, Version<DecryptedService>[]]
			})
			.reduce((acc, [id, history]) => ({ ...acc, [id]: history }), {})
	}

	async addChild(anchorId: string, templateId: string, label: string): Promise<void> {
		const parentId = this.rootForm.id
		if (!parentId) return

		const newForm = await this.formFactory(parentId, anchorId, templateId, label)
		const childFVC = new ContactFormValuesContainer(newForm, this.currentContact, this.contactsHistory, this.serviceFactory, [], this.formFactory, this.formRecycler, [])

		const newContactFormValuesContainer = new ContactFormValuesContainer(
			this.rootForm,
			this.currentContact,
			this.contactsHistory,
			this.serviceFactory,
			[...this.children, childFVC],
			this.formFactory,
			this.formRecycler,
			this.changeListeners,
		)
		newContactFormValuesContainer.registerChildFormValuesContainer(childFVC)
		this.changeListeners.forEach((l) => notify(l, newContactFormValuesContainer, [], `Add child form ${newForm.formTemplateId} to contact form ${this.rootForm.formTemplateId}`, this._id))
	}

	private getServiceInCurrentContact(id: string): DecryptedService | undefined {
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
		)
		this.changeListeners.forEach((l) =>
			notify(l, newContactFormValuesContainer, [], `Remove child form ${container.rootForm.formTemplateId} from contact form ${this.rootForm.formTemplateId}`, this._id),
		)
	}
}

const setValueOnContactFormValuesContainer = (cfvc: ContactFormValuesContainer, label: string, language: string, fv?: FieldValue, id?: string, metadata?: FieldMetadata, recurse = false): boolean => {
	const value = fv?.content[language]
	return cfvc.setValue(
		label,
		language,
		new DecryptedService({
			id: id,
			codes: fv?.codes?.map((x) => new CodeStub(x)) ?? [],
			content: value
				? {
						[language]: primitiveTypeToContent(language, value),
				  }
				: undefined,
		}),
		id,
		metadata
			? {
					label: metadata?.label ?? label,
					responsible: metadata?.owner,
					valueDate: metadata?.valueDate,
					tags: normalizeCodes(metadata?.tags?.map((x) => new CodeStub(x))),
			  }
			: undefined,
		undefined,
		recurse,
	)
}
