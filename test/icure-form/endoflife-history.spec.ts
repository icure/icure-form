import { Contact, Form as ICureForm, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../../src/icure/form-values-container'

/**
 * Reproduces the "deleted service reappears after several edits" bug:
 *
 * 1. rev 1 — a service is created with content and saved.
 * 2. rev 2 — the service is deleted: it is saved with an endOfLife tombstone.
 * 3. rev 3 — another field is modified and saved. Since coordinatedContact only
 *    persists modified services, the tombstoned service is NOT part of rev 3.
 *
 * When the form is reopened (currentContact = rev 3, history = [rev 1, rev 2]),
 * the endOfLife tombstone only lives in history. The constructor must therefore
 * derive endOfLifeServiceIds from the whole contact chain — using the most
 * recent occurrence of each service to decide — not from the current contact
 * alone, otherwise the rev 1 value resurfaces.
 */

const FORM_ID = 'form-id'
const FORM_TEMPLATE_ID = 'form-template-id'
const DELETED_SERVICE_ID = 'deleted-service'
const OTHER_SERVICE_ID = 'other-service'

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

const buildContainer = (currentContact: Contact, history: Contact[]): ContactFormValuesContainer =>
	new ContactFormValuesContainer(makeForm(), currentContact, history, serviceFactory, [], formFactory, formRecycler, [], undefined, true)

describe('endOfLife services across the contact history', () => {
	const t0 = Date.now() - 30000

	const rev1 = () =>
		new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: t0,
			services: [
				new Service({ id: DELETED_SERVICE_ID, label: 'DeletedField', created: t0, modified: t0, content: { en: { stringValue: 'to be deleted' } } }),
				new Service({ id: OTHER_SERVICE_ID, label: 'OtherField', created: t0, modified: t0, content: { en: { stringValue: 'other' } } }),
			],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: DELETED_SERVICE_ID }, { serviceId: OTHER_SERVICE_ID }] }],
		})

	const rev2WithTombstone = () =>
		new Contact({
			id: 'contact-1',
			rev: '2-def',
			created: t0 + 10000,
			services: [new Service({ id: DELETED_SERVICE_ID, created: t0, modified: t0 + 10000, endOfLife: t0 + 10000 })],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: DELETED_SERVICE_ID }] }],
		})

	it('does not display a service whose endOfLife tombstone only exists in a past contact version', () => {
		// rev 3: only the other (modified) service was persisted — the tombstone is absent.
		const rev3 = new Contact({
			id: 'contact-1',
			rev: '3-ghi',
			created: t0 + 20000,
			services: [new Service({ id: OTHER_SERVICE_ID, label: 'OtherField', created: t0, modified: t0 + 20000, content: { en: { stringValue: 'other, edited' } } })],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: OTHER_SERVICE_ID }] }],
		})

		const container = buildContainer(rev3, [rev1(), rev2WithTombstone()])
		const values = container.getValues((id, history) => history.map((h) => h.revision))

		expect(values[DELETED_SERVICE_ID]).toBeUndefined()
		expect(values[OTHER_SERVICE_ID]).toBeDefined()
	})

	it('displays a service again when it was re-created after having been tombstoned', () => {
		// rev 3 resurrects the deleted service with fresh content.
		const rev3 = new Contact({
			id: 'contact-1',
			rev: '3-ghi',
			created: t0 + 20000,
			services: [new Service({ id: DELETED_SERVICE_ID, label: 'DeletedField', created: t0, modified: t0 + 20000, content: { en: { stringValue: 'recreated' } } })],
			subContacts: [{ formId: FORM_ID, services: [{ serviceId: DELETED_SERVICE_ID }] }],
		})

		const container = buildContainer(rev3, [rev1(), rev2WithTombstone()])
		const values = container.getValues((id, history) => history.map((h) => h.revision))

		expect(values[DELETED_SERVICE_ID]).toBeDefined()
		expect(values[DELETED_SERVICE_ID]?.[0]?.value?.content?.en?.stringValue).toEqual('recreated')
	})
})
