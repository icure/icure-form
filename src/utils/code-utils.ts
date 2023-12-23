import { Field } from '../components/iqr-form/model'
import { OptionCode } from '../components'

export function optionMapper(field: Field): OptionCode[] {
	return Object.keys(field?.options ?? []).map((optionKey) => {
		const text: string = (field?.options?.[optionKey] as string) ?? ''
		return {
			id: optionKey,
			text: text,
		}
	})
}
