import { ContactFormValuesContainer } from '../src/icure'
import { v4 as uuid } from 'uuid'
import { DecryptedContact, DecryptedService, Form, DecryptedForm } from '@icure/cardinal-sdk'

export const makeFormValuesContainer = (
	observedForms: Record<string, Form>,
	rootForm: DecryptedForm,
	currentContact: DecryptedContact,
	history: DecryptedContact[],
	getForms: (parentId: string) => Promise<DecryptedForm[]>,
) => {
	const now = +new Date()
	return ContactFormValuesContainer.fromFormsHierarchy(
		rootForm,
		currentContact,
		history,
		(label, serviceId) => new DecryptedService({ label, id: serviceId ?? uuid(), created: now, modified: now, responsible: '1' }),
		getForms,
		async (parentId: string, anchorId: string, fti) => {
			const id = uuid()
			return (observedForms[id] = new DecryptedForm({
				id: id,
				created: +new Date(),
				modified: +new Date(),
				formTemplateId: fti,
				parent: parentId,
				descr: anchorId /* TODO, this legacy iCure on Mac hack is used to anchor a form inside a form template. Fix it by introducing an anchorId in Form */,
			}))
		},
		async (formId: string) => {
			delete observedForms[formId]
		},
	)
}
