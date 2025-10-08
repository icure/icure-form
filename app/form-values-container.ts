import { ContactFormValuesContainer } from '../src/icure'
import { v4 as uuid } from 'uuid'
import { Contact, Form, Service } from '@icure/api'

export const makeFormValuesContainer = (observedForms: Record<string, Form>, rootForm: Form, currentContact: Contact, history: Contact[], getForms: (parentId: string) => Promise<Form[]>) => {
	const now = +new Date()
	return ContactFormValuesContainer.fromFormsHierarchy(
		rootForm,
		currentContact,
		history,
		(label, serviceId) => new Service({ label, id: serviceId ?? uuid(), created: now, modified: now, responsible: '1' }),
		getForms,
		async (parentId: string, anchorId: string, fti) => {
			const id = uuid()
			return (observedForms[id] = new Form({
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
