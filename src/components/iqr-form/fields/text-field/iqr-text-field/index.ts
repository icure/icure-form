// Import the LitElement base class and html helper function
import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import { EditorState, Plugin, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, exitCode, joinDown, joinUp, setBlockType, toggleMark } from 'prosemirror-commands'
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'

import { createSchema, IqrTextFieldSchema } from './schema'
import MarkdownIt from 'markdown-it'
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown'
import { unwrapFrom, wrapInIfNeeded } from './prosemirror-commands'
import { SelectionCompanion } from './selection-companion'
import { Suggestion, SuggestionPalette } from './suggestion-palette'
import { caretFixPlugin } from './plugin/caret-fix-plugin'
import { hasMark } from './prosemirror-utils'

// @ts-ignore
import baseCss from './styles/style.scss'
// @ts-ignore
import kendoCss from './styles/kendo.scss'

import { maskPlugin } from './plugin/mask-plugin'
import { hasContentClassPlugin } from './plugin/has-content-class-plugin'
import { regexpPlugin } from './plugin/regexp-plugin'
import { sorted } from '../../../../../utils/no-lodash'
import { generateLabel, generateLabels } from '../../label'
import { Content, Measure } from '@icure/api'
import { parse, format } from 'date-fns'
import { ValuedField } from '../../../../common'
import { StateToUpdate, Trigger } from '../../../model'

export { IqrTextFieldSchema } from './schema'
export { Suggestion } from './suggestion-palette'

export interface Meta {
	revision: string
	modified?: number
	valueDate?: number | null
	owner?: { id: string; descr?: string } | null
}

export interface Version {
	revision: string
	modified?: number
	value: { [language: string]: string }
}

export interface VersionedMeta {
	id: string
	metas: Meta[]
}

export interface VersionedValue {
	id: string
	versions: Version[]
}
// Extend the LitElement base class
export class IqrTextField extends ValuedField<string, VersionedValue> {
	get _ownerSearch(): HTMLInputElement | null {
		return this.renderRoot.querySelector('#ownerSearch')
	}
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
	@property() schema: IqrTextFieldSchema = 'styled-text-with-codes'
	@property() textRegex = ''

	@property() owner?: string

	@property() metaProvider?: () => VersionedMeta | undefined = undefined
	@property() handleMetaChanged?: (id: string, meta: Meta) => void = undefined

	@state() protected displayOwnersMenu = false
	@state() protected ownerInputValue = ''
	@state() protected availableOwners: Suggestion[] = []

	@state() protected displayLanguagesMenu = false
	@state() protected languageInputValue = ''

	@state() protected displayVersionsMenu = false

	@state() protected displayedVersion = '0'

	@state() protected availableLanguages = [this.displayedLanguage]

	private proseMirrorSchema?: Schema
	private parser?: MarkdownParser | { parse: (value: string) => ProsemirrorNode }
	private serializer: MarkdownSerializer | { serialize: (content: ProsemirrorNode) => string } = {
		serialize: (content: ProsemirrorNode) => content.textBetween(0, content.nodeSize - 2, ' '),
	}
	private contentMaker: (doc?: ProsemirrorNode) => Content = () => ({})

