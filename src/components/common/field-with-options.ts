import { Field } from './field'
import { PropertyValues } from '@lit/reactive-element'
import { Code } from '../model'
import { property, state } from 'lit/decorators.js'

export declare abstract class FieldWithOptionsMixinInterface extends Field {
	optionsProvider: (language: string, terms?: string[]) => Promise<Code[]>
	displayedOptions: Code[]
}

type Constructor<T extends Field> = abstract new (...args: any[]) => T

export const FieldWithOptionsMixin = <T extends Constructor<Field>>(superClass: T) => {
	abstract class FieldWithOptionsMixinClass extends superClass {
		@property() optionsProvider: (language: string, terms?: string[]) => Promise<Code[]> = async () => []
		@state() displayedOptions: Code[] = []

		// Discard stale option-load results if a newer `optionsProvider` (or language) supersedes them.
		// Without this counter, two rapid changes can race and leave the older promise's options as the
		// final state.
		private __optionsLoadVersion = 0

		public updated(changedProperties: PropertyValues) {
			super.updated?.(changedProperties)
			// Refresh `displayedOptions` whenever the inputs to optionsProvider change. Element reuse
			// across cards in patient-cards mode means the same element can be reused for different
			// fields (different labels/options); loading once in firstUpdated would leave stale options
			// for every field after the first.
			if (changedProperties.has('optionsProvider') || changedProperties.has('defaultLanguage') || changedProperties.has('selectedLanguage')) {
				this.refreshDisplayedOptions()
			}
		}

		public firstUpdated(_changedProperties: PropertyValues) {
			super.firstUpdated?.(_changedProperties)
			this.refreshDisplayedOptions()
		}

		private refreshDisplayedOptions(): void {
			const version = ++this.__optionsLoadVersion
			this.optionsProvider(this.language()).then((options) => {
				if (version !== this.__optionsLoadVersion) return // newer load supersedes
				this.displayedOptions = options
			})
		}
	}
	return FieldWithOptionsMixinClass as Constructor<FieldWithOptionsMixinInterface> & T
}
