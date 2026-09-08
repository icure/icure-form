import { CSSResultGroup, html, nothing, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { chevronPicto, dropdownPicto } from '../common/styles/paths'
import { Field } from '../common'
import { generateLabels } from '../common/utils'
import { extractSingleValue } from '../icure-form/fields/utils'
import { FieldWithOptionsMixin } from '../common/field-with-options'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { icureFormLogging } from '../../index'
import { FieldMetadata } from '../model'
import { Suggestion } from '../../generic'
import { emptyTreeState, nodeAtPath, reveal, SuggestionRow, toggleExpanded, TreePath, TreeUiState, visibleRows } from '../../utils/suggestion-tree'

type NodeRow = Extract<SuggestionRow, { kind: 'node' }>

export class IcureDropdownField extends FieldWithOptionsMixin(Field) {
	// A dropdown's options provider answers with Suggestions, possibly hierarchical (see src/utils/suggestion-tree.ts).
	// Narrow the mixin's Code typing so the tree is typed end to end without touching radio and checkbox.
	declare optionsProvider: (language: string, terms?: string[]) => Promise<Suggestion[]>
	declare displayedOptions: Suggestion[]

	@property() placeholder = ''

	@state() protected displayMenu = false
	@state() protected textInputValue?: string = undefined
	// Manual chevron toggles and "N more" reveals. Reset whenever the search text changes or an option is selected.
	@state() protected treeState: TreeUiState = emptyTreeState()

	static get styles(): CSSResultGroup[] {
		return [baseCss]
	}

	togglePopup(event: MouseEvent, force = false): void {
		if (this.readonly) return
		this.displayMenu = force || !this.displayMenu
		console.log('togglePopup', this.textInputValue)
	}

	_handleClickOutside(event: MouseEvent): void {
		if (!event.composedPath().includes(this)) {
			if (this.displayMenu) {
				console.log(this.label)
				this.displayMenu = false
			}
			event.stopPropagation()
		}
	}

	connectedCallback() {
		super.connectedCallback()
		document.addEventListener('click', this._handleClickOutside.bind(this))
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		document.removeEventListener('click', this._handleClickOutside.bind(this))
	}

	textInputChanged(): (e: Event) => void {
		return (e: Event) => {
			const target = e.target as HTMLInputElement
			const textInputValue = target.value
			this.textInputValue = textInputValue
			this.treeState = emptyTreeState()
			this.triggerSearch(textInputValue)
		}
	}

	private triggerSearch(textInputValue: string | undefined, cooldown = 500) {
		setTimeout(() => {
			if (textInputValue === this.textInputValue) {
				this.optionsProvider?.(this.language(), textInputValue ? [textInputValue] : []).then((options) => {
					if (textInputValue === this.textInputValue) {
						this.displayedOptions = options
					}
				})
			}
		}, cooldown)
	}

	handleOptionClicked(path: TreePath): (e: Event) => boolean {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			const node = nodeAtPath(this.displayedOptions ?? [], path)
			if (!node) return false
			const [valueId] = this.getValueFromProvider() ?? ''
			const language = this.language()
			// Store the node exactly as a flat provider would have produced it: never persist the subtree or the marker.
			const code: Suggestion = { ...node }
			delete code.children
			delete code.matched
			const inputValue = node.label?.[language] ?? ''
			this.displayMenu = false
			this.textInputValue = undefined
			this.treeState = emptyTreeState()
			this.handleValueChanged?.(
				this.label,
				language,
				{
					content: { [language]: { type: 'string', value: inputValue } },
					codes: [code],
				},
				valueId,
			)
			this.triggerSearch(undefined, 0)
			return true
		}
	}

	handleChevronClicked(row: NodeRow): (e: Event) => void {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			this.treeState = toggleExpanded(this.treeState, row.path, row.expanded)
		}
	}

	handleMoreClicked(path: TreePath): (e: Event) => void {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			this.treeState = reveal(this.treeState, path)
		}
	}

	getValueFromProvider(): [string, string] | [undefined, undefined] {
		const [id, versions] = extractSingleValue(this.valueProvider?.())
		if (versions) {
			const value = versions[0]?.value
			const valueForLanguage = value?.content?.[this.language()] ?? ''
			if (valueForLanguage && valueForLanguage.type === 'string' && valueForLanguage.value) {
				return [id, valueForLanguage.value]
			} else if (value?.codes?.length) {
				return [id, value?.codes?.[0]?.label?.[this.language()] ?? '']
			}
		}
		return [undefined, undefined]
	}

	/**
	 * One popover row. A flat option (no children, depth 0) renders exactly the markup used before hierarchy existed.
	 * Nodes with children, or any row below the root level, get a wrapper with a chevron (or a spacer) in front of the
	 * option button; an "N more" row reveals the siblings hidden by the match markers.
	 */
	private renderRow(row: SuggestionRow, inputValue: string | undefined, language: string): TemplateResult {
		if (row.kind === 'more') {
			return html`<button class="option option--more" style="--depth: ${row.depth}" @click="${this.handleMoreClicked(row.path)}">
				… ${row.count} ${this.translationProvider?.(language, 'more') ?? 'more'}
			</button>`
		}
		const x = row.suggestion
		const option = html`<button @click="${this.handleOptionClicked(row.path)}" id="${x.id}" class="option ${x?.['label']?.[language] === inputValue ? 'selected' : ''}">
			${x?.['label']?.[language] || ''}
		</button>`
		if (!row.hasChildren && row.depth === 0) {
			return option
		}
		return html`<div class="option-row" style="--depth: ${row.depth}" aria-level="${row.depth + 1}">
			${row.hasChildren
				? html`<button class="chevron" aria-expanded="${row.expanded}" aria-label="${row.expanded ? 'Collapse' : 'Expand'}" @click="${this.handleChevronClicked(row)}">${chevronPicto}</button>`
				: html`<span class="chevron chevron--spacer"></span>`}
			${option}
		</div>`
	}

	override renderSync({ validationErrors }: { validationErrors: [FieldMetadata, string][] }): TemplateResult {
		if (!this.visible) {
			return html``
		}

		if (icureFormLogging) {
			console.log(`Rendering dropdown ${this.label}`)
		}

		const [, inputValue] = this.getValueFromProvider() ?? ''
		const validationError = validationErrors.length
		const language = this.language()
		const rows = this.displayMenu ? visibleRows(this.displayedOptions ?? [], !!this.textInputValue?.trim(), this.treeState) : []

		return html`
			<div id="root" class="icure-text-field ${inputValue != '' ? 'has-content' : ''}" data-placeholder=${this.placeholder}>
				${this.displayedLabels ? generateLabels(this.displayedLabels, language, this.translate ? this.translationProvider : undefined) : nothing}
				<div class="icure-input ${validationError && 'icure-input__validationError'}" id="test" @click="${(event: MouseEvent) => this.togglePopup(event, true)}">
					<input type="text" id="editor" style="outline: none" .value=${this.textInputValue ?? inputValue ?? ''} @input="${this.textInputChanged()}" autocomplete="off" />
					<div id="extra" class=${'extra forced'}>
						<button class="btn select-arrow" @click="${this.togglePopup}">${dropdownPicto}</button>
						${this.displayMenu ? html` <div id="menu" class="options">${rows.map((row) => this.renderRow(row, inputValue, language))}</div>` : ''}
					</div>
				</div>
				<div class="error">${validationErrors.map(([, error]) => html`<div>${this.translationProvider?.(language, error) ?? error}</div>`)}</div>
			</div>
		`
	}
}
