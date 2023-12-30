import { html, nothing, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { CodeStub, Content } from '@icure/api'
import { dropdownPicto } from '../icure-text-field/styles/paths'
import { Field } from '../common'
import { Code, Trigger } from '../model'
import { generateLabels } from '../common/utils'

export class IcureDropdownField extends Field {
	@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]> = async () => []

	@state() protected displayMenu = false
	@state() protected inputValue = ''

	togglePopup(): void {
		if (this.readonly) return
		this.displayMenu = !this.displayMenu
	}

	handleOptionButtonClicked(id: string | undefined): (e: Event) => boolean {
		return (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			if (id) {
				const option = this.opionsPro
				const code = !Boolean(option?.['text'])
					? option
					: new CodeStub({
							id: (this.codifications?.length ? this.codifications[0] + '|' : 'CUSTOM_OPTION|') + id + '|1',
							type: this.codifications?.length ? this.codifications[0] : 'CUSTOM_OPTION',
							code: id,
							version: '1',
					  })
				this.value = id
				this.inputValue =
					(this.translate
						? option?.['translatedText']
						: Boolean(option?.['text'])
						? option?.['text']
						: option?.['label']?.[this.defaultLanguage || 'en'] || option?.['label']?.[this.displayedLanguage || 'en']) ?? ''
				this.displayMenu = false
				if (this.handleValueChanged) {
					this.containerId = this.handleValueChanged?.(
						this.displayedLanguage || this.defaultLanguage || 'en',
						{
							asString: this.inputValue,
							content: new Content({
								stringValue: this.inputValue || '',
							}),
						},
						this.containerId,
						code ? [code] : [],
					)
				}
				if (this.actionManager) {
					this.actionManager.launchActions(Trigger.CHANGE, this.label || '', { value: this.inputValue, id: this.value, codes: [code], options: this.options || [] })
				}
				return true
			}
			return false
		}
	}

	render(): TemplateResult {
		if (!this.visible) {
			return html``
		}

		return html`
			<div id="root" class="icure-text-field ${this.inputValue != '' ? 'has-content' : ''}" data-placeholder=${this.placeholder}>
				${this.displayedLabels ? generateLabels(this.displayedLabels, this.translationProvider) : nothing}
				<div class="icure-input" @click="${this.togglePopup}" id="test">
					<div id="editor">${this.inputValue}</div>
					<div id="extra" class=${'extra forced'}>
						<button class="btn select-arrow">${dropdownPicto}</button>
						${this.displayMenu
							? html`
									<div id="menu" class="options">
										${(this.translate ? this.translatedOptions : this.options)?.map(
											(x) =>
												html`<button @click="${this.handleOptionButtonClicked(x.id)}" id="${x.id}" class="option">
													${this.translate
														? x?.['translatedText'] || ''
														: Boolean(x?.['text'])
														? x?.['text'] || ''
														: x?.['label']?.[this.defaultLanguage || 'en'] || x?.['label']?.[this.displayedLanguage || 'en'] || ''}
												</button>`,
										)}
									</div>
							  `
							: ''}
					</div>
				</div>
			</div>
		`
	}

	public async firstUpdated(): Promise<void> {
		this.registerStateUpdater(this.label || '')
		document.addEventListener('click', (event) => {
			if (!event.composedPath().includes(this)) {
				this.displayMenu = false
				event.stopPropagation()
			}
		})
		let providedValue = this.valueProvider && this.valueProvider()
		if (!providedValue) {
			providedValue = { id: '', versions: [] }
		}
		const displayedVersionedValue = providedValue?.versions?.find((version) => version.value)?.value
		this.containerId = providedValue?.id
		if (displayedVersionedValue && Object.keys(displayedVersionedValue)?.length) {
			this.inputValue = displayedVersionedValue[Object.keys(displayedVersionedValue)[0]]
			this.value =
				(this.translate ? this.translatedOptions : this.options)?.find((option) => {
					return this.translate
						? option?.['translatedText'] === this.inputValue
						: Boolean(option?.['text'])
						? (option?.['text'] || '') === this.inputValue
						: (option?.['label']?.[this.defaultLanguage || 'en'] || option?.['label']?.[this.displayedLanguage || 'en'] || '') === this.inputValue
				})?.id ?? ''
		} else if (this.value) {
			const option = (this.translate ? this.translatedOptions : this.options)?.find((option) => option.id === this.value)
			if (option) {
				this.inputValue = this.translate ? option?.['translatedText'] || '' : option?.['text'] || ''
			} else {
				this.inputValue = this.value
				this.value =
					(this.translate ? this.translatedOptions : this.options)?.find((option) => {
						return this.translate
							? option?.['translatedText'] === this.inputValue
							: Boolean(option?.['text'])
							? (option?.['text'] || '') === this.inputValue
							: (option?.['label']?.[this.defaultLanguage || 'en'] || option?.['label']?.[this.displayedLanguage || 'en'] || '') === this.inputValue
					})?.id ?? ''
			}
		}
		this.actionManager?.defaultSandbox.set(this.label || '', {
			value: this.inputValue,
			content: new Content({
				stringValue: this.inputValue || '',
			}),
			options: this.options || [],
			id: this.value,
		})
		if (this.value && this.handleValueChanged && this.inputValue) {
			this.containerId = this.handleValueChanged?.(
				this.displayedLanguage || this.defaultLanguage || 'en',
				{
					asString: this.inputValue,
					content: new Content({
						stringValue: this.inputValue || '',
					}),
				},
				this.containerId,
				[
					this.options?.find((option) => !Boolean(option?.['text']) && option.id === this.value) ??
						new CodeStub({
							id: (this.codifications?.length ? this.codifications[0] + '|' : 'CUSTOM_OPTION|') + this.value + '|1',
							type: this.codifications?.length ? this.codifications[0] : 'CUSTOM_OPTION',
							code: this.value,
							version: '1',
						}),
				],
			)
		}
	}
}

customElements.define('icure-dropdown-field', IcureDropdownField)
