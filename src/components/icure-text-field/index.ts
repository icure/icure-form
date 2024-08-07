// Import the LitElement base class and html helper function
//@ts-ignore
import { css, html, nothing } from 'lit'
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
import { defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown'
import { unwrapFrom, wrapInIfNeeded } from './prosemirror-commands'
import { SelectionCompanion } from './selection-companion'
import { SuggestionPalette } from './suggestion-palette'
import { hasMark } from './prosemirror-utils'

import { maskPlugin } from './plugin/mask-plugin'
import { hasContentClassPlugin } from './plugin/has-content-class-plugin'
import { regexpPlugin } from './plugin/regexp-plugin'
import { format, parse } from 'date-fns'
import { Field } from '../common'
import { Code, FieldMetadata, FieldValue, IcureTextFieldSchema, PrimitiveType, pteq, StringType } from '../model'
import { Suggestion, Version } from '../../generic'
import { generateLabels } from '../common/utils'

// @ts-ignore
import baseCss from '../common/styles/style.scss'

import { extractSingleValue, extractValues } from '../icure-form/fields/utils'
import { preprocessEmptyNodes, SpacePreservingMarkdownParser } from '../../utils/markdown'
import { measureOnFocusHandler, measureTransactionMapper } from './schema/measure-schema'
import { anyDateToDate } from '../../utils/dates'

// Extend the LitElement base class
export class IcureTextField extends Field {
	@property() placeholder = ''
	@property() multiline: boolean | string = false
	@property() lines = 1
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property({ type: Boolean }) displayOwnerMenu = false
	@property({ type: Boolean }) suggestions = false
	@property({ type: Boolean }) links = false
	@property() linksProvider: (sug: Suggestion) => Promise<{ href: string; title: string } | undefined> = async () => undefined
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')
	@property() schema: IcureTextFieldSchema = 'styled-text-with-codes'

	private proseMirrorSchema?: Schema
	private parser?: SpacePreservingMarkdownParser | { parse: (value: PrimitiveType, id?: string) => ProsemirrorNode | undefined }
	private serializer: MarkdownSerializer | { serialize: (content: ProsemirrorNode) => string } = {
		serialize: (content: ProsemirrorNode) => content.textBetween(0, content.nodeSize - 2, ' '),
	}
	private primitiveTypeExtractor: (doc?: ProsemirrorNode) => PrimitiveType | undefined = () => undefined
	private primitiveTypesExtractor: (doc?: ProsemirrorNode) => [string, PrimitiveType][] = () => []
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

	_handleClickOutside(event: MouseEvent): void {
		if (!event.composedPath().includes(this)) {
			event.stopPropagation()
		}
	}

	connectedCallback() {
		super.connectedCallback()
		const cmu = this.mouseUp.bind(this)
		const cmd = this.mouseDown.bind(this)

		document.addEventListener('click', this._handleClickOutside.bind(this))

		this.windowListeners.push(['mouseup', cmu], ['mousedown', cmd])
		window.addEventListener('mouseup', cmu)
		window.addEventListener('mousedown', cmd)
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		document.removeEventListener('click', this._handleClickOutside.bind(this))

		this.windowListeners.forEach((wl) => window.removeEventListener(wl[0], wl[1]))
	}

	static get styles() {
		return [
			css`
				.unit::before {
					content: ' ';
				}
			`,
			baseCss,
		]
	}

	private isMultivalued() {
		return this.schema.includes('tokens-list') || this.schema.includes('items-list')
	}

	private updateValue(tr: Transaction) {
		if (this.isMultivalued()) {
			const values = extractValues(this.valueProvider?.(), this.metadataProvider ?? (() => ({})))
			const valuesFromField = this.primitiveTypesExtractor?.(tr.doc) ?? []

			const unchangedIds: string[] = []
			const newAndModifiedValues: typeof valuesFromField = []
			valuesFromField.forEach(([tid, value]) => {
				const id = tid.length > 0 ? tid : undefined
				const oldValue = id && values.find(([vid, v]) => vid === id && pteq(v[0].value?.content?.[this.language()], value))
				const idPresent = newAndModifiedValues.some(([ttid]) => ttid === tid)
				if (!oldValue || idPresent) {
					newAndModifiedValues.push([idPresent ? '' : tid, value])
				} else {
					unchangedIds.push(tid)
				}
			})

			newAndModifiedValues.forEach(([tid, value]) => {
				const id = tid.length > 0 && !unchangedIds.includes(tid) ? tid : undefined
				this.handleValueChanged?.(
					this.label,
					this.language(),
					value
						? {
								content: { [this.language()]: value },
								codes: [],
						  }
						: undefined,
					id,
				)
			})

			values
				.filter(([vid]) => !valuesFromField.some(([vvid]) => vvid === vid))
				.forEach(([id]) => {
					this.handleValueChanged?.(this.label, this.language(), undefined, id)
				})
		} else {
			const [valueId] = extractSingleValue(this.valueProvider?.())
			const value = this.primitiveTypeExtractor?.(tr.doc)
			this.handleValueChanged?.(
				this.label,
				this.language(),
				value
					? {
							content: { [this.language()]: value },
							codes: this.codesExtractor?.(tr.doc) ?? [],
					  }
					: undefined,
				valueId,
			) && (this.selectedRevision = undefined)
		}
	}


	render() {
		let metadata: FieldMetadata | undefined
		let rev: string | null | undefined
		let versions: Version<FieldValue>[] | undefined
		const validationError = this.validationErrorsProvider?.()?.length
		let valueForExistingLanguages: string[] | undefined = undefined

		if (this.view) {
			let parsedDoc: ProsemirrorNode | undefined

			const data = this.valueProvider?.()
			if (this.isMultivalued()) {
				const values = extractValues(data, this.metadataProvider ?? (() => ({})))
				parsedDoc =
					this.proseMirrorSchema?.topNodeType.createAndFill(
						{},
						values.map(([id, value]) => this.parser?.parse(value?.[0]?.value?.content?.[this.language()] ?? '', id)).filter((x) => !!x) as ProsemirrorNode[],
					) ?? undefined
			} else {
				let id
				;[id, versions] = extractSingleValue(data)
				const version = this.selectedRevision ? versions?.find((v) => v.revision === this.selectedRevision) : versions?.[0]
				const valueForLanguage = version?.value?.content?.[this.language()] ?? ''
				valueForExistingLanguages =  Object.keys(version?.value?.content ?? {})

				parsedDoc = valueForLanguage ? this.parser?.parse(valueForLanguage) ?? undefined : undefined
				rev = version?.revision
				metadata = id && rev !== undefined ? this.metadataProvider?.(id, versions?.map((v) => v.revision) ?? [])?.[id]?.find((m) => m.revision === rev)?.value : undefined
			}

			if (parsedDoc) {
				const selection = this.view.state.selection
				const selAnchor = selection.$anchor.pos
				const selHead = selection.$head.pos
				const lastPos = this.schema === 'text-document' ? parsedDoc.content.size - 1 : parsedDoc.content.size

				if (lastPos < selAnchor || lastPos < selHead) {
					console.log(`Constraining selection to ${Math.min(selAnchor, lastPos)} - ${Math.min(selHead, lastPos)}`)
				}

				const newState = EditorState.create({
					schema: this.view.state.schema,
					doc: parsedDoc,
					plugins: this.view.state.plugins,
					selection: new TextSelection(parsedDoc.resolve(Math.min(selAnchor, lastPos)), parsedDoc.resolve(Math.min(selHead, lastPos))),
				})
				this.view.updateState(newState)
			} else {
				this.view.updateState(
					EditorState.create({
						schema: this.view.state.schema,
						doc: undefined,
						plugins: this.view.state.plugins,
						selection: undefined,
					}),
				)
			}

		}
		return html`
			<div id="root" class="${this.visible ? 'icure-text-field' : 'hidden'}" data-placeholder=${this.placeholder}>
				${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined) : nothing}
				<div class="icure-input-metadata-container">
					<div class="icure-input ${validationError ? 'icure-input__validationError' : ''} ${this.displayMetadata && metadata
						? 'icure-input__withMetadata' : ""}">
						<div id="editor" class="${this.schema}" style="min-height: calc( ${this.lines}rem + 5px )"></div>
					</div>
					
						${this.displayMetadata && metadata
							?
								html`
									<div class="icure-metadata-container ${validationError ? 'icure-metadata-container__validationError' : ''}">
										<icure-metadata-buttons-bar
												.metadata="${metadata}"
												.revision="${rev}"
												.versions="${versions ?? []}"
												.valueId="${extractSingleValue(this.valueProvider?.())?.[0]}"
												.defaultLanguage="${this.defaultLanguage}"
												.selectedLanguage="${this.selectedLanguage}"
												.languages="${this.languages}"
												.handleMetadataChanged="${this.handleMetadataChanged}"
												.handleLanguageSelected="${(iso: string) => (this.selectedLanguage = iso)}"
												.handleRevisionSelected="${(rev: string) => (this.selectedRevision = rev)}"
												.ownersProvider="${this.ownersProvider}"
												.existingLanguages="${valueForExistingLanguages ?? undefined}"
											/>
									</div>
								`
							: ''}
					
				</div>
				<div class="error">${this.validationErrorsProvider?.().map(([, error]) => html`<div>${this.translationProvider?.(this.language(), error)}</div>`)}</div>
			</div>
		`
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
		this.serializer = this.makeSerializer(this.schema, pms)
		this.primitiveTypeExtractor = this.makePrimitiveExtractor(this.schema)
		this.primitiveTypesExtractor = this.makePrimitivesExtractor(this.schema)
		this.codesExtractor = this.makeCodesExtractor(this.schema)

		this.container = this.shadowRoot?.getElementById('editor') || undefined

		if (this.container) {
			const br = pms.nodes.hard_break
			const hardBreak = chainCommands(exitCode, (state, dispatch) => {
				dispatch && dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
				return true
			})

			const replaceRangeWithSuggestion = async (from: number, to: number, sug: Suggestion) => {
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
				handleDOMEvents: {
					blur: (view) => {
						this.trToSave = undefined
						this.updateValue(view.state.tr)
					},
					focus: (view) => {
						this.schema === 'measure' && measureOnFocusHandler(view)
					},
					click: (view, event) => {
						if (this.schema.includes('tokens-list')) {
							const el = event.target as HTMLElement
							if (
								el?.classList.contains('token') &&
								Math.abs(el.getBoundingClientRect().right - 10 - event.x) < 6 &&
								Math.abs(el.getBoundingClientRect().bottom - 9 - event.y) < 6
							) {
								const pos = view.posAtCoords({ left: event.x, top: event.y })
								if (pos?.pos) {
									const rp = view.state.tr.doc.resolve(pos?.pos)
									this.view?.dispatch(view.state.tr.deleteRange(rp.before(), rp.after()))
								}
							}
						}
					},
				},
				dispatchTransaction: (tro) => {
					const tr = this.schema === 'measure' ? measureTransactionMapper(tro) : tro
					console.log(`Setting selection to ${tr.selection.from} - ${tr.selection.to}`)
					this.view && this.view.updateState(this.view.state.apply(tr))
					if (this.view && tr.doc != tr.before && this.handleValueChanged) {
						this.trToSave = tr
						setTimeout(() => {
							// eslint-disable-next-line max-len
							if (this.trToSave === tr) {
								this.updateValue(tr)
							}
						}, 10000)
					}
				},
				editable: () => {
					return !this.readonly
				},
			})
		}
	}

	private makeParser(schemaName: string, pms: Schema) {
		const tokenizer = MarkdownIt('commonmark', { html: false })
		return schemaName.includes('tokens-list')
			? {
					parse: (value: PrimitiveType, id?: string) => {
						return pms.node('token', { id }, value.value ? [pms.text((value as StringType).value)] : [])
					},
			  }
			: schemaName.includes('items-list')
			? {
					parse: (value: PrimitiveType, id?: string) => {
						return pms.node('item', { id }, value.value ? [pms.text((value as StringType).value)] : [])
					},
			  }
			: schemaName === 'date'
			? {
					parse: (value: PrimitiveType, id?: string) => {
						if (value?.type === 'datetime') {
							const dateString = anyDateToDate(value.value)?.toISOString().replace(/T.*/, '')
							return pms.node('paragraph', {}, [pms.node('date', {}, value ? [pms.text(dateString ?? '')] : [])])
						} else if (value?.type === 'timestamp') {
							const dateString = new Date(value.value)?.toISOString().replace(/T.*/, '')
							return pms.node('paragraph', {}, [pms.node('date', {}, value ? [pms.text(dateString ?? '')] : [])])
						}
						return undefined
					},
			  }
			: schemaName === 'time'
			? {
					parse: (value: PrimitiveType, id?: string) => {
						const time =
							value.type === 'number'
								? pms.node('paragraph', {}, [
										pms.node(
											'time',
											{},
											value
												? [
														pms.text(
															('00' + Math.floor(value.value / 10000)).slice(-2) +
																':' +
																('00' + Math.floor((value.value / 100) % 100)).slice(-2) +
																':' +
																('00' + (value.value % 100)).slice(-2),
														),
												  ]
												: [],
										),
								  ])
								: value.type === 'datetime'
								? pms.node('paragraph', {}, [
										pms.node(
											'time',
											{},
											value
												? [
														pms.text(
															('00' + Math.floor(value.value / 10000)).slice(-2) +
																':' +
																('00' + Math.floor((value.value / 100) % 100)).slice(-2) +
																':' +
																('00' + (value.value % 100)).slice(-2),
														),
												  ]
												: [],
										),
								  ])
								: undefined
						console.log(`Parsing time ${value.value} to: ${time}`)
						return time
					},
			  }
			: schemaName === 'measure'
			? {
					parse: (value: PrimitiveType, id?: string) => {
						if (value.type !== 'measure') {
							return undefined
						}

						const decimal = value.value?.toString() ?? ''
						const unit = value.unit

						return pms.node(
							'paragraph',
							{},
							[pms.node('decimal', {}, decimal && decimal.length ? [pms.text(decimal)] : [])].concat(unit && unit.length ? [pms.node('unit', {}, [pms.text(unit)])] : []),
						)
					},
			  }
			: schemaName === 'decimal'
			? {
					parse: (value: PrimitiveType, id?: string) => {
						return value.type === 'number' ? pms.node('paragraph', {}, [pms.node('decimal', {}, [pms.text(value.value.toString())])]) : undefined
					},
			  }
			: schemaName === 'date-time'
			? {
					parse: (value: PrimitiveType, id?: string) => {
						if (value.type !== 'datetime') {
							return undefined
						}
						const date = anyDateToDate(value.value)?.toISOString().replace(/T.*/, '')
						const time = anyDateToDate(value.value)
							?.toISOString()
							.replace(/.+?T(..):(..).*/, '$1:$2')

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

	private makeSerializer(schemaName: string, pms: Schema) {
		return schemaName === 'text-document'
			? {
					serialize: (content: ProsemirrorNode) => defaultMarkdownSerializer.serialize(preprocessEmptyNodes(content, pms)),
			  }
			: {
					serialize: (content: ProsemirrorNode) => content.textBetween(0, content.nodeSize - 2, ' '),
			  }
	}

	private makeCodesExtractor(schemaName: string): (doc?: ProsemirrorNode) => Code[] {
		return schemaName === 'measure'
			? (doc?: ProsemirrorNode) => {
					const unit = (doc?.childCount ?? 0) > 1 ? doc?.child(1)?.textContent : undefined
					return unit ? [{ id: `CD-UNIT|${unit}|1`, label: { [this.selectedLanguage ?? this.defaultLanguage ?? 'en']: unit } }] : []
			  }
			: schemaName === 'measure'
			? (doc?: ProsemirrorNode) => {
					const unit = doc?.child(1)?.textContent
					return unit ? [{ id: `CD-UNIT|${unit}|1`, label: { [this.selectedLanguage ?? this.defaultLanguage ?? 'en']: unit } }] : []
			  }
			: () => []
	}

	private makePrimitiveExtractor(schemaName: string): (doc?: ProsemirrorNode) => PrimitiveType | undefined {
		return schemaName === 'date'
			? (doc?: ProsemirrorNode) =>
					doc?.firstChild?.textContent ? { type: 'datetime', value: parseInt(format(parse(doc.firstChild.textContent, 'dd/MM/yyyy', new Date()), 'yyyyMMdd')) } : undefined
			: schemaName === 'time'
			? (doc?: ProsemirrorNode) => {
					if (doc?.firstChild?.textContent && !doc.firstChild.textContent.startsWith('--:')) {
						const value = parseInt(format(parse(doc.firstChild.textContent.replaceAll('-', '0'), 'HH:mm:ss', new Date()), 'HHmmss'))
						console.log(`Converted time to: ${value}`)
						return {
							type: 'datetime',
							value: value,
						}
					} else {
						return undefined
					}
			  }
			: schemaName === 'measure'
			? (doc?: ProsemirrorNode) => ({
					type: 'measure',
					value: (() => {
						if (doc?.firstChild?.textContent?.length) {
							const parsed = parseFloat(doc.firstChild.textContent.replaceAll(',', '.'))
							return isNaN(parsed) ? undefined : parsed
						} else {
							return undefined
						}
					})(),
					unit: (doc?.childCount ?? 0) > 1 ? doc?.child(1)?.textContent : undefined,
			  })
			: schemaName === 'decimal'
			? (doc?: ProsemirrorNode) => (doc?.firstChild?.textContent?.length ? { type: 'number', value: parseFloat(doc.firstChild.textContent.replace(/,/g, '.')) } : undefined)
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

	private makePrimitivesExtractor(schemaName: string): (doc?: ProsemirrorNode) => [string, PrimitiveType][] {
		return schemaName.includes('tokens-list') || schemaName.includes('items-list')
			? (doc?: ProsemirrorNode) =>
					doc?.childCount
						? [...Array(doc.childCount).keys()].map((idx) => {
								const child = doc.child(idx)
								const id = child.attrs.id ?? ''
								return [id, { type: 'string', value: this.serializer.serialize(child) }]
						  })
						: []
			: () => []
	}
}

// Register the new element with the browser.
