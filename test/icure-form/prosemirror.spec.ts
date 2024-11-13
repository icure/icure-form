import { defaultMarkdownSerializer, MarkdownParser } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'
import { hasMark } from '../../src/components/icure-text-field/prosemirror-utils'
import { getMarkdownSpec } from '../../src/components/icure-text-field/schema/markdown-schema'
import { Schema } from 'prosemirror-model'
import { preprocessEmptyNodes } from '../../src/utils/markdown'

describe('Form parsing tests', () => {
	it('should Render simple form', () => {
		const tokenizer = MarkdownIt('commonmark', { html: false })

		const pms = new Schema(
			getMarkdownSpec(
				'text-document',
				() => '',
				() => '#666666',
			),
		)
		const mdp = new MarkdownParser(pms, tokenizer, {
			blockquote: { block: 'blockquote' },
			paragraph: { block: 'paragraph' },
			list_item: { block: 'list_item' },
			bullet_list: { block: 'bullet_list' },
			ordered_list: { block: 'ordered_list', getAttrs: (tok) => ({ order: +(tok.attrGet('start') || 1) }) },
			heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
			hr: { node: 'horizontal_rule' },
			image: {
				node: 'image',
				getAttrs: (tok) => ({
					src: tok.attrGet('src'),
					title: tok.attrGet('title') || null,
					alt: (tok.children || [])[0]?.content || null,
				}),
			},
			hardbreak: { node: 'hardbreak' },

			em: hasMark(pms.spec.marks, 'em') ? { mark: 'em' } : { ignore: true },
			strong: hasMark(pms.spec.marks, 'strong') ? { mark: 'strong' } : { ignore: true },
			link: hasMark(pms.spec.marks, 'link')
				? {
						mark: 'link',
						getAttrs: (tok) => ({
							href: tok.attrGet('href'),
							title: tok.attrGet('title') || null,
						}),
				  }
				: { ignore: true },
		})

		const tokens = tokenizer.parse('## Hello world\n\n\n\ndone\n\n', {})
		console.log(tokens)

		const ab = pms.node(pms.topNodeType, {}, [pms.node('paragraph', {}, pms.text('a')), pms.node('paragraph', {}, pms.text('b'))])
		const ab_s = defaultMarkdownSerializer.serialize(ab)

		expect(ab_s).toEqual('a\n\nb')

		const aeb = pms.node(pms.topNodeType, {}, [pms.node('paragraph', {}, pms.text('a')), pms.node('paragraph'), pms.node('paragraph', {}, pms.text('b'))])
		const aeb_s = defaultMarkdownSerializer.serialize(aeb)

		expect(aeb_s).toEqual('a\n\nb')

		const aenb = pms.node(pms.topNodeType, {}, [pms.node('paragraph', {}, pms.text('a')), pms.node('paragraph', {}, pms.text('\u00a0')), pms.node('paragraph', {}, pms.text('b'))])
		const aenb_s = defaultMarkdownSerializer.serialize(aenb)

		expect(aenb_s).toEqual('a\n\n\u00a0\n\nb')

		const aenbe = pms.node(pms.topNodeType, {}, [
			pms.node('paragraph', {}, pms.text('a')),
			pms.node('paragraph', {}, pms.text('\u00a0')),
			pms.node('paragraph', {}, pms.text('b')),
			pms.node('paragraph', {}, pms.text('\u00a0')),
		])
		const aenbe_s = defaultMarkdownSerializer.serialize(aenbe)

		expect(aenbe_s).toEqual('a\n\n\u00a0\n\nb\n\n\u00a0')

		const node = mdp.parse('a\n\n\u00a0\n\nb\n\n\u00a0')!
		const sz = defaultMarkdownSerializer.serialize(preprocessEmptyNodes(node, pms))

		expect(sz).toEqual('a\n\n\u00a0\n\nb\n\n\u00a0')
		console.log(sz)

		const start = mdp.parse('\u00a0\u00a0a')!
		const start_sz = defaultMarkdownSerializer.serialize(preprocessEmptyNodes(start, pms))

		console.log(start_sz)
	})
})
