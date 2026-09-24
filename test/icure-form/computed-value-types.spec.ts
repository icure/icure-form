import { DecryptedContact, DecryptedForm, DecryptedService } from '@icure/cardinal-sdk'
import { format } from 'date-fns'
import { BridgedFormValuesContainer, ContactFormValuesContainer } from '../../src/icure'
import { makeInterpreter } from '../../src/utils/interpreter'
import { getRevisionsFilter } from '../../src/utils/fields-values-provider'
import { anyDateToDate } from '../../src/utils/dates'
import { PrimitiveType } from '../../src/components/model'

/**
 * What the bridge stores for each kind of value a `computedProperties.value` formula
 * can return, and — for dates — that the stored primitive is what the date picker
 * knows how to display.
 *
 * The specialty forms carry computed date pickers (obstetric terms and due dates), and
 * a formula's return value crosses two conversions before anything is drawn:
 * `convertRawValue` turns it into a `PrimitiveType`, then the field component turns that
 * back into text. A `Date` survives that round trip as a `timestamp` carrying a
 * yyyyMMddHHmmss fuzzy date rather than epoch millis, which reads oddly but is
 * self-consistent: `anyDateToDate` recognises both.
 */

const FORM_ID = 'form-id'
const FORM_TEMPLATE_ID = 'tpl'

let ordinal = 0
const serviceFactory = (label: string, serviceId?: string) => new DecryptedService({ id: serviceId ?? `s-${++ordinal}`, label, created: Date.now(), modified: Date.now(), content: {} })

