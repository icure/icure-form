import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { Form, Group, Subform } from '../src/components/model'

const SAMPLES = '/Users/aduchate/Sources/icure/icure-form/app/samples'

describe('every demo sample parses cleanly', () => {
	const files = readdirSync(SAMPLES).filter((f) => f.endsWith('.yaml')).sort()
	for (const file of files) {
		test(file, () => {
			const form = Form.parse(YAML.parse(readFileSync(resolve(SAMPLES, file), 'utf8')))
			const inspect = (fields: any[], path: string) => {
				expect(Array.isArray(fields)).toBe(true)
				fields.forEach((fg, i) => {
					if (fg == null) throw new Error(`${path}[${i}] is ${fg}`)
					if (!fg.clazz) throw new Error(`${path}[${i}] has no clazz, keys=${Object.keys(fg).join(',')}`)
					if (fg.clazz === 'group') inspect((fg as Group).fields ?? [], `${path}[${i}](group).fields`)
					if (fg.clazz === 'subform') {
						const sf = fg as Subform
						Object.entries(sf.forms ?? {}).forEach(([k, child]) => {
							child.sections.forEach((s, si) => inspect(s.fields, `${path}[${i}](subform[${k}]).section[${si}].fields`))
						})
					}
				})
			}
			form.sections.forEach((s, si) => inspect(s.fields, `section[${si}].fields`))
		})
	}
})
