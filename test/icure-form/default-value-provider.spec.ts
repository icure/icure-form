import { DecryptedContact, DecryptedForm, DecryptedService } from '@icure/cardinal-sdk'
import { BridgedFormValuesContainer, ContactFormValuesContainer } from '../../src/icure'
import { makeInterpreter } from '../../src/utils/interpreter'
import { getRevisionsFilter } from '../../src/utils/fields-values-provider'

/**
 * The reset button of a text field recomputes its `computedProperties.defaultValue`
 * through `getDefaultValueProvider`. That provider must hand back the formula's value,
 * not the `{ value, dependencies }` wrapper `compute` returns, or the field is blanked.
 */

let ordinal = 0
const serviceFactory = (label: string, serviceId?: string) => new DecryptedService({ id: serviceId ?? `s-${++ordinal}`, label, created: Date.now(), modified: Date.now(), content: {} })

const defaultValueProviderOf = async (formula: string, label: string) => {
	const contactFormValuesContainer = new ContactFormValuesContainer(
		new DecryptedForm({ id: 'form-id', formTemplateId: 'tpl', descr: 'Form' }),
		new DecryptedContact({ id: 'c1', created: Date.now(), services: [], subContacts: [] }),
		[],
		serviceFactory,
		[],
		async () => new DecryptedForm({ id: 'x' }),
		async () => undefined,
		[],
		undefined,
		true,
	)
	const bridged = new BridgedFormValuesContainer(
		'me',
		contactFormValuesContainer,
		makeInterpreter(),
		undefined,
		() => [{ metadata: { label }, revisionsFilter: getRevisionsFilter({ label } as any), formula }],
		() => [],
		() => [],
		'fr',
		[],
		{},
	)
	return bridged.getDefaultValueProvider(label)
}

describe('getDefaultValueProvider', () => {
	it('returns the converted value of a plain formula', async () => {
		const provider = await defaultValueProviderOf("return 'hello'", 'Note')
		expect(await provider?.()).toEqual({ content: { '*': { type: 'string', value: 'hello' } } })
	})

	it('returns a field value resolved from a promise, codes included', async () => {
		const provider = await defaultValueProviderOf("return Promise.resolve({ content: { '*': { type: 'string', value: 'summary' } }, codes: [{ id: 'SCORE|2|1' }] })", 'Summary')
		expect(await provider?.()).toEqual({ content: { '*': { type: 'string', value: 'summary' } }, codes: [{ id: 'SCORE|2|1' }] })
	})
})
