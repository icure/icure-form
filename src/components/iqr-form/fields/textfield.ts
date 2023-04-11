import { css, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'

import '../../iqr-text-field'
import { Labels, Suggestion, VersionedMeta, VersionedValue } from '../../iqr-text-field'
import { Content } from '@icure/api'

class Textfield extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() labels?: Labels = undefined
	//Boolean value is parsed as text, so we also need to use string type
	@property() multiline: boolean | string = false
	@property() rows = 1
	@property() grows = false
	@property() value?: string = ''
	@property() unit?: string = ''
	@property() labelPosition?: string = undefined
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property() linksProvider: (sug: { id: string; code: string; text: string; terms: string[] }) => Promise<{ href: string; title: string } | undefined> = () =>
		Promise.resolve(undefined)
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() ownersProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')

	@property() valueProvider?: () => VersionedValue[] = undefined
	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleValueChanged?: (id: string | undefined, language: string, value: { asString: string; content?: Content }) => void = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined

	static get styles() {
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
						labelPosition=${this.labelPosition}
						label="${this.label}"
						labels="${this.labels}"
						value="${this.value} ${this.unit}"
						schema="${this.multiline === 'true' ? 'text-document' : 'styled-text-with-codes'}"
						?suggestions=${!!this.suggestionProvider}
						?links=${!!this.linksProvider}
						.linksProvider=${this.linksProvider}
						.suggestionProvider=${this.suggestionProvider}
						.ownersProvider=${this.ownersProvider}
						.codeColorProvider=${this.codeColorProvider}
						.linkColorProvider=${this.linkColorProvider}
						.codeContentProvider=${this.codeContentProvider}
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field-kendo>`
				: html`<iqr-text-field
						labelPosition=${this.labelPosition}
						label="${this.label}"
						labels="${this.labels}"
						value="${this.value} ${this.unit}"
						schema="${this.multiline === 'true' ? 'text-document' : 'styled-text-with-codes'}"
						?suggestions=${!!this.suggestionProvider}
						?links=${!!this.linksProvider}
						.linksProvider=${this.linksProvider}
						.suggestionProvider=${this.suggestionProvider}
						.ownersProvider=${this.ownersProvider}
						.codeColorProvider=${this.codeColorProvider}
						.linkColorProvider=${this.linkColorProvider}
						.codeContentProvider=${this.codeContentProvider}
						.valueProvider=${() => versionedValue}
						.metaProvider=${() => this.metaProvider?.()?.[idx]}
						.handleValueChanged=${(language: string, value: { asString: string; content?: Content }) => this.handleValueChanged?.(versionedValue?.id, language, value)}
						.handleMetaChanged=${this.handleMetaChanged}
				  ></iqr-text-field>`
		})
	}
}

customElements.define('iqr-form-textfield', Textfield)
