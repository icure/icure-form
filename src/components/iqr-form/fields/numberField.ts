import { css, CSSResultGroup, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import '../../iqr-text-field'
import { Labels, VersionedMeta, VersionedValue } from '../../iqr-text-field'
import { Content } from '@icure/api'

export class NumberField extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() labelPosition?: string = undefined
	@property() labels?: Labels = undefined
	@property() value?: string = ''
	@property() valueProvider?: () => VersionedValue[] = undefined
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleValueChanged?: (id: string | undefined, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined

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
						labelPosition="${this.labelPosition}"
						label="${this.label}"
						.labels="${this.labels}"
						value="${this.value}"
						schema="decimal"
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field-kendo>`
				: html`<iqr-text-field
						labelPosition="${this.labelPosition}"
						label="${this.label}"
						.labels="${this.labels}"
						value="${this.value}"
						schema="decimal"
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field>`
		})
	}
}

customElements.define('iqr-form-number-field', NumberField)
