// Import the LitElement base class and html helper function
import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { EditorState, Plugin, TextSelection, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, exitCode, joinDown, joinUp, setBlockType, toggleMark } from 'prosemirror-commands'
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'

import { createSchema } from './schema'
import MarkdownIt from 'markdown-it'
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown'
import { unwrapFrom, wrapInIfNeeded } from './prosemirror-commands'
import { SelectionCompanion } from './selection-companion'
import { SuggestionPalette } from './suggestion-palette'
import { caretFixPlugin } from './plugin/caret-fix-plugin'
import { hasMark } from './prosemirror-utils'

import { maskPlugin } from './plugin/mask-plugin'
import { hasContentClassPlugin } from './plugin/has-content-class-plugin'
import { regexpPlugin } from './plugin/regexp-plugin'
import { format, parse } from 'date-fns'
import { Field } from '../common'
import { Code, IcureTextFieldSchema, PrimitiveType } from '../model'
import { Suggestion } from '../../generic'
import { generateLabels } from '../common/utils'

// @ts-ignore
import baseCss from '../common/styles/style.scss'
// @ts-ignore
import kendoCss from '../common/styles/kendo.scss'
import { extractSingleValue } from '../icure-form/fields/utils'

class SpacePreservingMarkdownParser {
	constructor(private mkdp: MarkdownParser) {}

	parse(value: string): ProsemirrorNode | null {
		const node = this.mkdp.parse(value)
		const trailingSpaces = value.match(/([ \t\n]+)$/)?.[1]
		if (node && trailingSpaces) {
			const appendTextToLastTextChild = (node: ProsemirrorNode, text: string): ProsemirrorNode => {
				if (node.isText) {
					return (node as any).withText(node.text + text)
				}
				const lastChild = node.lastChild
				if (lastChild) {
					return node.copy(node.content.replaceChild(node.childCount - 1, appendTextToLastTextChild(lastChild, text)))
				}
				return node
			}

			return appendTextToLastTextChild(node, trailingSpaces)
		}
		return node
	}
}

// Extend the LitElement base class
export class IcureTextField extends Field {
	get _ownerSearch(): HTMLInputElement | null {
		return this.renderRoot.querySelector('#ownerSearch')
	}
	@property() placeholder = ''
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property({ type: Boolean }) displayOwnerMenu = false
	@property({ type: Boolean }) suggestions = false
	@property({ type: Boolean }) links = false
	@property() linksProvider: (sug: { id: string; code: string; text: string; terms: string[] }) => Promise<{ href: string; title: string } | undefined> = () =>
		Promise.resolve(undefined)
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() ownersProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')
	@property() schema: IcureTextFieldSchema = 'styled-text-with-codes'

	@state() protected containerId?: string

	@state() protected displayOwnersMenu = false
	@state() protected ownerInputValue = ''
	@state() protected availableOwners: Suggestion[] = []

	@state() protected displayLanguagesMenu = false
	@state() protected languageInputValue = ''

	@state() protected displayVersionsMenu = false

	@state() protected availableLanguages = [this.displayedLanguage]

	private proseMirrorSchema?: Schema
	private parser?: SpacePreservingMarkdownParser | { parse: (value: string) => ProsemirrorNode }
	private serializer: MarkdownSerializer | { serialize: (content: ProsemirrorNode) => string } = {
		serialize: (content: ProsemirrorNode) => content.textBetween(0, content.nodeSize - 2, ' '),
	}
	private primitiveTypeExtractor: (doc?: ProsemirrorNode) => PrimitiveType | undefined = () => undefined
	private codesExtractor: (doc?: ProsemirrorNode) => Code[] = () => []

	@state() private view?: EditorView
	private container?: HTMLElement
	private readonly windowListeners: [string, () => void][] = []
	private suggestionPalette?: SuggestionPalette
	private mouseCount = 0
	private trToSave?: Transaction = undefined

	constructor() {
		super()
	}

	connectedCallback() {
		super.connectedCallback()
		const cmu = this.mouseUp.bind(this)
		const cmd = this.mouseDown.bind(this)

		this.windowListeners.push(['mouseup', cmu], ['mousedown', cmd])
		window.addEventListener('mouseup', cmu)
		window.addEventListener('mousedown', cmd)
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		this.windowListeners.forEach((wl) => window.removeEventListener(wl[0], wl[1]))
	}

	static get styles() {
		return [baseCss, kendoCss]
	}

