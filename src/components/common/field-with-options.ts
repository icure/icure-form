import { Field } from './field'
import { PropertyValues } from '@lit/reactive-element'
import { Code } from '../model'
import { property, state } from 'lit/decorators.js'

export declare class FieldWithOptionsMixinInterface extends Field {
	optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]>
	displayedOptions: Code[]
}

type Constructor<T extends Field> = new (...args: any[]) => T

export const FieldWithOptionsMixin = <T extends Constructor<Field>>(superClass: T) => {
	class FieldWithOptionsMixinClass extends superClass {
		@property() optionsProvider: (language: string, searchTerm?: string) => Promise<Code[]> = async () => []
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
