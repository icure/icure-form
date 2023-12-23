import { property } from 'lit/decorators.js'
import { LabelizedField } from './labelizedField'

export abstract class TranslatedField extends LabelizedField {
	@property() translate = true
	@property() defaultLanguage?: string = 'en' //todo make an enum
	@property() displayedLanguage?: string = this.defaultLanguage
	@property() translationProvider: (text: string, language?: string) => string = (text) => text
	protected translateText(text: string): string {
		return this.translate ? this.translationProvider(text) : text
	}
}
