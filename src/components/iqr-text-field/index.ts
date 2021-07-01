// Import the LitElement base class and html helper function
import { html, LitElement } from 'lit'
import { property } from 'lit/decorators'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, exitCode, joinDown, joinUp, setBlockType, toggleMark } from 'prosemirror-commands'
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'

import { createSchema, IqrTextFieldSchema } from './schema'
import MarkdownIt from 'markdown-it'
import { MarkdownParser } from 'prosemirror-markdown'
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

export { IqrTextFieldSchema } from './schema'
export { Suggestion } from './suggestion-palette'

type FullSchema = Schema<
	'doc' | 'paragraph' | 'list_item' | 'image' | 'blockquote' | 'bullet_list' | 'hard_break' | 'heading' | 'horizontal_rule' | 'ordered_list' | 'text',
	'strong' | 'em' | 'link'
>
type DateTimeSchema = Schema<'paragraph' | 'date' | 'time' | 'text'>

// Extend the LitElement base class
class IqrTextField extends LitElement {
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property() linksProvider: (sug: { id: string; code: string; text: string; terms: string[] }) => Promise<{ href: string; title: string } | undefined> = () =>
		Promise.resolve(undefined)
	@property() suggestionProvider: (terms: string[]) => Suggestion[] = () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')
	@property() schema: IqrTextFieldSchema = 'styled-text-with-codes'
	@property() label = ''
	@property() labelPosition: 'float' | 'side' | 'above' | 'hidden' = 'float'
	@property() placeholder = ''
	@property() value = ''
	@property() owner?: string
	@property({ type: Boolean }) displayOwnerMenu = false
	@property({ type: Boolean }) suggestions = false
	@property({ type: Boolean }) links = false
	@property() textRegex = ''

	private proseMirrorSchema?: Schema
	private parser?: MarkdownParser<FullSchema> | { parse: (value: string) => ProsemirrorNode<DateTimeSchema> }