	private view?: EditorView
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
		return html`
			<div id="root" class="${this.display ? 'iqr-text-field' : 'hidden'}" data-placeholder=${this.placeholder}>
				${this.labels ? generateLabels(this.labels, this.translationProvider) : generateLabel(this.label ?? '', this.labelPosition ?? 'float', this.translationProvider)}
				<div class="iqr-input">
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
		this.handleMetaChanged && this.containerId && this.handleMetaChanged(this.containerId, { revision: this.displayedVersion, owner: { id } })
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
		this.registerStateUpdater(this.label || '')
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const cmp = this
		const pms: Schema = (this.proseMirrorSchema = createSchema(
			this.schema,
			(t, c, isC) => (isC ? this.codeColorProvider(t, c) : this.linkColorProvider(t, c)),
			this.codeContentProvider,
		))

		this.parser = this.makeParser(pms)
		this.contentMaker = this.makeContentMaker()

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

			const providedValue = this.valueProvider && this.valueProvider()
			this.displayedVersion = providedValue?.versions?.[0]?.revision || '0'
			const displayedVersionedValue = providedValue?.versions?.[0]?.value
			this.containerId = providedValue?.id

			this.availableLanguages = displayedVersionedValue && Object.keys(displayedVersionedValue).length ? sorted(Object.keys(displayedVersionedValue)) : this.availableLanguages
			if (!this.availableLanguages.includes(this.displayedLanguage)) {
				this.displayedLanguage = this.availableLanguages[0]
			}

			const parsedDoc = this.parser.parse(this.valueProvider ? displayedVersionedValue?.[this.displayedLanguage ?? 'en'] || this.value || '' : this.value || '') ?? undefined

			this.view = new EditorView(this.container, {
				state: EditorState.create({
					doc: parsedDoc ?? undefined,
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
								const serialized = this.serializer.serialize(tr.doc)
								const content = this.contentMaker?.(tr.doc)
								this.containerId = this.handleValueChanged?.(this.displayedLanguage ?? 'en', { asString: serialized, content: content }, this.containerId, [])
								if (this.actionManager) {
									this.actionManager.launchActions(Trigger.CHANGE, this.label || '', { value: serialized, content: content })
								}
							}
						}, 800)
					}
				},
				editable: () => {
					return this.editable
				},
			})
			if (parsedDoc ? this.serializer.serialize(parsedDoc) : '' !== '') {
				this.actionManager?.defaultSandbox.set(this.label || '', {
					value: parsedDoc ? this.serializer.serialize(parsedDoc) : '',
					content: this.contentMaker?.(parsedDoc),
				})
				this.containerId = this.handleValueChanged?.(
					this.displayedLanguage ?? 'en',
					{ asString: parsedDoc ? this.serializer.serialize(parsedDoc) : '', content: this.contentMaker?.(parsedDoc) },
					this.containerId,
					[],
				)
			}
		}
	}

	private makeParser(pms: Schema) {
		const tokenizer = MarkdownIt('commonmark', { html: false })
		return this.schema === 'date'
			? {
					parse: (value: string) => pms.node('paragraph', {}, [pms.node('date', {}, value ? [pms.text(value)] : [])]),
			  }
			: this.schema === 'time'
			? {
					parse: (value: string) => pms.node('paragraph', {}, [pms.node('time', {}, value ? [pms.text(value)] : [])]),
			  }
			: this.schema === 'measure'
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
			: this.schema === 'decimal'
			? {
					parse: (value: string) => {
						return pms.node('paragraph', {}, [pms.node('decimal', {}, value && value.length ? [pms.text(value)] : [pms.text(' ')])])
					},
			  }
			: this.schema === 'date-time'
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
			: this.schema === 'text-document'
			? new MarkdownParser(pms, MarkdownIt('commonmark', { html: false }), {
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
			  })
			: new MarkdownParser(
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
			  )
	}

	private makeContentMaker() {
		return this.schema === 'date'
			? (doc?: ProsemirrorNode) =>
					new Content({ fuzzyDateValue: doc?.firstChild?.textContent ? format(parse(doc?.firstChild?.textContent, 'dd/MM/yyyy', new Date()), 'yyyyMMdd') : undefined })
			: this.schema === 'time'
			? (doc?: ProsemirrorNode) =>
					new Content({ fuzzyDateValue: doc?.firstChild?.textContent ? format(parse(doc?.firstChild?.textContent, 'HH:mm:ss', new Date()), 'HHmmss') : undefined })
			: this.schema === 'measure'
			? (doc?: ProsemirrorNode) =>
					new Content({
						measureValue: new Measure({ value: doc?.firstChild?.textContent ? parseFloat(doc?.firstChild?.textContent) : undefined, unit: doc?.child(1)?.textContent }),
					})
			: this.schema === 'decimal'
			? (doc?: ProsemirrorNode) =>
					new Content({
						numberValue: doc?.firstChild?.textContent ? parseFloat(doc?.firstChild?.textContent?.replace(/,/g, '.')) : undefined,
					})
			: this.schema === 'date-time'
			? (doc?: ProsemirrorNode) =>
					new Content({
						fuzzyDateValue:
							doc?.firstChild?.textContent && doc?.lastChild?.textContent
								? format(parse(doc?.firstChild?.textContent + ' ' + doc?.lastChild?.textContent, 'dd/MM/yyyy HH:mm:ss', new Date()), 'yyyyMMddHHmmss')
								: undefined,
					})
			: this.schema === 'text-document'
			? (doc?: ProsemirrorNode) =>
					new Content({
						stringValue: doc?.textBetween(0, doc?.nodeSize - 2, '\n'),
					})
			: (doc?: ProsemirrorNode) =>
					new Content({
						stringValue: doc?.textBetween(0, doc?.nodeSize - 2, '\n'),
					})
	}
	// private getMeta(): Meta | undefined {
	// 	return (this.metaProvider && this.metaProvider()?.metas?.find((vm) => vm.revision === this.displayedVersion)) || undefined
	// }

	//override
	public stateUpdater(state: StateToUpdate, result: any): void {
		switch (state) {
			case StateToUpdate.VALUE:
				this.value = result
				if (this.view) {
					const tr = this.view?.state.tr
					tr?.delete(0, tr.doc.nodeSize - 2)
					tr?.insertText(this.value || '')
					this.view?.dispatch(tr)
				}
				break
			case StateToUpdate.VISIBLE:
				this.display = result
				break
			default:
				break
		}
	}
}

// Register the new element with the browser.
customElements.define('iqr-text-field', IqrTextField)
