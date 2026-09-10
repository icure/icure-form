import { Schema } from 'prosemirror-model'
import { suggestionQueryStart } from '../../src/components/icure-text-field/suggestion-query'

// The palette's query must start after the last linked (already coded) text before the cursor, so words that were
// turned into codes are never searched again and a word typed right after an inserted suggestion is a fresh query.
describe('suggestionQueryStart', () => {
	const schema = new Schema({
		nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', toDOM: () => ['p', 0] }, text: {} },
		marks: { link: { attrs: { href: {} }, inclusive: false } },
	})
	const link = schema.marks.link
	const linked = (text: string) => schema.text(text, [link.create({ href: 'c-X://1' })])
	const plain = (text: string) => schema.text(text)
	const doc = (...children: ReturnType<typeof plain>[]) => schema.node('doc', null, [schema.node('paragraph', null, children)])
	// Paragraph content starts at position 1 in a one-paragraph doc.
	const FROM = 1

	it('falls back to the paragraph start when nothing is linked', () => {
		const d = doc(plain('douleur crise'))
		expect(suggestionQueryStart(d, FROM, d.content.size - 1, link)).toBe(FROM)
		expect(d.textBetween(FROM, d.content.size - 1)).toBe('douleur crise')
	})

	it('starts right after linked text when a word is typed glued to it', () => {
		const d = doc(linked("douleur de l'épaule"), plain('crise'))
		const to = d.content.size - 1
		const start = suggestionQueryStart(d, FROM, to, link)
		expect(d.textBetween(start, to)).toBe('crise')
	})

	it('keeps only the text after the link when a space follows it', () => {
		const d = doc(linked("douleur de l'épaule"), plain(' migraine'))
		const to = d.content.size - 1
		expect(d.textBetween(suggestionQueryStart(d, FROM, to, link), to)).toBe(' migraine')
	})

	it('yields an empty query while the cursor sits inside linked text', () => {
		const d = doc(linked('abcdef'))
		const to = FROM + 3
		expect(suggestionQueryStart(d, FROM, to, link)).toBe(to)
	})

	it('uses the last of several links before the cursor', () => {
		const d = doc(linked('aaa'), plain(' bb '), linked('ccc'), plain(' dd'))
		const to = d.content.size - 1
		expect(d.textBetween(suggestionQueryStart(d, FROM, to, link), to)).toBe(' dd')
	})

	it('ignores links after the cursor', () => {
		const d = doc(plain('abc '), linked('zzz'))
		const to = FROM + 4
		expect(suggestionQueryStart(d, FROM, to, link)).toBe(FROM)
	})

	it('returns from when the schema has no link mark', () => {
		const d = doc(plain('abc'))
		expect(suggestionQueryStart(d, FROM, d.content.size - 1, undefined)).toBe(FROM)
	})
})
