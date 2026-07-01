import { Contact, Form as ICureForm, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../../src/icure/form-values-container'

/**
 * Tests for emptying a field (setValue with no content) and how the underlying
 * service is treated depending on whether it also exists in a history contact.
 *
 * - A service that exists ONLY in the current contact can be removed entirely:
 *   nothing in history would resurface it.
 * - A service that also lives in a history contact (linked to this form via a
 *   subContact) must NOT be removed — it would reappear from history on reload.
 *   It must be kept with an `endOfLife` tombstone instead.
 */

const FORM_ID = 'form-id'
const FORM_TEMPLATE_ID = 'form-template-id'
const FIELD_LABEL = 'Field1'
const SERVICE_ID = 'service-1'

let serviceOrdinal = 0
const serviceFactory = (label: string, serviceId?: string): Service =>
	new Service({
		id: serviceId ?? `service-${++serviceOrdinal}`,
		label,
		created: Date.now(),
		modified: Date.now(),
		content: {},
	})

const formFactory = async (parentId: string, anchorId: string, formTemplateId: string, label: string): Promise<ICureForm> =>
	new ICureForm({ id: `new-form-${Date.now()}`, formTemplateId, descr: label, parent: parentId })

const formRecycler = async (): Promise<void> => {
	// no-op
}

const makeForm = (): ICureForm => new ICureForm({ id: FORM_ID, formTemplateId: FORM_TEMPLATE_ID, descr: 'Form' })

const filledService = (createdAt: number): Service => new Service({ id: SERVICE_ID, label: FIELD_LABEL, created: createdAt, modified: createdAt, content: { en: { stringValue: 'value' } } })

const buildContainer = (currentContact: Contact, history: Contact[]): ContactFormValuesContainer =>
	new ContactFormValuesContainer(makeForm(), currentContact, history, serviceFactory, [], formFactory, formRecycler, [], undefined, true)

const emptyField = (container: ContactFormValuesContainer): ContactFormValuesContainer => {
	let updated: ContactFormValuesContainer | undefined
	container.registerChangeListener((newValue) => {
		updated = newValue as ContactFormValuesContainer
	})
	// An empty content for the language clears the field.
	container.setValue(FIELD_LABEL, 'en', new Service({ id: SERVICE_ID, content: {} }), SERVICE_ID)
	expect(updated).toBeDefined()
	return updated!
}

describe('setValue — emptying a field', () => {
	it('removes a service that exists only in the current contact', () => {
		const now = Date.now()
		const currentContact = new Contact({
			id: 'contact-current',
			created: now,
			services: [filledService(now)],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: SERVICE_ID }] }],
		})

		const container = buildContainer(currentContact, [])
		const updated = emptyField(container)

		const coordinated = updated.coordinatedContact()
		expect(coordinated.services?.find((s) => s.id === SERVICE_ID)).toBeUndefined()
	})

	it('keeps a service that also exists in history, marking it with endOfLife', () => {
		const past = Date.now() - 10000
		const historyContact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: past,
			services: [filledService(past)],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: SERVICE_ID }] }],
		})
		const currentContact = new Contact({
			id: 'contact-2',
			rev: '2-def',
			created: past + 5000,
			services: [filledService(past + 5000)],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: SERVICE_ID }] }],
		})

		const container = buildContainer(currentContact, [historyContact])
		const updated = emptyField(container)

		const coordinated = updated.coordinatedContact()
		const svc = coordinated.services?.find((s) => s.id === SERVICE_ID)
		expect(svc).toBeDefined()
		expect(svc?.endOfLife).toBeGreaterThan(0)

		// And it must not be displayed anymore.
		const values = updated.getValues((id, history) => history.map((h) => h.revision))
		expect(values[SERVICE_ID]).toBeUndefined()
	})

	it('adds an endOfLife tombstone when the service exists only in history (not yet in the current contact)', () => {
		const past = Date.now() - 10000
		const historyContact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: past,
			services: [filledService(past)],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: SERVICE_ID }] }],
		})
		const currentContact = new Contact({
			id: 'contact-2',
			rev: '2-def',
			created: past + 5000,
			services: [],
			subContacts: [],
		})

		const container = buildContainer(currentContact, [historyContact])
		const updated = emptyField(container)

		const coordinated = updated.coordinatedContact()
		const svc = coordinated.services?.find((s) => s.id === SERVICE_ID)
		expect(svc).toBeDefined()
		expect(svc?.endOfLife).toBeGreaterThan(0)

		const values = updated.getValues((id, history) => history.map((h) => h.revision))
		expect(values[SERVICE_ID]).toBeUndefined()
	})
})
