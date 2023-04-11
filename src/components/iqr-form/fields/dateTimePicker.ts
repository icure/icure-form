import { css, CSSResultGroup, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import '../../iqr-text-field'
import { Labels, VersionedMeta, VersionedValue } from '../../iqr-text-field'
import { Content } from '@icure/api'

export class DateTimePicker extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() labelPosition?: string = undefined
	@property() valueProvider?: () => VersionedValue[] = undefined
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleValueChanged?: (id: string | undefined, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() labels?: Labels = undefined
	@property() value?: string = ''

	static get styles(): CSSResultGroup[] {
		return [
			css`
				:host {
				}
			`,
		]
	}

	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue, idx) => {
			return this.skin === 'kendo'
				? html`<iqr-text-field-kendo
						.labels="${this.labels}"
						labelPosition=${this.labelPosition}
						label="${this.label}"
						schema="date-time"
						value=${this.value}
						.valueProvider=${this.valueProvider}
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field-kendo>`
				: html`<iqr-text-field
						.labels="${this.labels}"
						labelPosition=${this.labelPosition}
						label="${this.label}"
						schema="date-time"
						value=${this.value}
						.valueProvider=${this.valueProvider}
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field>`
		})
	}
}

customElements.define('iqr-form-date-time-picker', DateTimePicker)
