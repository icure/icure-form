import { Contact, Service } from '@icure/api'
import { ContactFormValuesContainer } from '../src/icure'
import { v4 as uuid } from 'uuid'

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
		rev: '12345',
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

	const sb = new Map()
	const cs: Map<string, any> = new Map()
	const interpreter = <T, S extends { [key: string | symbol]: unknown }>(
		formula: string,
		getVersions: (filter: (s: Service) => boolean) => { [key: string]: Service },
		sandbox: S = new Proxy({} as S, {
			has: (target: S, key: string | symbol) => Object.keys(this.getVersions((s) => s.label === key) ?? {}).length > 0,
			get: (target: S, key: string | symbol) => Object.values(this.getVersions((s) => s.label === key)),
		}),
	): T | undefined => {
		function compileCode(src: string) {
			if (cs.has(src)) {
				return cs.get(src)
			}

			src = 'with (sandbox) {' + src + '}'
			const code = new Function('sandbox', src)

			const result = function (sandbox: S) {
				if (!sb.has(sandbox)) {
					const sandboxProxy = new Proxy<S>(sandbox, { has, get })
					sb.set(sandbox, sandboxProxy)
				}
				return code(sb.get(sandbox))
			}

			cs.set(src, result)

			return result
		}

		function has() {
			return true
		}

		function get(target: S, key: string | symbol) {
			if (key === Symbol.unscopables) return undefined
			return target[key]
		}

		let compiledCode: any
		try {
			compiledCode = compileCode(formula)
		} catch (e) {
			console.info('Invalid Formula: ' + formula)
			return undefined
		}
		try {
			const result = compiledCode(sandbox)
			return result
		} catch (e) {
			console.info('Error while executing formula: ' + formula, e)
			return undefined
		}
	}

	const now = +new Date()
	return new ContactFormValuesContainer(cc, [ctc], (label, serviceId) => new Service({ label, id: serviceId ?? uuid(), created: now, modified: now }), interpreter)
}