	render() {
		if (this.view) {
			const [, versions] = extractSingleValue(this.valueProvider?.())
			if (versions) {
				const valueForLanguage = versions[0]?.value?.content?.[this.language()] ?? ''
				if (valueForLanguage && valueForLanguage.type === 'string' && valueForLanguage.value) {
					const parsedDoc = this.parser?.parse(valueForLanguage.value) ?? undefined
					if (parsedDoc) {
						const selection = this.view.state.selection
						console.log(selection)
						const selAnchor = selection.$anchor.pos
						const selHead = selection.$head.pos
						const lastPos = parsedDoc.content.size
						const newState = EditorState.create({
							schema: this.view.state.schema,
							doc: parsedDoc,
							plugins: this.view.state.plugins,
							selection: new TextSelection(parsedDoc.resolve(Math.min(selAnchor, lastPos)), parsedDoc.resolve(Math.min(selHead, lastPos))),
						})
						this.view.updateState(newState)
					}
				}
			}
		}

		return html`
			<div id="root" class="${this.visible ? 'icure-text-field' : 'hidden'}" data-placeholder=${this.placeholder}>
				${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined) : nothing}
				<div class="icure-input">
					<div id="editor"></div>
				</div>
			</div>
		`
	}

	toggleOwnerMenu() {
		this.displayOwnersMenu = !this.displayOwnersMenu
	}

	searchOwner(e: InputEvent) {
		const text = (e.target as HTMLInputElement).value
		setTimeout(async () => {
			if (this._ownerSearch?.value === text) {
				if (this.ownersProvider) {
					const availableOwners = await this.ownersProvider(text.split(' '))
					console.log(availableOwners)
					this.availableOwners = availableOwners
				}
			}
		}, 300)
	}

	handleOwnerButtonClicked(id: string) {
		this.handleMetadataChanged && this.containerId && this.handleMetadataChanged(this.containerId, { label: this.label, owner: id })
		this.displayOwnersMenu = false
	}

	toggleLanguageMenu() {
		this.displayLanguagesMenu = !this.displayLanguagesMenu
	}

	mouseDown() {
		this.mouseCount++
	}

	mouseUp() {
		this.mouseCount = 0
		if (!this.view?.dom?.classList?.contains('ProseMirror-focused')) {
			this.view?.dom?.parentElement?.querySelectorAll('.companion')?.forEach((x) => {
				;(x as HTMLElement).style.display = 'none'
			})
		}
	}

	firstUpdated() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const cmp = this
		const pms: Schema = (this.proseMirrorSchema = createSchema(
			this.schema,
			(t, c, isC) => (isC ? this.codeColorProvider(t, c) : this.linkColorProvider(t, c)),
			this.codeContentProvider,
		))

		this.parser = this.makeParser(this.schema, pms)
		this.primitiveTypeExtractor = this.makePrimitiveExtractor(this.schema)
		this.codesExtractor = this.makeCodesExtractor(this.schema)

		this.container = this.shadowRoot?.getElementById('editor') || undefined