	private view?: EditorView
	private container?: HTMLElement
	private readonly windowListeners: [string, () => void][] = []
	private suggestionPalette?: SuggestionPalette
	private mouseCount = 0

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
			<div id="root" class="iqr-text-field" data-placeholder=${this.placeholder}>
				<label class="iqr-label ${this.labelPosition}"><span>${this.label}</span></label>
				<div class="iqr-input">
					<div id="editor"></div>
					<div id="extra" class=${'extra' + (this.displayOwnerMenu ? ' forced' : '')}>
						<div class="info">~${this.owner}</div>
						<div class="buttons-container">
							<div class="menu-container">
								<button data-content="${this.owner}" @click="${this.toggleOwnerMenu}" class="btn menu-trigger author">
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											fill-rule="evenodd"
											clip-rule="evenodd"
											d="M10 5C10 7.76142 7.76142 10 5 10C2.23858 10 0 7.76142 0 5C0 2.23858 2.23858 0 5 0C7.76142 0 10 2.23858 10 5ZM7 3C7 4.10457 6.10457 5 5 5C3.89543 5 3 4.10457 3 3C3 1.89543 3.89543 1 5 1C6.10457 1 7 1.89543 7 3ZM5.00001 9C6.53071 9 7.8606 8.1402 8.53306 6.8772C7.62844 6.33518 6.37946 6 5.00001 6C3.62055 6 2.37158 6.33517 1.46695 6.87719C2.13941 8.14019 3.4693 9 5.00001 9Z"
										/>
									</svg>
								</button>
								${this.displayOwnerMenu
									? html`
											<div id="menu" class="menu">
												<div class="input-container">
													<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path
															d="M12.9167 11.6667H12.2583L12.025 11.4417C12.8417 10.4917 13.3333 9.25833 13.3333 7.91667C13.3333 4.925 10.9083 2.5 7.91667 2.5C4.925 2.5 2.5 4.925 2.5 7.91667C2.5 10.9083 4.925 13.3333 7.91667 13.3333C9.25833 13.3333 10.4917 12.8417 11.4417 12.025L11.6667 12.2583V12.9167L15.8333 17.075L17.075 15.8333L12.9167 11.6667ZM7.91667 11.6667C5.84167 11.6667 4.16667 9.99167 4.16667 7.91667C4.16667 5.84167 5.84167 4.16667 7.91667 4.16667C9.99167 4.16667 11.6667 5.84167 11.6667 7.91667C11.6667 9.99167 9.99167 11.6667 7.91667 11.6667Z"
															fill="#809AB4"
														/>
													</svg>
													<input />
												</div>
												<button class="item">Jean René</button>
												<button class="item">Jean José</button>
												<button class="item">Marie-Josée Perrec</button>
											</div>
									  `
									: ''}
							</div>
							<div class="menu-container">
								<button data-content="01/02/20" class="btn date">
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											fill-rule="evenodd"
											clip-rule="evenodd"
											d="M2 0C0.895431 0 0 0.89543 0 2V8C0 9.10457 0.89543 10 2 10H8C9.10457 10 10 9.10457 10 8V2C10 0.895431 9.10457 0 8 0H2ZM1 3V8C1 8.55229 1.44772 9 2 9H8C8.55229 9 9 8.55229 9 8V3H1ZM8 8H5V5H8V8Z"
										/>
									</svg>
								</button>
							</div>
							<div class="menu-container">
								<button data-content="1.0" class="btn version">
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											fill-rule="evenodd"
											clip-rule="evenodd"
											d="M5 10C7.76141 10 10 7.76142 10 5C10 2.23858 7.76141 0 5 0C2.23859 0 0 2.23858 0 5C0 7.76142 2.23859 10 5 10ZM3.5 3.33172C3.03394 3.16698 2.70001 2.72249 2.70001 2.2C2.70001 1.53726 3.23727 1 3.90002 1C4.56274 1 5.10001 1.53726 5.10001 2.2C5.10001 2.72249 4.76608 3.16698 4.30002 3.33172V5.04041C4.73386 4.59767 5.31354 4.29838 5.96133 4.22028C6.12021 3.74364 6.56998 3.4 7.10001 3.4C7.76276 3.4 8.30002 3.93726 8.30002 4.6C8.30002 5.26274 7.76276 5.8 7.10001 5.8C6.58722 5.8 6.14957 5.47836 5.97775 5.02583C5.13132 5.16293 4.46295 5.8313 4.32584 6.67775C4.77838 6.84955 5.10001 7.28722 5.10001 7.8C5.10001 8.46274 4.56274 9 3.90002 9C3.23727 9 2.70001 8.46274 2.70001 7.8C2.70001 7.27751 3.03394 6.83302 3.5 6.66828V3.33172ZM3.5 7.8C3.5 7.58001 3.67758 7.4015 3.89722 7.4H3.9028C4.12241 7.4015 4.29999 7.58001 4.29999 7.8C4.29999 8.0209 4.12091 8.2 3.89999 8.2C3.67908 8.2 3.5 8.0209 3.5 7.8ZM6.70001 4.59555V4.60446C6.70239 4.82333 6.88055 5.00001 7.09998 5.00001C7.32089 5.00001 7.5 4.82092 7.5 4.60001C7.5 4.37909 7.32089 4.2 7.09998 4.2C6.88055 4.2 6.70239 4.37669 6.70001 4.59555ZM3.89999 2.6C4.12091 2.6 4.29999 2.42091 4.29999 2.2C4.29999 1.97909 4.12091 1.8 3.89999 1.8C3.67908 1.8 3.5 1.97909 3.5 2.2C3.5 2.42091 3.67908 2.6 3.89999 2.6Z"
										/>
									</svg>
								</button>
							</div>
							<div class="menu-container">
								<button data-content="fr" class="btn language">
									<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											d="M5 0C2.2379 0 0 2.2379 0 5C0 7.7621 2.2379 10 5 10C7.7621 10 10 7.7621 10 5C10 2.2379 7.7621 0 5 0ZM9.03226 5C9.03226 5.45363 8.95363 5.89113 8.81452 6.29839H8.40524C8.31855 6.29839 8.23589 6.26411 8.1754 6.20161L7.53024 5.54435C7.43952 5.45161 7.43952 5.3004 7.53226 5.20766L7.78427 4.95565V4.78024C7.78427 4.71976 7.76008 4.66129 7.71774 4.61895L7.52823 4.42944C7.48589 4.3871 7.42742 4.3629 7.36694 4.3629H7.04435C6.91935 4.3629 6.81653 4.26008 6.81653 4.13508C6.81653 4.0746 6.84073 4.01613 6.88306 3.97379L7.07258 3.78427C7.11492 3.74194 7.17339 3.71774 7.23387 3.71774H7.87903C8.00403 3.71774 8.10685 3.61492 8.10685 3.48992V3.3004C8.10685 3.1754 8.00403 3.07258 7.87903 3.07258H7.13911C6.96169 3.07258 6.81653 3.21774 6.81653 3.39516V3.48589C6.81653 3.625 6.72782 3.74798 6.59677 3.79234L5.95968 4.00403C5.89315 4.02621 5.84879 4.08669 5.84879 4.15726V4.20161C5.84879 4.29032 5.77621 4.3629 5.6875 4.3629H5.36492C5.27621 4.3629 5.20363 4.29032 5.20363 4.20161C5.20363 4.1129 5.13105 4.04032 5.04234 4.04032H4.97984C4.91935 4.04032 4.8629 4.0746 4.83468 4.12903L4.64516 4.50605C4.59073 4.61492 4.47984 4.68347 4.35685 4.68347H3.91129C3.73387 4.68347 3.58871 4.53831 3.58871 4.36089V3.85081C3.58871 3.76613 3.62298 3.68347 3.68347 3.62298L4.08871 3.21774C4.18145 3.125 4.23387 2.99798 4.23387 2.86492C4.23387 2.79637 4.27823 2.73387 4.34476 2.71169L5.15121 2.44355C5.18548 2.43145 5.21573 2.41331 5.23992 2.38911L5.78024 1.84879C5.82258 1.80645 5.84677 1.74798 5.84677 1.6875C5.84677 1.5625 5.74395 1.45968 5.61895 1.45968H5.20161L4.87903 1.78226V1.94355C4.87903 2.03226 4.80645 2.10484 4.71774 2.10484H4.39516C4.30645 2.10484 4.23387 2.03226 4.23387 1.94355V1.54032C4.23387 1.48992 4.25806 1.44153 4.29839 1.41129L4.88105 0.97379C4.91935 0.971774 4.95766 0.967742 4.99597 0.967742C7.22379 0.967742 9.03226 2.77621 9.03226 5ZM2.62298 2.84476C2.62298 2.78427 2.64718 2.72581 2.68952 2.68347L3.20161 2.17137C3.24395 2.12903 3.30242 2.10484 3.3629 2.10484C3.4879 2.10484 3.59073 2.20766 3.59073 2.33266V2.65524C3.59073 2.71573 3.56653 2.77419 3.52419 2.81653L3.33468 3.00605C3.29234 3.04839 3.23387 3.07258 3.17339 3.07258H2.85081C2.72581 3.07258 2.62298 2.96976 2.62298 2.84476ZM5.20363 9.02218V8.87903C5.20363 8.70161 5.05847 8.55645 4.88105 8.55645H4.47379C4.25605 8.55645 3.93548 8.4496 3.76008 8.31855L3.3125 7.98185C3.08065 7.80847 2.94556 7.53629 2.94556 7.24798V6.76613C2.94556 6.44355 3.11492 6.14516 3.39113 5.97984L4.25605 5.46169C4.39919 5.37702 4.5625 5.33065 4.72782 5.33065H5.35685C5.57661 5.33065 5.78831 5.40927 5.95363 5.5504L6.8246 6.29839H7.19355C7.36492 6.29839 7.52823 6.36694 7.64919 6.4879L7.99798 6.83669C8.06653 6.90524 8.16129 6.94355 8.25806 6.94355H8.52823C7.875 8.13105 6.6371 8.9496 5.20363 9.02218Z"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`
	}

	toggleOwnerMenu() {
		this.displayOwnerMenu = !this.displayOwnerMenu
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
		const pms: Schema = (this.proseMirrorSchema = createSchema(
			this.schema,
			(t, c, isC) => (isC ? this.codeColorProvider(t, c) : this.linkColorProvider(t, c)),
			this.codeContentProvider,
		))
		const tokenizer = MarkdownIt('commonmark', { html: false })
		this.parser =
			this.schema === 'date'
				? {
						parse: (value: string) => pms.node('paragraph', {}, [pms.node('date', {}, value ? [pms.text(value)] : [])]),
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
						hardbreak: { node: 'hard_break' },

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

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const cmp = this
		this.container = this.shadowRoot?.getElementById('editor') || undefined

		const br = pms.nodes.hard_break
		const hardBreak = chainCommands(exitCode, (state, dispatch) => {
			dispatch && dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
			return true
		})

		const replaceRangeWithSuggestion = async (from: number, to: number, sug: { id: string; code: string; text: string; terms: string[] }) => {
			const link = await this.linksProvider(sug)
			return (link && cmp.view && cmp.view.state.tr.replaceWith(from, to, pms.text(sug.text, [pms.mark('link', link)]))) || undefined
		}

		if (this.container) {
			const headingsKeymap = keymap(
				[1, 2, 3, 4, 5, 6].reduce((acc, idx) => {
					return Object.assign(acc, { [`Mod-ctrl-${idx}`]: setBlockType(pms.nodes.heading, { level: '' + idx }) })
				}, {}),
			)

			const parsedDoc = this.parser.parse(this.value)
			this.view = new EditorView(this.container, {
				state: EditorState.create({
					doc: parsedDoc,
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
					//current state as json in text area
					//this.view && console.log(JSON.stringify(this.view.state.doc.toJSON(), null, 2));
				},
			})
		}
	}
}

// Register the new element with the browser.
customElements.define('iqr-text-field', IqrTextField)
