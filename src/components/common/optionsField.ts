import { property } from 'lit/decorators.js'
import { CodeStub } from '@icure/api'
import { ValuedField } from './valuedField'
import { StateToUpdate, Trigger } from '../iqr-form/model'

export class OptionCode {
	id: string
	text: string
}

export class TranslatedOptionCode {
	id: string
	text: string
	translatedText: string
}

export abstract class OptionsField<T, V> extends ValuedField<T, V> {
	@property() options?: (OptionCode | CodeStub)[] = []
	@property() codifications?: string[] = []
	@property() optionsProvider: (codifications: string[], searchTerm?: string) => Promise<(OptionCode | CodeStub)[]> = async () => []
	@property() sortable?: boolean = false
	@property() sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean } = { other: 2, none: 1, empty: -1, asc: true, alpha: true }

	protected translatedOptions: (TranslatedOptionCode | CodeStub)[] = []
	protected async fetchInitialsOptions(): Promise<(OptionCode | CodeStub)[]> {
		return this.fetchOptions('') as Promise<(OptionCode | CodeStub)[]>
	}
	protected async fetchOptions(searchTerm: string): Promise<(OptionCode | CodeStub)[]> {
		return (this.optionsProvider(this.codifications ?? [], searchTerm) as Promise<(OptionCode | CodeStub)[]>).then(this.sort.bind(this))
	}
	protected fetchTranslateOptions(): void {
		this.translatedOptions =
			this.options?.map((option) => {
				if (Boolean(option?.['text'])) {
					return {
						id: option.id,
						text: option?.['text'],
						translatedText: this.translateText(option?.['text'] || ''),
					}
				} else {
					if (Boolean(option?.['label'])) {
						option['translatedText'] = this.translateText(option?.['label']?.[this.defaultLanguage || 'en'] || '')
					}
					return option
				}
			}) ?? []
		this.sort(this.translatedOptions)
	}

	protected sort(array: (OptionCode | CodeStub | TranslatedOptionCode)[]): (OptionCode | CodeStub | TranslatedOptionCode)[] {
		if (this.actionManager?.hasActionsToLaunch(Trigger.SORT, this.label || '')) {
			this.actionManager?.launchActions(Trigger.SORT, this.label || '', { options: array })
		}
		if (this.sortable) {
			const comparatorProperty: (arg0: OptionCode | TranslatedOptionCode | CodeStub) => string = (obj: OptionCode | CodeStub | TranslatedOptionCode): string =>
				obj?.['translatedText'] || obj?.['text'] || obj?.['label']?.[this.displayedLanguage || this.defaultLanguage || 'en'] || ''
			array = array.sort((a, b) => {
				// Assign powers to IDs using sorting options (sortOptions)
				const poweredA = this.sortOptions?.[a?.['id'] || ''] || 0
				const poweredB = this.sortOptions?.[b?.['id'] || ''] || 0

				// Compare powers
				if (poweredA !== poweredB) {
					// If powers are different, perform sorting based on powers,
					// taking into account the ascending or descending order defined in sortOptions.
					return (poweredA - poweredB) * (this.sortOptions?.asc ? 1 : -1)
				}

				// If powers are equal, perform alphabetical sorting using comparatorProperty if sortOptions.alpha is true.
				return this.sortOptions === undefined || this.sortOptions?.alpha
					? (comparatorProperty(a) || '').localeCompare(comparatorProperty(b) || '', this.displayedLanguage || this.defaultLanguage || 'en', { sensitivity: 'base' }) *
							(this.sortOptions === undefined || this.sortOptions?.asc ? 1 : -1)
					: 0
			})
		}
		return array
	}
	//override
	public stateUpdater(state: StateToUpdate, result: any): void {
		super.stateUpdater(state, result)
		if (state === StateToUpdate.OPTIONS) {
			this.options = result
		}
	}
}
