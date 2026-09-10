import { Schema } from 'prosemirror-model'
import { getMarkdownSpec } from '../../src/components/icure-text-field/schema/markdown-schema'
import { codesFromLinks, serializeInlineMarkdown } from '../../src/components/icure-text-field/serialization'

// Styled text fields store their value as inline markdown so em/strong/link marks survive the save round trip, and the
// codes of their links land in the value's `codes`.
describe('styled text serialization', () => {
	const pms = new Schema(
		getMarkdownSpec(
			'styled-text-with-codes',
			() => '',
			() => '#666666',
		),
	)
	const link = (href: string, title?: string) => pms.marks.link.create({ href, title: title ?? null })
	const doc = (...children: ReturnType<typeof pms.text>[]) => pms.node('paragraph', null, children)

	it('serializes plain text unchanged', () => {
		expect(serializeInlineMarkdown(doc(pms.text('douleur crise')))).toBe('douleur crise')
	})

	it('serializes a linked term as a markdown link with its title, followed by the plain text', () => {
		const d = doc(pms.text("douleur de l'épaule", [link('c-ICD://G40.3,c-BE-THESAURUS://10000534', "G40.3; douleur de l'épaule")]), pms.text('crise'))
		expect(serializeInlineMarkdown(d)).toBe(`[douleur de l'épaule](c-ICD://G40.3,c-BE-THESAURUS://10000534 "G40.3; douleur de l'épaule")crise`)
	})

	it('serializes strong and em marks', () => {
		const d = doc(pms.text('very ', []), pms.text('important', [pms.marks.strong.create()]), pms.text(' and ', []), pms.text('subtle', [pms.marks.em.create()]))
		expect(serializeInlineMarkdown(d)).toBe('very **important** and *subtle*')
	})

	it('escapes markdown-significant characters in plain text so they read back verbatim', () => {
		expect(serializeInlineMarkdown(doc(pms.text('a*b [c]')))).toBe('a\\*b \\[c\\]')
	})

	it('extracts one code per c- entry of every link, defaulting the version to 1', () => {
		const d = doc(pms.text('term', [link('c-ICD://G40.3,c-ICPC://N88,c-BE-THESAURUS://10000534')]), pms.text(' plain'))
		expect(codesFromLinks(d)).toEqual([
			{ id: 'ICD|G40.3|1', type: 'ICD', code: 'G40.3', version: '1', label: {} },
			{ id: 'ICPC|N88|1', type: 'ICPC', code: 'N88', version: '1', label: {} },
			{ id: 'BE-THESAURUS|10000534|1', type: 'BE-THESAURUS', code: '10000534', version: '1', label: {} },
		])
	})

	it('accepts a full type|code|version id as the code part', () => {
		expect(codesFromLinks(doc(pms.text('t', [link('c-FIXTURE://FIXTURE|A|1')])))).toEqual([{ id: 'FIXTURE|A|1', type: 'FIXTURE', code: 'A', version: '1', label: {} }])
	})

	it('ignores internal and external link entries and collapses duplicates', () => {
		const d = doc(pms.text('a', [link('c-ICD://I10,i-ICD://I10,x-web://example.org')]), pms.text(' b', [link('c-ICD://I10')]))
		expect(codesFromLinks(d).map((c) => c.id)).toEqual(['ICD|I10|1'])
	})

	it('returns no codes without links', () => {
		expect(codesFromLinks(doc(pms.text('plain')))).toEqual([])
		expect(codesFromLinks(undefined)).toEqual([])
	})
})
