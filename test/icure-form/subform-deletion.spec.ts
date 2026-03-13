import { Contact, Form as ICureForm, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../../src/icure/form-values-container'

/**
 * E2E test reproducing the subForm deletion bug:
 *
 * When a subForm is deleted during contact editing, the services linked to the
 * subForm/subContact should be marked with endOfLife rather than being removed
 * from the contact entirely. When reading back the contact, services with
 * endOfLife should not be displayed.
 */

const PARENT_FORM_ID = 'parent-form-id'
const PARENT_FORM_TEMPLATE_ID = 'parent-template-id'
const CHILD_FORM_ID = 'child-form-id'
const CHILD_FORM_TEMPLATE_ID = 'child-template-id'
const ANCHOR_ID = 'subform-anchor'

let serviceOrdinal = 0
const serviceFactory = (label: string, serviceId?: string): Service => {
	return new Service({
		id: serviceId ?? `service-${++serviceOrdinal}`,
		label,
		created: Date.now(),
		modified: Date.now(),
		content: {},
	})
}

const formFactory = async (_parentId: string, anchorId: string, formTemplateId: string, label: string): Promise<ICureForm> => {
	return new ICureForm({
		id: `new-child-form-${Date.now()}`,
		formTemplateId,
		descr: label,
		parent: _parentId,
	})
}

const formRecycler = async (_formId: string): Promise<void> => {
	// no-op
}

function makeParentForm(): ICureForm {
	return new ICureForm({
		id: PARENT_FORM_ID,
		formTemplateId: PARENT_FORM_TEMPLATE_ID,
		descr: 'Parent Form',
	})
}

function makeChildForm(): ICureForm {
	return new ICureForm({
		id: CHILD_FORM_ID,
		formTemplateId: CHILD_FORM_TEMPLATE_ID,
		descr: ANCHOR_ID,
		parent: PARENT_FORM_ID,
	})
}

describe('SubForm deletion — endOfLife handling', () => {
	/**
	 * Reproduces the full workflow:
	 *
	 * Step 1: Create a form with a subForm. Add one service to the parent form,
	 *         one service to the subForm.
	 * Step 2: Save the contact (first save).
	 * Step 3: Edit the contact and remove the subForm.
	 * Step 4: Save the updated contact as a new instance (second save).
	 * Step 5: Reconstruct a BridgedFormValuesContainer from the contact + history.
	 *
	 * Expected:
	 * - In step 3, removed services should be marked with endOfLife (not deleted).
	 * - In step 5, services with endOfLife should not be displayed.
	 */
	it('should delete the child service and subcontact subForm is removed in the same contact', async () => {
		// -- Step 1: Build the hierarchy with parent + child, each having one service --
		const parentService = new Service({
			id: 'parent-service-1',
			label: 'ParentField',
			created: Date.now(),
			modified: Date.now(),
			content: { en: { stringValue: 'parent value' } },
		})
		const childService = new Service({
			id: 'child-service-1',
			label: 'ChildField',
			created: Date.now(),
			modified: Date.now(),
			content: { en: { stringValue: 'child value' } },
		})

		const contactWithSubForm: Contact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: Date.now(),
			services: [parentService, childService],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-service-1' }] },
				{ formId: CHILD_FORM_ID, services: [{ serviceId: 'child-service-1' }] },
			],
		})

		// Build the child CFVC
		const childCFVC = new ContactFormValuesContainer(
			makeChildForm(),
			contactWithSubForm,
			[], // no history yet
			serviceFactory,
			[], // no grandchildren
			formFactory,
			formRecycler,
			[],
			ANCHOR_ID,
			true,
		)

		// Build the parent CFVC with the child
		const parentCFVC = new ContactFormValuesContainer(
			makeParentForm(),
			contactWithSubForm,
			[], // no history yet
			serviceFactory,
			[childCFVC],
			formFactory,
			formRecycler,
			[],
			undefined,
			true,
		)
		parentCFVC.synchronise()

		// -- Step 2: First save — extract the coordinated contact --
		const firstSaveContact = parentCFVC.coordinatedContact()

		// Verify both services are present
		expect(firstSaveContact.services).toHaveLength(2)
		expect(firstSaveContact.services?.find((s) => s.id === 'parent-service-1')).toBeDefined()
		expect(firstSaveContact.services?.find((s) => s.id === 'child-service-1')).toBeDefined()
		// Neither should have endOfLife
		expect(firstSaveContact.services?.every((s) => !s.endOfLife)).toBe(true)

		// Both subContacts should be present
		expect(firstSaveContact.subContacts).toHaveLength(2)

		// -- Step 3: Remove the subForm --
		let updatedParentCFVC: ContactFormValuesContainer | undefined
		parentCFVC.registerChangeListener((newValue) => {
			updatedParentCFVC = newValue as ContactFormValuesContainer
		})
		await parentCFVC.removeChild(childCFVC)

		expect(updatedParentCFVC).toBeDefined()

		// -- Verify step 3 expectations --
		const contactAfterRemoval = updatedParentCFVC!.coordinatedContact()

		expect(contactAfterRemoval.services).toHaveLength(1)
		expect(contactAfterRemoval.services?.find((s) => s.id === 'parent-service-1')).toBeDefined()
		expect(contactAfterRemoval.services?.find((s) => s.id === 'child-service-1')).toBeUndefined()
		// Neither should have endOfLife
		expect(contactAfterRemoval.services?.every((s) => !s.endOfLife)).toBe(true)

		// Only one subContact should be present
		expect(contactAfterRemoval.subContacts).toHaveLength(1)
	})

	it('should mark child services with endOfLife when subForm is removed in a **NEW** contact', async () => {
		// -- Step 1: Build the hierarchy with parent + child, each having one service --
		const parentService = new Service({
			id: 'parent-service-1',
			label: 'ParentField',
			created: Date.now(),
			modified: Date.now(),
			content: { en: { stringValue: 'parent value' } },
		})
		const childService = new Service({
			id: 'child-service-1',
			label: 'ChildField',
			created: Date.now(),
			modified: Date.now(),
			content: { en: { stringValue: 'child value' } },
		})

		const contactWithSubForm: Contact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: Date.now(),
			services: [parentService, childService],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-service-1' }] },
				{ formId: CHILD_FORM_ID, services: [{ serviceId: 'child-service-1' }] },
			],
		})

		const emptyNewContact: Contact = new Contact({
			id: 'contact-new',
			created: Date.now() + 1,
			services: [],
			subContacts: [],
		})

		// Build the child CFVC
		const childCFVC = new ContactFormValuesContainer(
			makeChildForm(),
			emptyNewContact,
			[contactWithSubForm], // no history yet
			serviceFactory,
			[], // no grandchildren
			formFactory,
			formRecycler,
			[],
			ANCHOR_ID,
			true,
		)

		// Build the parent CFVC with the child
		const parentCFVC = new ContactFormValuesContainer(
			makeParentForm(),
			emptyNewContact,
			[contactWithSubForm], // no history yet
			serviceFactory,
			[childCFVC],
			formFactory,
			formRecycler,
			[],
			undefined,
			true,
		)
		parentCFVC.synchronise()

		// -- Step 3: Remove the subForm --
		let updatedParentCFVC: ContactFormValuesContainer | undefined
		parentCFVC.registerChangeListener((newValue) => {
			updatedParentCFVC = newValue as ContactFormValuesContainer
		})
		await parentCFVC.removeChild(childCFVC)

		expect(updatedParentCFVC).toBeDefined()

		const contactAfterRemoval = updatedParentCFVC!.coordinatedContact()

		// -- Verify step 3 expectations --
		// BUG: Currently removeChild filters out children but does NOT mark their
		// services with endOfLife. The child service simply disappears.
		//
		// EXPECTED: The child service should still be in the contact but with endOfLife set.
		const childServiceAfterRemoval = contactAfterRemoval.services?.find((s) => s.id === 'child-service-1')

		// This assertion documents the expected behavior (will fail until bug is fixed):
		expect(childServiceAfterRemoval).toBeDefined()
		expect(childServiceAfterRemoval?.endOfLife).toBeDefined()
		expect(childServiceAfterRemoval?.endOfLife).toBeGreaterThan(0)

		// The parent service should not be present because it has not been modified
		const parentServiceAfterRemoval = contactAfterRemoval.services?.find((s) => s.id === 'parent-service-1')
		expect(parentServiceAfterRemoval).toBeUndefined()
	})

	it('should not display services with endOfLife when reconstructing from history (step 5)', async () => {
		// Simulate step 4: a saved contact where the child service has endOfLife
		// (this is the expected state after a correct removeChild implementation)
		const savedTimestamp = Date.now() - 10000

		const parentService = new Service({
			id: 'parent-service-1',
			label: 'ParentField',
			created: savedTimestamp,
			modified: savedTimestamp,
			content: { en: { stringValue: 'parent value' } },
		})
		const childServiceWithEndOfLife = new Service({
			id: 'child-service-1',
			created: savedTimestamp,
			modified: savedTimestamp,
			endOfLife: savedTimestamp + 5000, // marked as deleted
		})

		const savedContact: Contact = new Contact({
			id: 'contact-1',
			rev: '2-def',
			created: savedTimestamp + 5000,
			services: [parentService, childServiceWithEndOfLife],
			subContacts: [{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-service-1' }] }],
		})

		// History: the first version of the contact (before subForm removal)
		const historyContact: Contact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: savedTimestamp,
			services: [
				new Service({
					id: 'parent-service-1',
					label: 'ParentField',
					created: savedTimestamp,
					modified: savedTimestamp,
					content: { en: { stringValue: 'parent value' } },
				}),
				new Service({
					id: 'child-service-1',
					label: 'ChildField',
					created: savedTimestamp,
					modified: savedTimestamp,
					content: { en: { stringValue: 'child value' } },
				}),
			],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-service-1' }] },
				{ formId: CHILD_FORM_ID, services: [{ serviceId: 'child-service-1' }] },
			],
		})

		// -- Step 5: Reconstruct the hierarchy using fromFormsHierarchy --
		// The child form no longer exists (it was deleted), so formChildrenProvider
		// returns nothing for the parent form.
		const formChildrenProvider = async (_parentId: string | undefined): Promise<ICureForm[]> => {
			return [] // no child forms anymore — the subForm was removed
		}

		const cfvc = await ContactFormValuesContainer.fromFormsHierarchy(makeParentForm(), savedContact, [historyContact], serviceFactory, formChildrenProvider, formFactory, formRecycler)

		// Get the values that would be displayed
		const values = cfvc.getValues((id, history) => history.map((h) => h.revision))

		// BUG: Currently, services with endOfLife are still indexed and returned
		// by getValues because the indexedServices constructor does not filter them out.
		//
		// EXPECTED: Services with endOfLife should NOT be returned by getValues.
		const childServiceVersions = values['child-service-1']
		expect(childServiceVersions).toBeUndefined()

		// The parent service should still be visible
		const parentServiceVersions = values['parent-service-1']
		expect(parentServiceVersions).toBeDefined()
		expect(parentServiceVersions?.length).toBeGreaterThan(0)
	})

	it('should mark services of nested subForms with endOfLife when parent subForm is removed (parent -> A -> B)', async () => {
		const SUBFORM_A_ID = 'subform-a-id'
		const SUBFORM_A_TEMPLATE_ID = 'subform-a-template-id'
		const SUBFORM_B_ID = 'subform-b-id'
		const SUBFORM_B_TEMPLATE_ID = 'subform-b-template-id'
		const ANCHOR_A = 'anchor-a'
		const ANCHOR_B = 'anchor-b'

		const savedTimestamp = Date.now() - 10000

		// History contact with one service per form
		const historyContact: Contact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: savedTimestamp,
			services: [
				new Service({ id: 'parent-svc', label: 'ParentField', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'p' } } }),
				new Service({ id: 'a-svc', label: 'AField', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'a' } } }),
				new Service({ id: 'b-svc', label: 'BField', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'b' } } }),
			],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-svc' }] },
				{ formId: SUBFORM_A_ID, services: [{ serviceId: 'a-svc' }] },
				{ formId: SUBFORM_B_ID, services: [{ serviceId: 'b-svc' }] },
			],
		})

		// Empty current contact (new editing session)
		const emptyContact: Contact = new Contact({
			id: 'contact-new',
			created: Date.now(),
			services: [],
			subContacts: [],
		})

		// Build hierarchy: parent -> subform A -> subform B
		const subFormB = new ICureForm({ id: SUBFORM_B_ID, formTemplateId: SUBFORM_B_TEMPLATE_ID, descr: ANCHOR_B, parent: SUBFORM_A_ID })
		const subFormA = new ICureForm({ id: SUBFORM_A_ID, formTemplateId: SUBFORM_A_TEMPLATE_ID, descr: ANCHOR_A, parent: PARENT_FORM_ID })

		const cfvcB = new ContactFormValuesContainer(subFormB, emptyContact, [historyContact], serviceFactory, [], formFactory, formRecycler, [], ANCHOR_B, true)
		const cfvcA = new ContactFormValuesContainer(subFormA, emptyContact, [historyContact], serviceFactory, [cfvcB], formFactory, formRecycler, [], ANCHOR_A, true)
		const parentCFVC = new ContactFormValuesContainer(makeParentForm(), emptyContact, [historyContact], serviceFactory, [cfvcA], formFactory, formRecycler, [], undefined, true)
		parentCFVC.synchronise()

		// Remove subform A (which should also remove subform B)
		let updatedParentCFVC: ContactFormValuesContainer | undefined
		parentCFVC.registerChangeListener((newValue) => {
			updatedParentCFVC = newValue as ContactFormValuesContainer
		})
		await parentCFVC.removeChild(cfvcA)

		expect(updatedParentCFVC).toBeDefined()

		const coordinated = updatedParentCFVC!.coordinatedContact()

		// Parent service should not be present (it was not modified in the current contact)
		const parentSvc = coordinated.services?.find((s) => s.id === 'parent-svc')
		expect(parentSvc).toBeUndefined()

		// Subform A's service should be present with endOfLife
		const aSvc = coordinated.services?.find((s) => s.id === 'a-svc')
		expect(aSvc).toBeDefined()
		expect(aSvc?.endOfLife).toBeGreaterThan(0)

		// Subform B's service should also be present with endOfLife
		const bSvc = coordinated.services?.find((s) => s.id === 'b-svc')
		expect(bSvc).toBeDefined()
		expect(bSvc?.endOfLife).toBeGreaterThan(0)

		// SubContacts should only contain the parent form's entry, not A's or B's
		const subContactFormIds = coordinated.subContacts?.map((sc) => sc.formId) ?? []
		expect(subContactFormIds).not.toContain(SUBFORM_A_ID)
		expect(subContactFormIds).not.toContain(SUBFORM_B_ID)
	})

	it('should mark services of all nested subForms with endOfLife when parent subForm is removed (parent -> A -> B1, B2, B3)', async () => {
		const SUBFORM_A_ID = 'subform-a-id'
		const SUBFORM_A_TEMPLATE_ID = 'subform-a-template-id'
		const SUBFORM_B1_ID = 'subform-b1-id'
		const SUBFORM_B1_TEMPLATE_ID = 'subform-b1-template-id'
		const SUBFORM_B2_ID = 'subform-b2-id'
		const SUBFORM_B2_TEMPLATE_ID = 'subform-b2-template-id'
		const SUBFORM_B3_ID = 'subform-b3-id'
		const SUBFORM_B3_TEMPLATE_ID = 'subform-b3-template-id'
		const ANCHOR_A = 'anchor-a'
		const ANCHOR_B = 'anchor-b'

		const savedTimestamp = Date.now() - 10000

		// History contact: one service per form, plus B2 has two services
		const historyContact: Contact = new Contact({
			id: 'contact-1',
			rev: '1-abc',
			created: savedTimestamp,
			services: [
				new Service({ id: 'parent-svc', label: 'ParentField', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'p' } } }),
				new Service({ id: 'a-svc', label: 'AField', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'a' } } }),
				new Service({ id: 'b1-svc', label: 'B1Field', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'b1' } } }),
				new Service({ id: 'b2-svc-1', label: 'B2Field1', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'b2-1' } } }),
				new Service({ id: 'b2-svc-2', label: 'B2Field2', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'b2-2' } } }),
				new Service({ id: 'b3-svc', label: 'B3Field', created: savedTimestamp, modified: savedTimestamp, content: { en: { stringValue: 'b3' } } }),
			],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-svc' }] },
				{ formId: SUBFORM_A_ID, services: [{ serviceId: 'a-svc' }] },
				{ formId: SUBFORM_B1_ID, services: [{ serviceId: 'b1-svc' }] },
				{ formId: SUBFORM_B2_ID, services: [{ serviceId: 'b2-svc-1' }, { serviceId: 'b2-svc-2' }] },
				{ formId: SUBFORM_B3_ID, services: [{ serviceId: 'b3-svc' }] },
			],
		})

		// Empty current contact (new editing session)
		const emptyContact: Contact = new Contact({
			id: 'contact-new',
			created: Date.now(),
			services: [],
			subContacts: [],
		})

		// Build hierarchy: parent -> A -> { B1, B2, B3 }
		const subFormB1 = new ICureForm({ id: SUBFORM_B1_ID, formTemplateId: SUBFORM_B1_TEMPLATE_ID, descr: ANCHOR_B, parent: SUBFORM_A_ID })
		const subFormB2 = new ICureForm({ id: SUBFORM_B2_ID, formTemplateId: SUBFORM_B2_TEMPLATE_ID, descr: ANCHOR_B, parent: SUBFORM_A_ID })
		const subFormB3 = new ICureForm({ id: SUBFORM_B3_ID, formTemplateId: SUBFORM_B3_TEMPLATE_ID, descr: ANCHOR_B, parent: SUBFORM_A_ID })
		const subFormA = new ICureForm({ id: SUBFORM_A_ID, formTemplateId: SUBFORM_A_TEMPLATE_ID, descr: ANCHOR_A, parent: PARENT_FORM_ID })

		// Track which forms are recycled
		const recycledFormIds: string[] = []
		const trackingFormRecycler = async (formId: string): Promise<void> => {
			recycledFormIds.push(formId)
		}

		const cfvcB1 = new ContactFormValuesContainer(subFormB1, emptyContact, [historyContact], serviceFactory, [], formFactory, trackingFormRecycler, [], ANCHOR_B, true)
		const cfvcB2 = new ContactFormValuesContainer(subFormB2, emptyContact, [historyContact], serviceFactory, [], formFactory, trackingFormRecycler, [], ANCHOR_B, true)
		const cfvcB3 = new ContactFormValuesContainer(subFormB3, emptyContact, [historyContact], serviceFactory, [], formFactory, trackingFormRecycler, [], ANCHOR_B, true)
		const cfvcA = new ContactFormValuesContainer(subFormA, emptyContact, [historyContact], serviceFactory, [cfvcB1, cfvcB2, cfvcB3], formFactory, trackingFormRecycler, [], ANCHOR_A, true)
		const parentCFVC = new ContactFormValuesContainer(makeParentForm(), emptyContact, [historyContact], serviceFactory, [cfvcA], formFactory, trackingFormRecycler, [], undefined, true)
		parentCFVC.synchronise()

		// Remove subform A (which should also remove B1, B2, B3)
		let updatedParentCFVC: ContactFormValuesContainer | undefined
		parentCFVC.registerChangeListener((newValue) => {
			updatedParentCFVC = newValue as ContactFormValuesContainer
		})
		await parentCFVC.removeChild(cfvcA)

		expect(updatedParentCFVC).toBeDefined()

		const coordinated = updatedParentCFVC!.coordinatedContact()

		// Parent service should not be present (not modified in current contact)
		expect(coordinated.services?.find((s) => s.id === 'parent-svc')).toBeUndefined()

		// Subform A's service should be present with endOfLife
		const aSvc = coordinated.services?.find((s) => s.id === 'a-svc')
		expect(aSvc).toBeDefined()
		expect(aSvc?.endOfLife).toBeGreaterThan(0)

		// All B subform services should be present with endOfLife
		for (const svcId of ['b1-svc', 'b2-svc-1', 'b2-svc-2', 'b3-svc']) {
			const svc = coordinated.services?.find((s) => s.id === svcId)
			expect(svc).toBeDefined()
			expect(svc?.endOfLife).toBeGreaterThan(0)
		}

		// Total services: a-svc + b1-svc + b2-svc-1 + b2-svc-2 + b3-svc = 5
		expect(coordinated.services).toHaveLength(5)

		// No subContacts for any removed form
		const subContactFormIds = coordinated.subContacts?.map((sc) => sc.formId) ?? []
		expect(subContactFormIds).not.toContain(SUBFORM_A_ID)
		expect(subContactFormIds).not.toContain(SUBFORM_B1_ID)
		expect(subContactFormIds).not.toContain(SUBFORM_B2_ID)
		expect(subContactFormIds).not.toContain(SUBFORM_B3_ID)

		// formRecycler should have been called for all 4 removed forms (A, B1, B2, B3)
		expect(recycledFormIds).toHaveLength(4)
		expect(recycledFormIds).toContain(SUBFORM_A_ID)
		expect(recycledFormIds).toContain(SUBFORM_B1_ID)
		expect(recycledFormIds).toContain(SUBFORM_B2_ID)
		expect(recycledFormIds).toContain(SUBFORM_B3_ID)
	})

	it('should not display subForm children for removed subForms when reconstructing from history', async () => {
		// Even if the child form still exists in the form hierarchy (e.g., not yet
		// cleaned up), services with endOfLife in that child should not be visible.
		const savedTimestamp = Date.now() - 10000

		const parentService = new Service({
			id: 'parent-service-1',
			label: 'ParentField',
			created: savedTimestamp,
			modified: savedTimestamp,
			content: { en: { stringValue: 'parent value' } },
		})
		const childServiceWithEndOfLife = new Service({
			id: 'child-service-1',
			label: 'ChildField',
			created: savedTimestamp,
			modified: savedTimestamp,
			endOfLife: savedTimestamp + 5000,
			content: { en: { stringValue: 'child value' } },
		})

		const currentContact: Contact = new Contact({
			id: 'contact-1',
			rev: '2-def',
			created: savedTimestamp + 5000,
			services: [parentService, childServiceWithEndOfLife],
			subContacts: [
				{ formId: PARENT_FORM_ID, services: [{ serviceId: 'parent-service-1' }] },
				{ formId: CHILD_FORM_ID, services: [{ serviceId: 'child-service-1' }] },
			],
		})

		// Suppose formChildrenProvider still returns the child form
		const formChildrenProvider = async (parentId: string | undefined): Promise<ICureForm[]> => {
			if (parentId === PARENT_FORM_ID) {
				return [makeChildForm()]
			}
			return []
		}

		const cfvc = await ContactFormValuesContainer.fromFormsHierarchy(makeParentForm(), currentContact, [], serviceFactory, formChildrenProvider, formFactory, formRecycler)

		// Get children — the child CFVC should exist but its endOfLife services
		// should not be returned by getValues
		const children = await cfvc.getChildren()
		expect(children).toHaveLength(1)

		const childValues = children[0].getValues((id, history) => history.map((h) => h.revision))

		// EXPECTED: The child service with endOfLife should NOT appear in getValues
		const childServiceVersions = childValues['child-service-1']
		expect(childServiceVersions).toBeUndefined()
	})
})
