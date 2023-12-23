import { CSSResultGroup } from 'lit'
// @ts-ignore
import baseCss from '../iqr-form/fields/text-field/iqr-text-field/styles/style.scss'
// @ts-ignore
import kendoCss from '../iqr-form/fields/text-field/iqr-text-field/styles/kendo.scss'
import { ActionedField } from './actionedField'

export abstract class StylizedField extends ActionedField {
	static get styles(): CSSResultGroup[] {
		return [baseCss, kendoCss]
	}
}
