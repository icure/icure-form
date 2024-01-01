import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { handleSingleMetadataChanged, handleSingleValueChanged, singleValueProvider } from '../utils'
import { Suggestion } from '../../../../generic'

import '../../../icure-text-field'

class TextField extends Field {
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

	render() {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`<icure-text-field
				.readonly="${this.readonly}"
				label="${this.label}"
				.displayedLabels="${this.displayedLabels}"
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
				.valueProvider=${singleValueProvider(this.valueProvider, id)}
				.metaProvider=${this.metadataProvider}
				.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
				.handleMetaChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
				.styleOptions=${this.styleOptions}
			></icure-text-field>`
		})
	}
}

customElements.define('icure-form-textfield', TextField)
