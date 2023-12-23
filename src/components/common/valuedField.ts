import { TranslatedField } from './translatedField'
import { property } from 'lit/decorators.js'
import { CodeStub, Content } from '@icure/api'
import { StateToUpdate } from '../iqr-form/model'

export abstract class ValuedField<T, V> extends TranslatedField {
	@property() value: T | undefined | null = undefined
	@property() containerId?: string = undefined
	@property() handleValueChanged?: (language: string, value: { asString: string; content?: Content }, serviceId?: string | undefined, codes?: CodeStub[]) => string = undefined
	@property() valueProvider?: () => V | undefined = undefined
	//override
	public stateUpdater(state: StateToUpdate, result: any): void {
		switch (state) {
			case StateToUpdate.VALUE:
				this.value = result
				break
			case StateToUpdate.VISIBLE:
				this.display = result
				break
			default:
				break
		}
	}
}
