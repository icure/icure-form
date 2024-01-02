import { CSSResultGroup, html, nothing, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { dropdownPicto } from '../common/styles/paths'
import { Field } from '../common'
import { generateLabels } from '../common/utils'
import { extractSingleValue } from '../icure-form/fields/utils'
import { FieldWithOptionsMixin } from '../common/field-with-options'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
// @ts-ignore
import kendoCss from '../common/styles/kendo.scss'

export class IcureDropdownField extends FieldWithOptionsMixin(Field) {
	@property() placeholder = ''

	@state() protected displayMenu = false

	static get styles(): CSSResultGroup[] {
		return [baseCss, kendoCss]
	}

	togglePopup(): void {
		if (this.readonly) return
		this.displayMenu = !this.displayMenu
	}

	_handleClickOutside(event: MouseEvent): void {
		if (!event.composedPath().includes(this)) {
			this.displayMenu = false
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

	handleOptionButtonClicked(id: string | undefined): (e: Event) => boolean {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			const [valueId] = this.getValueFromProvider() ?? ''
			if (id) {
				const code = this.displayedOptions?.find((option) => option.id === id)
				const inputValue = this.displayedOptions?.find((option) => option.id === id)?.['label']?.[this.language()] ?? ''
				this.displayMenu = false
				this.handleValueChanged?.(
					this.label,
					this.language(),
					{
						content: { [this.language()]: { type: 'string', value: inputValue } },
						codes: code ? [code] : [],
					},
					valueId,
				)
				return true
			}
			return false
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

	render(): TemplateResult {
		if (!this.visible) {
			return html``
		}

		const [, inputValue] = this.getValueFromProvider() ?? ''

		return html`
			<div id="root" class="icure-text-field ${inputValue != '' ? 'has-content' : ''}" data-placeholder=${this.placeholder}>
				${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined) : nothing}
				<div class="icure-input" @click="${this.togglePopup}" id="test">
					<div id="editor">${inputValue}</div>
					<div id="extra" class=${'extra forced'}>
						<button class="btn select-arrow">${dropdownPicto}</button>
						${this.displayMenu
							? html`
									<div id="menu" class="options">
										${this.displayedOptions?.map(
											(x) => html`<button @click="${this.handleOptionButtonClicked(x.id)}" id="${x.id}" class="option">${x?.['label']?.[this.language()] || ''}</button>`,
										)}
									</div>
							  `
							: ''}
					</div>
				</div>
			</div>
		`
	}
}

customElements.define('icure-dropdown-field', IcureDropdownField)
