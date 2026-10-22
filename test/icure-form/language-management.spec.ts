import { Contact, Form as ICureForm, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../../src/icure/form-values-container'
import { contentKeyOf, textLanguageOf } from '../../src/utils/language-fallback'

/**
 * `setValue` writes one content key (a language, or `'*'`). By default the content held under the other keys is kept;
 * with `clearOtherLanguages` it is erased, because the value just saved makes it obsolete.
 */

const FORM_ID = 'form-id'
const FIELD_LABEL = 'Field1'
const SERVICE_ID = 'service-1'

const serviceFactory = (label: string, serviceId?: string): Service => new Service({ id: serviceId ?? 'new-service', label, created: Date.now(), modified: Date.now(), content: {} })
const formFactory = async (parentId: string, anchorId: string, formTemplateId: string, label: string): Promise<ICureForm> =>
	new ICureForm({ id: `new-form-${Date.now()}`, formTemplateId, descr: label, parent: parentId })
const formRecycler = async (): Promise<void> => undefined

const buildContainer = (content: { [lng: string]: { stringValue: string } }): ContactFormValuesContainer => {
	const now = Date.now()
	const currentContact = new Contact({
		id: 'contact-current',
		created: now,
		services: [new Service({ id: SERVICE_ID, label: FIELD_LABEL, created: now, modified: now, content })],
		subContacts: [{ formId: FORM_ID, services: [{ serviceId: SERVICE_ID }] }],
	})
	return new ContactFormValuesContainer(new ICureForm({ id: FORM_ID, formTemplateId: 'tpl', descr: 'Form' }), currentContact, [], serviceFactory, [], formFactory, formRecycler, [], undefined, true)
}

/** Saves `text` under `language` (no text: empties the field) and returns the service as stored afterwards, if any. */
const save = (container: ContactFormValuesContainer, language: string, text: string | undefined, clearOtherLanguages?: boolean): Service | undefined => {
	let updated: ContactFormValuesContainer | undefined
	container.registerChangeListener((newValue) => {
		updated = newValue as ContactFormValuesContainer
	})
	container.setValue(FIELD_LABEL, language, new Service({ id: SERVICE_ID, content: text === undefined ? {} : { [language]: { stringValue: text } } }), SERVICE_ID, undefined, undefined, {
		clearOtherLanguages,
	})
	expect(updated).toBeDefined()
	return updated!.coordinatedContact().services?.find((s: Service) => s.id === SERVICE_ID)
}

describe('setValue — content of other languages', () => {
	it('keeps the other languages by default', () => {
		const service = save(buildContainer({ fr: { stringValue: 'Bonjour' } }), 'nl', 'Hallo')
		expect(Object.keys(service?.content ?? {}).sort()).toEqual(['fr', 'nl'])
	})

	it('keeps only the saved language with clearOtherLanguages', () => {
		const service = save(buildContainer({ fr: { stringValue: 'Bonjour' }, '*': { stringValue: 'Hi' } }), 'nl', 'Hallo', true)
		expect(service?.content).toEqual({ nl: { stringValue: 'Hallo' } })
	})

	it("saves under '*' and erases every language with clearOtherLanguages", () => {
		const service = save(buildContainer({ fr: { stringValue: 'Bonjour' }, nl: { stringValue: 'Hallo' } }), '*', 'Hi', true)
		expect(service?.content).toEqual({ '*': { stringValue: 'Hi' } })
	})

	it('erases the other languages even when the saved content did not change', () => {
		const service = save(buildContainer({ fr: { stringValue: 'Bonjour' }, nl: { stringValue: 'Hallo' } }), 'nl', 'Hallo', true)
		expect(service?.content).toEqual({ nl: { stringValue: 'Hallo' } })
	})

	it('removes the service when the field is emptied with clearOtherLanguages', () => {
		expect(save(buildContainer({ fr: { stringValue: 'Bonjour' } }), 'nl', undefined, true)).toBeUndefined()
	})

	it('keeps the other languages when the field is emptied without clearOtherLanguages', () => {
		const service = save(buildContainer({ fr: { stringValue: 'Bonjour' }, nl: { stringValue: 'Hallo' } }), 'nl', undefined)
		expect(service?.content).toEqual({ fr: { stringValue: 'Bonjour' } })
	})
})

describe('contentKeyOf / textLanguageOf', () => {
	it('uses the language picked for translation, then contentLanguage, then the form language', () => {
		expect(contentKeyOf('en', '*', 'nl')).toBe('en')
		expect(contentKeyOf(undefined, '*', 'nl')).toBe('*')
		expect(contentKeyOf(undefined, undefined, 'nl')).toBe('nl')
	})

	it("resolves stored text in the content key's language, or in the UI language under '*'", () => {
		expect(textLanguageOf('fr', 'nl')).toBe('fr')
		expect(textLanguageOf('*', 'nl')).toBe('nl')
	})
})
