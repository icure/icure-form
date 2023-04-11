import { CSSResultGroup, html, LitElement, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'

// @ts-ignore
import baseCss from '../iqr-text-field/styles/style.scss'
// @ts-ignore
import kendoCss from '../iqr-text-field/styles/kendo.scss'
import { VersionedValue } from '../iqr-text-field'
import { versionPicto } from '../iqr-text-field/styles/paths'
import { CodeStub, Content } from '@icure/api'
import { OptionCode } from '../common'

class IqrDropdownField extends LitElement {
	@property() options?: (OptionCode | CodeStub)[] = []

	@property() placeholder = ''

	@property() valueProvider?: () => VersionedValue | undefined = undefined

	@property({ type: String }) codifications = ''

	@property({ type: String }) value = ''

	@property() label = ''
	@property() labelPosition: 'float' | 'side' | 'above' | 'hidden' = 'float'

	@state() protected displayMenu = false

	@state() protected inputValue = ''

	@property() handleValueChanged?: (id: string | undefined, language: string, value: { asString: string; content?: Content }, codes: CodeStub) => void = undefined

	static get styles(): CSSResultGroup[] {
		return [baseCss]
	}

	togglePopup(): void {
		this.displayMenu = !this.displayMenu
	}

	handleOptionButtonClicked(id: string | undefined): (e: Event) => boolean {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			if (id) {
				const option = (this.options || []).find((option) => option.id === id)
				this.value = id
				this.inputValue = (!(option instanceof CodeStub) ? option?.text : option?.label?.['fr']) ?? ''
				this.displayMenu = false
				//this.handleValueChanged()
				return true
			}
			return false
		}
	}

	render(): TemplateResult {
		return html`
			<div id="root" class="iqr-text-field ${this.inputValue != '' ? 'has-content' : ''}" data-placeholder=${this.placeholder}>
				<label class="iqr-label ${this.labelPosition}"><span>${this.label}</span></label>
				<div class="iqr-input" @click="${this.togglePopup}">
					<div id="editor">${this.inputValue}</div>
					<div id="extra" class=${'extra forced'}>
						<div class="buttons-container">
							<div class="menu-container">
								<button class="btn menu-trigger">${versionPicto}</button>
								${this.displayMenu
									? html`
											<div id="menu" class="menu">
												${this.options?.map(
													(x) =>
														html`<button @click="${this.handleOptionButtonClicked(x.id)}" id="${x.id}" class="item">
															${!(x instanceof CodeStub) ? x?.text : x?.label?.['fr']}
														</button>`,
												)}
											</div>
									  `
									: ''}
							</div>
						</div>
					</div>
				</div>
			</div>
		`
	}

	public async firstUpdated(): Promise<void> {
		const providedValue = this.valueProvider && this.valueProvider()
		const displayedVersionedValue = providedValue?.versions?.find((version) => version.value)?.value
		if (displayedVersionedValue && Object.keys(displayedVersionedValue)?.length) {
			this.inputValue = displayedVersionedValue[Object.keys(displayedVersionedValue)[0]]
			this.value =
				this.options?.find((option) => {
					return !(option instanceof CodeStub) ? option.text === this.inputValue : option?.label?.['fr'] === this.inputValue
				})?.id ?? ''
		}
		return
	}
}

customElements.define('iqr-dropdown-field', IqrDropdownField)

export class IqrDropdownFieldKendo extends IqrDropdownField {
	static get styles(): CSSResultGroup[] {
		return [...IqrDropdownField.styles, kendoCss]
	}
}
customElements.define('iqr-dropdown-field-kendo', IqrDropdownFieldKendo)
