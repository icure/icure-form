import { CSSResultGroup, html, nothing, TemplateResult } from 'lit'
import { generateLabels } from '../common/utils'
import { property, state } from 'lit/decorators.js'
import 'app-datepicker'
import { CustomEventDetail } from 'app-datepicker/dist/typings'
import { MAX_DATE } from 'app-datepicker/dist/constants'
import { toResolvedDate } from 'app-datepicker/dist/helpers/to-resolved-date'
import { Field } from '../common'
import { datePicto } from '../common/styles/paths'
import { extractSingleValue } from '../icure-form/fields/utils'
import { format } from 'date-fns'
import { anyDateToDate } from '../../utils/icure-utils'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
// @ts-ignore
import kendoCss from '../common/styles/kendo.scss'

export class IcureDatePickerField extends Field {
	//TODO: support different date formats
	@property() placeholder = ''

	@state() protected displayDatePicker = false

	static get styles(): CSSResultGroup[] {
		return [baseCss, kendoCss]
	}

	_handleClickOutside(event: MouseEvent): void {
		if (!event.composedPath().includes(this)) {
			this.displayDatePicker = false
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

	getValueFromProvider(): string | undefined {
		const [, versions] = extractSingleValue(this.valueProvider?.())
		if (versions) {
			const valueForLanguage = versions[0]?.value?.content?.[this.language()] ?? ''
			if (valueForLanguage && (valueForLanguage.type === 'timestamp' || valueForLanguage.type === 'datetime') && valueForLanguage.value) {
				const date = anyDateToDate(valueForLanguage.value)
				return date ? format(date, 'dd/MM/yyyy') : ''
			}
		}
		return undefined
	}

	render(): TemplateResult {
		if (!this.visible) {
			return html``
		}

		const value = this.getValueFromProvider()

		return html` <div id="root" class="icure-text-field ${value && value != '' ? 'has-content' : ''}" data-placeholder="${this.placeholder}">
			${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined) : nothing}
			<div class="icure-input" @click="${this.togglePopup}" id="test">
				<div id="editor">${value}</div>
				<div id="extra" class=${'extra forced'}>
					<button class="btn select-arrow">${datePicto}</button>
					${this.displayDatePicker
						? html`<div id="menu" class="date-picker" @click="${(event: Event) => event.stopPropagation()}">
								<app-date-picker
									locale="${this.displayedLanguage || this.defaultLanguage || 'en'}"
									style=""
									max="${MAX_DATE}"
									min="${toResolvedDate('1900-01-01')}"
									@date-updated="${this.dateUpdated}"
								></app-date-picker>
						  </div>`
						: ''}
				</div>
			</div>
		</div>`
	}

	public dateUpdated(date: CustomEventDetail['date-updated']): void {
		const parts = date.detail.value?.split('-')
		if (parts && parts.length === 3) {
			const fuzzyDateValue = parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2])

			const [valueId] = this.getValueFromProvider() ?? ''
			this.handleValueChanged?.(
				this.label,
				this.language(),
				{
					content: { [this.language()]: { type: 'timestamp', value: fuzzyDateValue } },
				},
				valueId,
			)
		}
	}

	public togglePopup(): void {
		if (this.readonly && !this.displayDatePicker) {
			return
		}
		this.displayDatePicker = !this.displayDatePicker
	}
}

customElements.define('icure-date-picker-field', IcureDatePickerField)
