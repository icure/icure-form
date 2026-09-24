import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { Form } from '../src/components/model'

// Every specialty form in the app/samples/curated submodule must go through Form.parse
// without throwing — e.g. a subform id declared twice in one form tree makes the demo app
// show an error instead of the form.
const CURATED = resolve(__dirname, '../app/samples/curated')

const files = readdirSync(CURATED)
	.filter((d) => statSync(join(CURATED, d)).isDirectory())
	.sort()
	.flatMap((d) =>
		readdirSync(join(CURATED, d))
			.filter((f) => f.endsWith('.json'))
			.sort()
			.map((f) => `${d}/${f}`),
	)

describe('every curated specialty form parses', () => {
	test('the submodule is checked out', () => {
		expect(files.length).toBeGreaterThan(0)
	})

	test.each(files)('%s', (file) => {
		const form = Form.parse(JSON.parse(readFileSync(join(CURATED, file), 'utf8')))
		expect(form.sections.length).toBeGreaterThan(0)
	})
})