/** Runs one formula as the sole computed field of a form, and returns the whole stored value. */
const storedFieldValueOf = async (formula: string, label: string): Promise<{ content: { [language: string]: PrimitiveType }; codes?: { id?: string }[] } | undefined> => {
	const contactFormValuesContainer = new ContactFormValuesContainer(
		new DecryptedForm({ id: FORM_ID, formTemplateId: FORM_TEMPLATE_ID, descr: 'Form' }),
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
	const bridged = await new BridgedFormValuesContainer(
		'me',
		contactFormValuesContainer,
		makeInterpreter(),
		undefined,
		() => [],
		() => [{ metadata: { label }, revisionsFilter: getRevisionsFilter({ label } as any), formula }],
		() => [],
		'fr',
		[],
		{},
	).init()
	const values = bridged.getValues((id, history) => (history?.[0]?.value?.label === label ? [history[0].revision] : []))
	return Object.values(values)[0]?.[0]?.value as any
}

/** Just the content, for the cases that only care about the primitive. */
const storedValueOf = async (formula: string, label: string): Promise<{ [language: string]: PrimitiveType } | undefined> => (await storedFieldValueOf(formula, label))?.content

/**
 * The options `icure-button-group` would show ticked for a stored value — the two
 * lines of its `getValueFromProvider` (src/components/icure-button-group/index.ts),
 * which is the only thing that decides whether a checkbox is drawn ticked.
 */
const tickedOptions = (value: { content: { [language: string]: PrimitiveType }; codes?: { id?: string }[] } | undefined, language = 'fr'): string[] => {
	const valueForLanguage: any = value?.content?.[language] ?? ''
	const fromValue = valueForLanguage && valueForLanguage.type === 'compound' && valueForLanguage.value ? Object.keys(valueForLanguage.value) : []
	return fromValue.concat((value?.codes?.map((code) => code.id).filter((id) => id && !fromValue.includes(id)) as string[]) ?? [])
}

describe('what the bridge stores for a computed value', () => {
	it('stores a string under the form language', async () => {
		expect(await storedValueOf("return 'hello'", 'Note')).toEqual({ fr: { type: 'string', value: 'hello' } })
	})

	it('stores a number', async () => {
		expect(await storedValueOf('return 24.22', 'BMI')).toEqual({ fr: { type: 'number', value: 24.22 } })
	})

	it('stores a { value, unit } pair as a measure', async () => {
		expect(await storedValueOf("return { value: 1.8, unit: 'm²' }", 'BSA')).toEqual({ fr: { type: 'measure', value: 1.8, unit: 'm²' } })
	})

	it('stores a Date as a timestamp holding a fuzzy date', async () => {
		expect(await storedValueOf('return new Date(2024, 9, 6)', 'Terme')).toEqual({ fr: { type: 'timestamp', value: 20241006000000 } })
	})

	it('stores nothing when the formula declines to produce a value', async () => {
		expect(await storedValueOf('return undefined', 'Terme')).toBeUndefined()
	})

	it('stores nothing for a zero, because the bridge gates on truthiness', async () => {
		// Not a defect to fix here, but it is why an untouched MMSE or acuity score renders
		// blank rather than 0: computeDependentValues keeps `computationResult.value ? … `.
		expect(await storedValueOf('return 0', 'Score')).toBeUndefined()
	})

	it('hands the date picker a primitive it can display', async () => {
		const content = await storedValueOf('return new Date(2024, 9, 6)', 'Terme')
		const primitive = content?.['fr']
		// The same two steps IcureDatePickerField.getValueFromProvider takes.
		expect(primitive?.type).toEqual('timestamp')
		const shown = primitive && 'value' in primitive ? anyDateToDate(primitive.value as number) : undefined
		expect(shown && format(shown, 'dd/MM/yyyy')).toEqual('06/10/2024')
	})
})

/**
 * What it takes for a computed value to tick a checkbox. The antenatal screening
 * boxes on `gynecology-fr/grossesse.json` are computed, and storing cleanly is not
 * the same as rendering: a checkbox is drawn from the option ids the button group
 * finds, so a value can round-trip through the bridge and still show an empty box.
 */
describe('a computed value that has to tick a checkbox', () => {
	const OPTION = 'Toxo (Ig M&G)'
	const compound = (option: string) => `{ content: { '*': { type: 'compound', value: { [${JSON.stringify(option)}]: { type: 'boolean', value: true } } } } }`

	it('does not tick anything when the formula returns a bare boolean', async () => {
		const stored = await storedFieldValueOf('return true', 'Sérologie')
		// It stores perfectly well — which is exactly why this is worth pinning.
		expect(stored?.content).toEqual({ fr: { type: 'boolean', value: true } })
		expect(tickedOptions(stored)).toEqual([])
	})

	it('ticks the option when the formula returns compound content naming it', async () => {
		const stored = await storedFieldValueOf(`return ${compound(OPTION)}`, 'Sérologie')
		// The bridge moves '*' to the form language, which is the key the button group reads.
		expect(stored?.content).toEqual({ fr: { type: 'compound', value: { [OPTION]: { type: 'boolean', value: true } } } })
		expect(tickedOptions(stored)).toEqual([OPTION])
	})

	it('stores nothing at all if the value carries a code that is not a stub id', async () => {
		// The button group would also tick from `codes`, but a code id has to normalise
		// as TYPE|CODE|VERSION and a checkbox option id is a plain label. normalizeCode
		// throws, the throw is caught upstream of the write, and the field ends up empty
		// — worse than the boolean. This is why the ports emit compound content only.
		const withCode = `return { content: { '*': { type: 'compound', value: { [${JSON.stringify(OPTION)}]: { type: 'boolean', value: true } } } }, codes: [{ id: ${JSON.stringify(OPTION)} }] }`
		expect(await storedFieldValueOf(withCode, 'Sérologie')).toBeUndefined()
	})

	it('leaves the box empty when the formula declines', async () => {
		expect(tickedOptions(await storedFieldValueOf('return undefined', 'Sérologie'))).toEqual([])
		// And a `false` stores nothing at all, so an unticked box needs no special case.
		expect(await storedFieldValueOf('return false', 'Sérologie')).toBeUndefined()
	})
})
