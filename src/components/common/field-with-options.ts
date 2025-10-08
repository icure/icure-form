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

		public firstUpdated(_changedProperties: PropertyValues) {
			super.firstUpdated(_changedProperties)
			this.optionsProvider(this.language()).then(async (options) => {
				this.displayedOptions = options
			})
		}
	}
	// Cast return type to the superClass type passed in
	return FieldWithOptionsMixinClass as Constructor<FieldWithOptionsMixinInterface> & T
}
