import { CSSResultGroup, html, nothing, PropertyValues, TemplateResult } from 'lit'
import { generateLabels } from '../common/utils'
import { property, state } from 'lit/decorators.js'
import '@icure/motss-app-datepicker'
import { CustomEventDetail } from '@icure/motss-app-datepicker/dist/typings.js'
import { MAX_DATE } from '@icure/motss-app-datepicker/dist/constants.js'
import { toResolvedDate } from '@icure/motss-app-datepicker/dist/helpers/to-resolved-date.js'
import { Field } from '../common'
import { datePicto } from '../common/styles/paths'
import { extractSingleValue } from '../icure-form/fields/utils'
import { format } from 'date-fns'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { anyDateToDate } from '../../utils/dates'
import { icureFormLogging } from '../../index'
import { FieldMetadata } from '../model'

const isConfirmKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' '

/** The enabled calendar day an event comes from, if any. `calendar-day` is one of the parts the calendar exports. */
const pickedDay = (event: Event): HTMLElement | undefined => {
	const day = event.composedPath().find((el) => (el as HTMLElement).classList?.contains('calendar-day')) as HTMLElement | undefined
	return day && day.getAttribute('aria-disabled') !== 'true' && day.getAttribute('aria-hidden') !== 'true' ? day : undefined
}

export class IcureDatePickerField extends Field {
	//TODO: support different date formats
	@property() placeholder = ''

	@state() protected displayDatePicker = false

