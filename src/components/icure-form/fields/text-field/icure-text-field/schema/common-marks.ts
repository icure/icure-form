import { MarkSpec } from 'prosemirror-model'

export const colors: { [key: string]: [string, string] } = {
	I: ['#F44336', 'white'],
	II: ['#E91E63', 'white'],
	III: ['#9C27B0', 'white'],
	IV: ['#673AB7', 'white'],
	V: ['#009688', 'white'],
	VI: ['#4CAF50', 'white'],
	VII: ['#8BC34A', 'white'],
	VIII: ['#03A9F4', 'white'],
	IX: ['#00BCD4', 'white'],
	X: ['#FFC107', 'black'],
	XI: ['#FF9800', 'black'],
	XII: ['#FF5722', 'white'],
	XIII: ['#795548', 'white'],
	XIV: ['#3949AB', 'white'],
	XV: ['#C0CA33', 'black'],
	XVI: ['#07F87F', 'black'],
	XVII: ['#FF6262', 'white'],
	XVIII: ['#718792', 'white'],
	XIX: ['#00ECB9', 'black'],
	XX: ['#FF20A3', 'black'],
	XXI: ['#FFCE38', 'black'],
	XXII: ['#721F01', 'white'],
}

const getColor = (c: string) => colors[c] || [c, 'white']

export function getMarks(
	contentProvider: (codes: { type: string; code: string }[]) => string,
	colorProvider: (type: string, code: string, isCode: boolean) => string,
): { [key: string]: MarkSpec } {
	return {
		em: {
			parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style', getAttrs: (value) => value === 'italic' && null }],
			toDOM() {
				return ['em']
			},
		},

		strong: {
			parseDOM: [{ tag: 'b' }, { tag: 'strong' }, { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null }],
			toDOM() {
				return ['strong']
			},
		},

		link: {
			attrs: {
				href: {},
				title: { default: null },
			},
			inclusive: false,
			parseDOM: [
				{
					tag: 'span[data-href]',
					getAttrs(dom) {
						const el = dom as HTMLElement
						return { href: el.dataset.href, title: el.dataset.title }
					},
				},
			],
			toDOM(node) {
				const urls: string = node.attrs.href
				if (urls) {
					const refs = urls.split(',').map((url) => {
						const pos = url.indexOf('://')
						const protocol = url.substring(0, pos)
						const code = url.substring(pos + 3)
						const parts = protocol.split('-')
						const category = parts[0]
						const type = parts[1]

						return { category, type, code }
					})

					const codes = refs.filter((x) => x.category === 'c')
					const ilinks = refs.filter((x) => x.category === 'i')

					const classes = (refs.some((x) => x.category === 'x') ? ['ext-link'] : []).concat(codes.length ? [`code-count-${codes.length}`] : [])

					const dataAttributes = (codes.length ? [{ 'data-content': contentProvider(codes) } as { [key: string]: string }] : []).concat(
						ilinks.map((c, idx) => ({ [`data-link-color-${idx}`]: colorProvider(c.type, c.code, false) })),
					)

					const styles = codes.map((c, idx) => {
						const color = getColor(colorProvider(c.type, c.code, true))
						return `--bg-code-color-${idx + 1}: ${color[0]}; --text-code-color-${idx + 1}: ${color[1]};`
					})

					return [
						'span',
						dataAttributes.reduce((acc, da) => Object.assign(da, acc), {
							['data-href']: node.attrs.href,
							['data-title']: node.attrs.title,
							class: classes.join(' '),
							style: styles.join(''),
						}),
					]
				}

				return ['span', { ['data-href']: node.attrs.href, ['data-title']: node.attrs.title }]
			},
		},
	}
}
