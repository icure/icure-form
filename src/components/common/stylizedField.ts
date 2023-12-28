import { CSSResultGroup } from 'lit'
// @ts-ignore
import baseCss from '../icure-form/fields/text-field/icure-text-field/styles/style.scss'
// @ts-ignore
import kendoCss from '../icure-form/fields/text-field/icure-text-field/styles/kendo.scss'
import { StateListenerLitElement } from './stateListenerLitElement'

export abstract class StylizedField extends StateListenerLitElement {
	static get styles(): CSSResultGroup[] {
		return [baseCss, kendoCss]
	}
}
