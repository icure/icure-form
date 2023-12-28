import { property } from 'lit/decorators.js'
import { Labels } from '../../models'
import { LitElement } from 'lit'

export abstract class Field extends LitElement {
	@property() labels: Labels = {}
	@property() placeholder?: string = ''
	@property() styleOptions: { [key: string]: unknown }
	@property() translate = true
	@property() defaultLanguage?: string = 'en' //todo make an enum
	@property() displayedLanguage?: string = this.defaultLanguage
	@property() translationProvider: (text: string, language?: string) => string = (text) => text
	protected translateText(text: string): string {
		return this.translate ? this.translationProvider(text) : text
	}
}
