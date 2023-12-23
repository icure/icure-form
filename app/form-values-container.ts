import { Contact, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../src/models'

export const makeFormValuesContainer = () => {
	const cc = new Contact({
		id: 'c2',
		services: [
			{
				id: 's1',
				label: 'history',
				valueDate: 20181012,
				tags: [{ id: 'MS-ABORTION-PSYCHOSOCIAL-INTERVIEW-ITEM|HISTORY|1' }],
				content: { en: { stringValue: 'commentaire' } },
			},
			{
				id: 's2',
				label: 'inTakeDate',
				tags: [{ id: 'MS-ABORTION-DATE|intake|1' }, { id: 'MS-ABORTION-ITEM|date|1' }, { id: 'MS-ABORTION-PSYCHOSOCIAL-INTERVIEW-ITEM|IN-TAKE-DATE|1' }],
				content: { en: { fuzzyDateValue: '19960823' } },
			},
		],
	})
	const ctc = new Contact({
		id: 'c1',
		services: [
			{ id: 's1', label: 'abortion-forms.field-labels.HISTORY', tags: [{ id: 'MS-ABORTION-PSYCHOSOCIAL-INTERVIEW-ITEM|HISTORY|1' }], content: { en: { stringValue: 'test' } } },
			{
				id: 's2',
				label: 'abortion-forms.field-labels.IN-TAKE-DATE',
				tags: [{ id: 'MS-ABORTION-DATE|intake|1' }, { id: 'MS-ABORTION-ITEM|date|1' }, { id: 'MS-ABORTION-PSYCHOSOCIAL-INTERVIEW-ITEM|IN-TAKE-DATE|1' }],
				content: { en: { fuzzyDateValue: '20220404' } },
			},
		],
	})

	const entity = {
		getEntityReference: () => {
			return Promise.resolve('entity')
		},
	}
	const interpretor: (formula: string, sandbox: any) => Promise<any> = async (formula, sandbox) => {
		const sandboxKeys = [...Object.keys(sandbox), 'entity']
		sandbox['entity'] = entity
		const sandboxValues = sandboxKeys.map((k) => sandbox[k])
		const f = new Function(...sandboxKeys, `return ${formula}`)
		return await f(...sandboxValues)
	}
	const now = +new Date()
	return new ContactFormValuesContainer(
		cc,
		ctc,
		[ctc],
		(label, serviceId, language, content, codes, tags) => new Service({ label, id: serviceId, created: now, modified: now, content: { [language]: content }, codes, tags }),
		interpretor,
	)
}
