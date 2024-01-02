import { CSSResultGroup, html, nothing, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
// @ts-ignore
import baseCss from './styles/style.scss'
// @ts-ignore
import kendoCss from './styles/kendo.scss'
import { Field } from '../common'
import { generateLabels } from '../common/utils'
import { extractSingleValue } from '../icure-form/fields/utils'
import { FieldWithOptionsMixin } from '../common/field-with-options'

export class IcureButtonGroup extends FieldWithOptionsMixin(Field) {
	@property() type: 'radio' | 'checkbox' = 'radio'

	//override
	static get styles(): CSSResultGroup[] {
		return [baseCss, kendoCss]
	}

	getValueFromProvider(): [string, string[]] | [undefined, undefined] {
		const [id, versions] = extractSingleValue(this.valueProvider?.())
		if (versions) {
			const value = versions[0]?.value
			const valueForLanguage = value?.content?.[this.language()] ?? ''
			const fromValue = valueForLanguage && valueForLanguage.type === 'compound' && valueForLanguage.value ? Object.keys(valueForLanguage.value) : []
			return [id, fromValue.concat(value?.codes?.map((c) => c.id)?.filter((id) => !fromValue.includes(id)) ?? [])]
		}
		return [undefined, undefined]
	}

	public checkboxChange() {
		if (this.readonly) return
		if (this.handleValueChanged) {
			const [valueId] = this.getValueFromProvider() ?? ''
			const inputs = Array.from(this.shadowRoot?.querySelectorAll('input') || []).filter((input) => input.checked)
			const selectedOptions = this.displayedOptions?.filter((option) => inputs.some((i) => i.id === option.id))
			this.handleValueChanged?.(
				this.label,
				this.language(),
				{
					content: {
						[this.language()]: {
							type: 'compound',
							value: selectedOptions?.reduce(
								(acc, c) => ({
									...acc,
									[c.id]: { type: 'boolean', value: true },
								}),
								{},
							),
						},
					},
					codes: selectedOptions,
				},
				valueId,
			)
		}
	}
	render(): TemplateResult {
		if (!this.visible) {
			return html``
		}
		const inputValues = this.getValueFromProvider()[1] ?? []

		return html`
			<div class="icure-text-field">
				${this.displayedLabels ? generateLabels(this.displayedLabels, this.language(), this.translate ? this.translationProvider : undefined) : nothing}
				<div style="${this.generateStyle()}">
					${this.displayedOptions?.map((x) => {
						const text = (x.label ?? {})[this.language()] ?? ''
						if (this.readonly) {
							return html`<div>
								<input class="icure-checkbox" disabled type="${this.type}" id="${x.id}" name="${this.label}" value="${text}" .checked=${inputValues.includes(x.id)} /><label
									class="icure-button-group-label"
									for="${x.id}"
									><span>${text}</span></label
								>
							</div>`
						}
						return html`<div>
							<input
								class="icure-checkbox"
								type="${this.type}"
								id="${x.id}"
								name="${this.label}"
								value="${text}"
								.checked=${inputValues.includes(x.id)}
								@change=${this.checkboxChange}
							/><label class="icure-button-group-label" for="${x.id}"><span>${text}</span></label>
						</div>`
					})}
				</div>
			</div>
		`
	}

	private generateStyle() {
		return this.styleOptions?.columns
			? `grid-template-columns: repeat(${this.styleOptions?.columns}, 1fr);`
			: this.styleOptions?.rows
			? `grid-template-columns: repeat(${Number((this.displayedOptions?.length ?? 0) / (this.styleOptions?.rows as number))}, 1fr);`
			: ''
	}
}

customElements.define('icure-button-group', IcureButtonGroup)
