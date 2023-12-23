import { html } from 'lit'
import { property } from 'lit/decorators.js'

import './iqr-text-field'
import { Suggestion, VersionedMeta, VersionedValue } from './iqr-text-field'
import { Content } from '@icure/api'
import { ValuedField } from '../../../common'

class Textfield extends ValuedField<string, VersionedValue[]> {
	//Boolean value is parsed as text, so we also need to use string type
	@property() multiline: boolean | string = false
	@property() rows = 1
	@property() grows = false
	@property() unit?: string = ''
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property() linksProvider: (sug: { id: string; code: string; text: string; terms: string[] }) => Promise<{ href: string; title: string } | undefined> = () =>
		Promise.resolve(undefined)
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() ownersProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')

	@property() metaProvider?: () => VersionedMeta[] = undefined
	@property() handleMetaChanged?: (id: string, language: string, value: { asString: string; content?: Content }) => void = undefined

	/**
	 * Todo: refactor versioned values.
	 */
	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues?.length ? versionedValues : [undefined]).map((versionedValue, idx) => {
			return html`<iqr-text-field
				.actionManager="${this.actionManager}"
				.editable="${this.editable}"
				labelPosition=${this.labelPosition}
				label="${this.label}"
				labels="${this.labels}"
				value="${this.value}"
				defaultLanguage="${this.defaultLanguage}"
				schema="${this.multiline ? 'text-document' : 'styled-text-with-codes'}"
				?suggestions=${!!this.suggestionProvider}
				?links=${!!this.linksProvider}
				.linksProvider=${this.linksProvider}
				.suggestionProvider=${this.suggestionProvider}
				.ownersProvider=${this.ownersProvider}
				.translationProvider=${this.translationProvider}
				.codeColorProvider=${this.codeColorProvider}
				.linkColorProvider=${this.linkColorProvider}
				.codeContentProvider=${this.codeContentProvider}
				.valueProvider=${() => versionedValue}
				.metaProvider=${() => this.metaProvider?.()?.[idx]}
				.handleValueChanged=${this.handleValueChanged}
				.handleMetaChanged=${this.handleMetaChanged}
				.styleOptions=${this.styleOptions}
			></iqr-text-field>`
		})
	}
}
//.valueProvider=${() => versionedValue}

customElements.define('iqr-form-textfield', Textfield)
