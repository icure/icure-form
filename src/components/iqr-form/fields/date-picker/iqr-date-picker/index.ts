import { ValuedField } from '../../../../common/valuedField'
import { VersionedValue } from '../../text-field/iqr-text-field'
import { html, TemplateResult } from 'lit'
import { generateLabel } from '../../label/iqr-label/utils'
import { state } from 'lit/decorators.js'
import { datePicto } from '../../text-field/iqr-text-field/styles/paths'
import 'app-datepicker'
import { CustomEventDetail } from 'app-datepicker/dist/typings'
import { Content } from '@icure/api'
import { MAX_DATE } from 'app-datepicker/dist/constants'
import { toResolvedDate } from 'app-datepicker/dist/helpers/to-resolved-date'
import { Trigger } from '../../../model'

export class IqrDatePickerField extends ValuedField<string, VersionedValue> {
	@state() protected displayDatePicker = false
	@state() protected inputValue = ''

	render(): TemplateResult {
		if (!this.display) {
			return html``
		}
		return html`
			<div id="root" class="iqr-text-field ${this.inputValue != '' ? 'has-content' : ''}" data-placeholder=${this.placeholder}>
				${generateLabel(this.label ?? '', this.labelPosition ?? 'float', this.translationProvider)}
				<div class="iqr-input" @click="${this.togglePopup}" id="test">
					<div id="editor">${this.inputValue}</div>
					<div id="extra" class=${'extra forced'}>
						<button class="btn select-arrow">${datePicto}</button>
						${this.displayDatePicker
							? html`<div id="menu" class="date-picker" @click="${(event: Event) => event.stopPropagation()}">
									<app-date-picker
										locale="${this.displayedLanguage || this.defaultLanguage || 'en'}"
										style=""
										max="${MAX_DATE}"
										min="${toResolvedDate('1970-01-01')}"
										@date-updated="${this.dateUpdated}"
									></app-date-picker>
							  </div>`
							: ''}
					</div>
				</div>
			</div>
		`
	}
	public firstUpdated(): void {
		this.registerStateUpdater(this.label || '')

		let providedValue = this.valueProvider && this.valueProvider()
		if (!providedValue) {
			providedValue = { id: '', versions: [] }
		}
		const displayedVersionedValue = providedValue?.versions?.find((version) => version.value)?.value
		this.containerId = providedValue?.id
		if (displayedVersionedValue && Object.keys(displayedVersionedValue)?.length) {
			this.inputValue = this.formatDate(displayedVersionedValue[Object.keys(displayedVersionedValue)[0]])
			this.value = this.value || this.inputValue.split('/').reduce((acc, x) => x + '' + acc, '')
		} else if (this.value) {
			this.inputValue = this.value
		}
		this.actionManager?.defaultSandbox.set(this.label || '', {
			value: this.value,
			content: new Content({
				fuzzyDateValue: this.inputValue.split('/').reduce((acc, x) => x + '' + acc, ''),
			}),
			fuzzyDate: this.inputValue.split('/').reduce((acc, x) => x + '' + acc, ''),
		})
		if (this.value && this.handleValueChanged && this.inputValue) {
			this.containerId = this.handleValueChanged?.(
				this.displayedLanguage || this.defaultLanguage || 'en',
				{
					asString: this.inputValue,
					content: new Content({
						fuzzyDateValue: this.inputValue.split('/').reduce((acc, x) => x + '' + acc, ''),
					}),
				},
				this.containerId,
				[],
			)
		}
	}

	public dateUpdated(date: CustomEventDetail['date-updated']): void {
		this.inputValue = date.detail.value?.split('-').reverse().join('/') ?? ''
		const fuzzyDateValue: string = this.inputValue.split('/').reduce((acc, x) => x + '' + acc, '')
		this.containerId = this.handleValueChanged?.(
			this.displayedLanguage || this.defaultLanguage || 'en',
			{
				asString: this.inputValue,
				content: new Content({
					fuzzyDateValue: fuzzyDateValue,
				}),
			},
			this.containerId,
			[],
		)
		if (this.actionManager) {
			this.actionManager.launchActions(Trigger.CHANGE, this.label || '', { value: this.inputValue, fuzzyDateValue: fuzzyDateValue })
		}
		this.togglePopup()
	}

	public togglePopup(): void {
		if (!this.editable) {
			return
		}
		this.displayDatePicker = !this.displayDatePicker
	}

	private formatDate(inputDate: string) {
		const day = inputDate.substring(0, 2)
		const month = inputDate.substring(2, 4)
		const year = inputDate.substring(4, 8)
		return `${day}/${month}/${year}`
	}
}

customElements.define('iqr-date-picker-field', IqrDatePickerField)
