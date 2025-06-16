import { html, nothing, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'
import { Field } from '../../../common'
import { handleSingleMetadataChanged, handleSingleValueChanged, overlay, singleValueProvider } from '../utils'
import { Suggestion } from '../../../../generic'

// @ts-ignore
import overlayCss from '../../../common/styles/overlay.scss'

export class TextField extends Field {
	//Boolean value is parsed as text, so we also need to use string type
	@property() multiline: boolean | string = false
	@property() lines = 1
	@property() rows = 1
	@property() grows = false
	@property() unit?: string = ''
	@property() suggestionStopWords: Set<string> = new Set<string>()
	@property() linksProvider: (sug: { id: string; code: string; text: string; terms: string[] }) => Promise<{ href: string; title: string } | undefined> = () => Promise.resolve(undefined)
	@property() suggestionProvider: (terms: string[]) => Promise<Suggestion[]> = async () => []
	@property() codeColorProvider: (type: string, code: string) => string = () => 'XI'
	@property() linkColorProvider: (type: string, code: string) => string = () => 'cat1'
	@property() codeContentProvider: (codes: { type: string; code: string }[]) => string = (codes) => codes.map((c) => c.code).join(',')

	static get styles() {
		return [overlayCss]
	}

	override renderSync(): TemplateResult[] {
		const versionedValues = this.valueProvider?.()
		return (versionedValues && Object.keys(versionedValues).length ? Object.keys(versionedValues) : [undefined]).map((id) => {
			return html`<icure-text-field
					.readonly="${this.readonly}"
					.displayMetadata="${this.displayMetadata}"
					label="${this.label}"
					.multiline="${this.multiline}"
					.lines="${this.lines}"
					.displayedLabels="${this.displayedLabels}"
					.defaultLanguage="${this.defaultLanguage}"
					.languages="${this.languages}"
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
					.defaultValueProvider=${this.defaultValueProvider}
					.valueProvider=${singleValueProvider(this.valueProvider, id)}
					.validationErrorsProvider=${this.validationErrorsProvider}
					.metadataProvider=${this.metadataProvider}
					.handleValueChanged=${handleSingleValueChanged(this.handleValueChanged, id)}
					.handleMetadataChanged=${handleSingleMetadataChanged(this.handleMetadataChanged, id)}
					.styleOptions=${this.styleOptions}
				></icure-text-field>
				${this.loading ? overlay() : nothing} `
		})
	}
}