	static get styles(): CSSResultGroup[] {
		return [baseCss]
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
			const content = versions[0]?.value?.content
			const valueForLanguage = content?.[this.language()] ?? content?.[this.defaultLanguage] ?? content?.['*'] ?? content?.[Object.keys(content)[0]]
			if (valueForLanguage && (valueForLanguage.type === 'timestamp' || valueForLanguage.type === 'datetime') && valueForLanguage.value) {
				const date = anyDateToDate(valueForLanguage.value)
				return date ? format(date, 'dd/MM/yyyy') : ''
			}
		}
		return undefined
	}

	override renderSync({ validationErrors }: { validationErrors: [FieldMetadata, string][] }): TemplateResult {
		if (!this.visible) {
			return html``
		}

		if (icureFormLogging) {
			console.log(`Rendering dat epicker ${this.label}`)
		}

		const value = this.getValueFromProvider()
		const validationError = validationErrors.length

		const labelledBy = this.displayedLabels && Object.keys(this.displayedLabels).length ? this.labelId : undefined

		// ARIA combobox whose popup is the calendar dialog. Every id referenced here lives in this component's shadow root.
		return html` <div id="root" class="icure-text-field ${value && value != '' ? 'has-content' : ''}" data-placeholder="${this.placeholder}" @keydown="${this.keydownListener}">
			${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined, this.labelId) : nothing}
			<div class="icure-input ${validationError && 'icure-input__validationError'}" @click="${this.togglePopup}" id="test">
				<div
					id="editor"
					role="combobox"
					tabindex="0"
					aria-labelledby="${labelledBy ?? nothing}"
					aria-haspopup="dialog"
					aria-expanded="${this.displayDatePicker}"
					aria-controls="${this.displayDatePicker ? 'menu' : nothing}"
					aria-required="${this.required ? 'true' : nothing}"
					aria-invalid="${validationError ? 'true' : nothing}"
					aria-describedby="${validationError ? 'errors' : nothing}"
					aria-readonly="${this.readonly ? 'true' : nothing}"
				>
					${value}
				</div>
				<div id="extra" class=${'extra forced'}>
					<button type="button" tabindex="-1" class="btn select-arrow" aria-label="${this.translationProvider?.(this.language(), 'Choose date') ?? 'Choose date'}">${datePicto}</button>
					${this.displayDatePicker
						? html`<div
								id="menu"
								class="date-picker"
								popover="manual"
								role="dialog"
								aria-labelledby="${labelledBy ?? nothing}"
								@click="${(event: Event) => {
									event.stopPropagation()
									this.closeIfDayPicked(event)
								}}"
								@keyup="${this.handleKeyup}"
						  >
								<app-date-picker
									locale="${this.selectedLanguage ?? this.defaultLanguage ?? 'en'}"
									style=""
									max="${MAX_DATE}"
									min="${toResolvedDate('1900-01-01')}"
									@date-updated="${this.dateUpdated}"
									@first-updated="${this.focusCalendar}"
								></app-date-picker>
						  </div>`
						: ''}
				</div>
			</div>
			<div id="errors" class="error">${validationErrors.map(([, error]) => html`<div>${this.translationProvider?.(this.language(), error) ?? error}</div>`)}</div>
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
					content: { [this.language()]: { type: 'datetime', value: fuzzyDateValue } },
				},
				valueId,
			)
		}
	}

	/**
	 * Combobox keys: Enter, Space and Alt+ArrowDown open the calendar; Escape, from the combobox or from inside the
	 * calendar, closes it and gives the focus back to the combobox. Listens in the capture phase because the calendar
	 * stops the propagation of the keydown events it receives.
	 */
	private keydownListener = { handleEvent: (event: KeyboardEvent) => this.handleKeydown(event), capture: true }

	private handleKeydown(event: KeyboardEvent): void {
		this.confirmKeyDownOnDay = isConfirmKey(event) && !!pickedDay(event)
		const fromCombobox = event.composedPath()[0] === this.shadowRoot?.getElementById('editor')
		if (event.key === 'Escape' && this.displayDatePicker) {
			event.preventDefault()
			event.stopPropagation()
			this.displayDatePicker = false
			;(this.shadowRoot?.getElementById('editor') as HTMLElement | null)?.focus()
		} else if (fromCombobox && !this.displayDatePicker && (isConfirmKey(event) || (event.altKey && event.key === 'ArrowDown'))) {
			event.preventDefault()
			this.togglePopup()
		}
	}

	/**
	 * Closes the calendar and gives the focus back to the combobox once a day has been picked, by a click or by Enter /
	 * Space on it: the calendar has already reported the date by then. Arrow-key navigation, which also reports dates,
	 * happens on keydown and leaves the calendar open.
	 */
	private closeIfDayPicked(event: Event): void {
		if (pickedDay(event)) {
			this.displayDatePicker = false
			;(this.shadowRoot?.getElementById('editor') as HTMLElement | null)?.focus()
		}
	}

	/**
	 * Only a confirm key pressed *and* released on a day picks it: the keyup of the Enter that opened the calendar
	 * lands on the day the focus has just moved to, and must not close it again.
	 */
	private confirmKeyDownOnDay = false

	private handleKeyup = (event: KeyboardEvent): void => {
		if (isConfirmKey(event) && this.confirmKeyDownOnDay) {
			this.confirmKeyDownOnDay = false
			this.closeIfDayPicked(event)
		}
	}

	/** Moves the focus to the calendar's selected day once it has rendered: the last of the focusable elements it reports. */
	private focusCalendar = (event: CustomEvent<{ focusableElements: HTMLElement[] }>): void => {
		event.detail?.focusableElements?.at(-1)?.focus()
	}

	public togglePopup(): void {
		if (this.readonly && !this.displayDatePicker) {
			return
		}
		this.displayDatePicker = !this.displayDatePicker
	}

	updated(changedProperties: PropertyValues) {
		super.updated(changedProperties)
		// Promote the calendar to the browser top layer so it is not clipped by overflow:hidden/auto
		// ancestors (e.g. the card renderer's fixed-height card). Browsers without the Popover API
		// keep the legacy absolutely-positioned popup.
		const menu = this.shadowRoot?.getElementById('menu') as (HTMLElement & { showPopover?: () => void }) | null
		if (menu?.showPopover && this.displayDatePicker && !menu.matches(':popover-open')) {
			menu.showPopover()
			const anchor = this.shadowRoot?.getElementById('test')
			if (anchor) {
				const a = anchor.getBoundingClientRect()
				const m = menu.getBoundingClientRect()
				const fitsBelow = a.bottom + 6 + m.height <= window.innerHeight
				menu.style.top = `${fitsBelow ? a.bottom + 6 : Math.max(8, a.top - 6 - m.height)}px`
				menu.style.left = `${Math.max(8, Math.min(a.left, window.innerWidth - m.width - 8))}px`
			}
		}
	}
}
