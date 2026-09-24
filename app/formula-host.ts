import { DecryptedContact, DecryptedPatient } from '@icure/cardinal-sdk'
import { contentToPrimitiveType } from '../src/icure/icure-utils'
import { PrimitiveType } from '../src/components/model'
import { anyDateToDate } from '../src/utils/dates'

/**
 * The demo app's answer to the data a formula needs but its own form does not hold.
 *
 * `computedProperties` formulas resolve a bare name to a field of the form they are
 * on. The forms converted from the legacy pixel-positioned layouts routinely reached
 * further than that — the patient's earlier services, the services of the care path,
 * the patient's demographics, the date of the consultation — through host functions
 * (`withServices(p.id, …)`) and an XPath dialect (`@<demarche/sscontacts/services[…]>@`)
 * that the `computedProperties` sandbox has no equivalent for.
 *
 * These three entries are that equivalent, exposed the way `summarize` already is:
 * through `<icure-form>`'s `interpreterContext`, as async functions a formula awaits.
 * A real host answers them out of the SDK; the demo answers them out of the in-memory
 * contacts in `decorated-form.ts`, so the demo forms can exercise the shape end to end.
 */

/** A service as a formula sees it. */
export type HostService = {
	id?: string
	label?: string
	valueDate?: number
	/**
	 * Language-keyed, and already converted to the primitive shape the sandbox's own
	 * `parseContent` reads, so a returned service and a field value are the same shape
	 * to a formula: `parseContent(s.content)`.
	 */
	content: { [language: string]: PrimitiveType }
	codes: { id?: string }[]
	tags: { id?: string }[]
}

/**
 * Which services to look at, and which of those to keep. Scope and selector are
 * independent: the legacy split — `withServices` for codes, XPath for labels and for
 * the care path — reflected two eras of the old form engine rather than two ideas.
 *
 * Selectors combine: giving both a code and a label keeps only services matching both.
 * Omitting every selector keeps every service in scope.
 */
export type ServiceFilter = {
	/** `'patient'` (the default) reads every contact; `'carePath'` only the current one's. */
	scope?: 'patient' | 'carePath'
	/** Matched against the service's `codes`, on a `<type>|<code>|<version>` stub id. */
	codeType?: string
	code?: string
	/** Matched against the service's `tags`, the same way. */
	tagType?: string
	tag?: string
	/** Exact service label. */
	label?: string
	/** Newest first unless `order` says otherwise. */
	order?: 'desc' | 'asc'
	limit?: number
}

/** What the demo has to answer from. Structural, so any equivalent fixture fits. */
export type FormulaHostSources = {
	patient: DecryptedPatient
	/** Every contact of the patient, in any order. */
	contacts: DecryptedContact[]
	/** The contact being edited, which also stands in for the care path — see below. */
	currentContact: DecryptedContact
	/**
	 * Awaited once per distinct lookup, before it is answered. The demo passes a timer so
	 * the async recompute path is exercised the way a networked host would exercise it;
	 * the tests pass nothing. It sits inside the cache, so a repeated query stays free.
	 */
	beforeLookup?: () => Promise<void>
}

export type FormulaHostContext = {
	services: () => (filter?: ServiceFilter) => Promise<HostService[]>
	patient: () => { dateOfBirth: Date | undefined; gender: string | undefined }
	consultDate: () => Date | undefined
	/** Lookups actually performed, i.e. those the cache did not answer. For the tests. */
	lookupCount: () => number
}

/** `true` when a `<type>|<code>|<version>` stub id matches the type and code asked for. */
const stubMatches = (stubs: { id?: string; type?: string; code?: string }[] | undefined, type: string | undefined, code: string | undefined): boolean =>
	(stubs ?? []).some((stub) => {
		const parts = stub.id?.split('|') ?? []
		return (!type || (stub.type ?? parts[0]) === type) && (!code || (stub.code ?? parts[1]) === code)
	})

/**
 * A stable key for a filter, so two formulas asking the same question share one lookup
 * however they spelled the object. Twenty-eight of the legacy gynaecology formulas ask
 * for the same `CD-GYNECOLOGY|duedate` services, and each is recomputed whenever one of
 * its fields changes.
 */
const cacheKey = (filter: ServiceFilter): string =>
	JSON.stringify([filter.scope ?? 'patient', filter.codeType, filter.code, filter.tagType, filter.tag, filter.label, filter.order ?? 'desc', filter.limit])

export const makeFormulaHostContext = ({ patient, contacts, currentContact, beforeLookup }: FormulaHostSources): FormulaHostContext => {
	const cache = new Map<string, Promise<HostService[]>>()
	let lookups = 0

	const lookUp = async (filter: ServiceFilter): Promise<HostService[]> => {
		lookups++
		await beforeLookup?.()
		// The fixtures have no care path of their own, so 'carePath' means the contact
		// being edited. A real host would resolve the episode the contact belongs to.
		const inScope = (filter.scope ?? 'patient') === 'carePath' ? [currentContact] : contacts
		const matching = inScope.flatMap((contact) =>
			(contact.services ?? [])
				.filter(
					(service) =>
						(!filter.label || service.label === filter.label) &&
						(!filter.codeType && !filter.code ? true : stubMatches(service.codes, filter.codeType, filter.code)) &&
						(!filter.tagType && !filter.tag ? true : stubMatches(service.tags, filter.tagType, filter.tag)),
				)
				// A service with no valueDate is dated by the contact it belongs to, so it
				// sorts by when it was recorded rather than falling to the end.
				.map((service) => ({ service, on: service.valueDate ?? contact.created ?? 0 })),
		)

		matching.sort((a, b) => (filter.order === 'asc' ? a.on - b.on : b.on - a.on))

		const found = matching.map(({ service }) => ({
			id: service.id,
			label: service.label,
			valueDate: service.valueDate,
			content: Object.entries(service.content ?? {}).reduce((acc, [language, content]) => {
				const primitive = contentToPrimitiveType(language, content)
				return primitive ? { ...acc, [language]: primitive } : acc
			}, {}),
			codes: service.codes ?? [],
			tags: service.tags ?? [],
		}))

		return filter.limit === undefined ? found : found.slice(0, filter.limit)
	}

	const services = (filter: ServiceFilter = {}) => {
		const key = cacheKey(filter)
		const cached = cache.get(key)
		if (cached) {
			return cached
		}
		const pending = lookUp(filter)
		cache.set(key, pending)
		return pending
	}

	return {
		services: () => services,
		patient: () => ({ dateOfBirth: patient.dateOfBirth ? anyDateToDate(patient.dateOfBirth) : undefined, gender: patient.gender ?? undefined }),
		consultDate: () => (currentContact.created ? new Date(currentContact.created) : undefined),
		lookupCount: () => lookups,
	}
}