		if (this.container) {
			const br = pms.nodes.hard_break
			const hardBreak = chainCommands(exitCode, (state, dispatch) => {
				dispatch && dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
				return true
			})

			const replaceRangeWithSuggestion = async (from: number, to: number, sug: { id: string; code: string; text: string; terms: string[] }) => {
				const link = await this.linksProvider(sug)
				return (link && cmp.view && cmp.view.state.tr.replaceWith(from, to, pms.text(sug.text, [pms.mark('link', link)]))) || undefined
			}

			const headingsKeymap = keymap(
				[1, 2, 3, 4, 5, 6].reduce((acc, idx) => {
					return Object.assign(acc, { [`Mod-ctrl-${idx}`]: setBlockType(pms.nodes.heading, { level: '' + idx }) })
				}, {}),
			)

			//Currently take the first piece of data if it is available
			this.view = new EditorView(this.container, {
				state: EditorState.create({
					doc: undefined,
					schema: this.proseMirrorSchema,
					plugins: [
						caretFixPlugin(),
						history(),
						this.links
							? new Plugin({
									view(editorView) {
										return new SelectionCompanion(editorView, () => cmp.mouseCount > 0)
									},
							  })
							: null,
						this.suggestions
							? new Plugin({
									view(editorView) {
										return (cmp.suggestionPalette = new SuggestionPalette(
											pms,
											editorView,
											(terms: string[]) => cmp.suggestionProvider(terms),
											() => cmp.suggestionStopWords,
										))
									},
							  })
							: null,
						this.suggestions
							? keymap({
									Tab: () => {
										return (cmp.suggestionPalette && this.view && cmp.suggestionPalette.focusOrInsert(this.view, replaceRangeWithSuggestion)) || false
									},
									ArrowUp: () => {
										return (cmp.suggestionPalette && cmp.suggestionPalette.arrowUp()) || false
									},
									ArrowDown: () => {
										return (cmp.suggestionPalette && cmp.suggestionPalette.arrowDown()) || false
									},
									Enter: () => {
										return (cmp.suggestionPalette && this.view && cmp.suggestionPalette.insert(this.view, replaceRangeWithSuggestion)) || false
									},
							  })
							: null,
						keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo }),
						keymap(
							Object.assign(
								{},
								pms.marks.strong ? { 'Mod-b': toggleMark(pms.marks.strong) } : {},
								pms.marks.em ? { 'Mod-i': toggleMark(pms.marks.em) } : {},
								pms.nodes.paragraph ? { 'Alt-ArrowUp': joinUp } : {},
								pms.nodes.paragraph ? { 'Alt-ArrowDown': joinDown } : {},
								pms.nodes.paragraph ? { 'Alt-Enter': hardBreak } : {},
								pms.nodes.paragraph ? { 'Shift-Enter': hardBreak } : {},
								pms.nodes.ordered_list ? { 'Shift-ctrl-1': wrapInList(pms.nodes.ordered_list) } : {},
								pms.nodes.bullet_list ? { 'Shift-ctrl-*': wrapInList(pms.nodes.bullet_list) } : {},
								pms.nodes.blockquote ? { 'Shift-ctrl-w': wrapInIfNeeded(pms.nodes.blockquote) } : {},
								pms.nodes.blockquote ? { 'Shift-ctrl-u': unwrapFrom(pms.nodes.blockquote) } : {},
								pms.nodes.paragraph ? { 'Mod-ctrl-0': setBlockType(pms.nodes.paragraph) } : {},
								pms.nodes.paragraph ? { 'Shift-ctrl-0': setBlockType(pms.nodes.paragraph) } : {},
								pms.nodes.list_item ? { Enter: splitListItem(pms.nodes.list_item) } : {},
								pms.nodes.ordered_list || pms.nodes.bullet_list ? { 'Mod-(': liftListItem(pms.nodes.list_item) } : {},
								pms.nodes.ordered_list || pms.nodes.bullet_list ? { 'Mod-[': liftListItem(pms.nodes.list_item) } : {},
								pms.nodes.ordered_list || pms.nodes.bullet_list ? { 'Mod-)': sinkListItem(pms.nodes.list_item) } : {},
								pms.nodes.ordered_list || pms.nodes.bullet_list ? { 'Mod-]': sinkListItem(pms.nodes.list_item) } : {},
							),
						),
						pms.nodes.heading ? headingsKeymap : null,
						maskPlugin(),
						regexpPlugin(),
						hasContentClassPlugin(this.shadowRoot || undefined),
						keymap(baseKeymap),
					]
						.filter((x) => !!x)
						.map((x) => x as Plugin),
				}),
				dispatchTransaction: (tr) => {
					this.view && this.view.updateState(this.view.state.apply(tr))
					if (this.view && tr.doc != tr.before && this.handleValueChanged) {
						this.trToSave = tr
						setTimeout(() => {
							// eslint-disable-next-line max-len
							if (this.trToSave === tr) {
								this.updateValue(tr)
							}
						}, 800)
					}
				},
				editable: () => {
					return !this.readonly
				},
			})
		}
	}

	private updateValue(tr: Transaction) {
		const [valueId] = extractSingleValue(this.valueProvider?.())
		const value = this.primitiveTypeExtractor?.(tr.doc)
		value &&
			this.handleValueChanged?.(
				this.label,
				this.language(),
				{
					content: { [this.language()]: value },
					codes: this.codesExtractor?.(tr.doc) ?? [],
				},
				valueId,
			)
	}

	private makeParser(schemaName: string, pms: Schema) {
		const tokenizer = MarkdownIt('commonmark', { html: false })
		return schemaName === 'date'
			? {
					parse: (value: string) => pms.node('paragraph', {}, [pms.node('date', {}, value ? [pms.text(value)] : [])]),
			  }
			: schemaName === 'time'
			? {
					parse: (value: string) => pms.node('paragraph', {}, [pms.node('time', {}, value ? [pms.text(value)] : [])]),
			  }
			: schemaName === 'measure'
			? {
					parse: (value: string) => {
						const decimal = value ? value.split(' ')[0] : ''
						const unit = value ? value.split(' ')[1] : ''

						return pms.node('paragraph', {}, [
							pms.node('decimal', {}, decimal && decimal.length ? [pms.text(decimal)] : [pms.text(' ')]),
							pms.node('unit', {}, unit && unit.length ? [pms.text(unit)] : [pms.text(' ')]),
						])
					},
			  }
			: schemaName === 'decimal'
			? {
					parse: (value: string) => {
						return pms.node('paragraph', {}, [pms.node('decimal', {}, value && value.length ? [pms.text(value)] : [pms.text(' ')])])
					},
			  }
			: schemaName === 'date-time'
			? {
					parse: (value: string) => {
						const date = value ? value.split(' ')[0] : ''
						const time = value ? value.split(' ')[1] : ''

						return pms.node('paragraph', {}, [
							pms.node('date', {}, date && date.length ? [pms.text(date)] : [pms.text(' ')]),
							pms.node('time', {}, time && time.length ? [pms.text(time)] : [pms.text(' ')]),
						])
					},
			  }
			: schemaName === 'text-document'
			? new SpacePreservingMarkdownParser(
					new MarkdownParser(pms, MarkdownIt('commonmark', { html: false }), {
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
						hardBreak: { node: 'hard_break' },

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
					}),
			  )
			: new SpacePreservingMarkdownParser(
					new MarkdownParser(
						pms,
						{
							parse: (src: string, env: unknown): unknown[] => {
								return tokenizer.parse(src, env).filter((t) => !t.type.startsWith('paragraph_'))
							},
						} as MarkdownIt,
						{
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
						},
					),
			  )
	}

	private makeCodesExtractor(schemaName: string): (doc?: ProsemirrorNode) => Code[] {
		return schemaName === 'measure'
			? (doc?: ProsemirrorNode) => {
					const unit = doc?.child(1)?.textContent
					return unit ? [{ id: `CD-UNIT|${unit}|1`, label: { [this.displayedLanguage ?? 'en']: unit } }] : []
			  }
			: schemaName === 'measure'
			? (doc?: ProsemirrorNode) => {
					const unit = doc?.child(1)?.textContent
					return unit ? [{ id: `CD-UNIT|${unit}|1`, label: { [this.displayedLanguage ?? 'en']: unit } }] : []
			  }
			: () => []
	}

	private makePrimitiveExtractor(schemaName: string): (doc?: ProsemirrorNode) => PrimitiveType | undefined {
		return schemaName === 'date'
			? (doc?: ProsemirrorNode) =>
					doc?.firstChild?.textContent ? { type: 'datetime', value: parseInt(format(parse(doc.firstChild.textContent, 'dd/MM/yyyy', new Date()), 'yyyyMMdd')) } : undefined
			: schemaName === 'time'
			? (doc?: ProsemirrorNode) =>
					doc?.firstChild?.textContent ? { type: 'datetime', value: parseInt(format(parse(doc.firstChild.textContent, 'HH:mm:ss', new Date()), 'HHmmss')) } : undefined
			: schemaName === 'measure'
			? (doc?: ProsemirrorNode) => (doc?.firstChild?.textContent ? { type: 'measure', value: parseFloat(doc.firstChild.textContent), unit: doc?.child(1)?.textContent } : undefined)
			: schemaName === 'decimal'
			? (doc?: ProsemirrorNode) => (doc?.firstChild?.textContent ? { type: 'number', value: parseFloat(doc.firstChild.textContent.replace(/,/g, '.')) } : undefined)
			: schemaName === 'date-time'
			? (doc?: ProsemirrorNode) =>
					doc?.firstChild?.textContent && doc?.lastChild?.textContent
						? {
								type: 'datetime',
								value: parseInt(format(parse(doc.firstChild.textContent + ' ' + doc.lastChild.textContent, 'dd/MM/yyyy HH:mm:ss', new Date()), 'yyyyMMddHHmmss')),
						  }
						: undefined
			: (doc?: ProsemirrorNode) => (doc ? { type: 'string', value: this.serializer.serialize(doc) } : undefined)
	}
}

// Register the new element with the browser.
customElements.define('icure-text-field', IcureTextField)
