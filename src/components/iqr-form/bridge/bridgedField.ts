import { css, CSSResultGroup, LitElement, TemplateResult } from 'lit'
import { property } from 'lit/decorators.js'

import '../../iqr-text-field'
import { renderField } from '../fieldRenderer'
import { Field } from '../model'

export class BridgedField extends LitElement {
	@property() label = ''
	@property() skin = 'material'
	@property() fgColumns = 1
	@property() labelPosition = 'left'
	@property() field?: Field = undefined

	static get styles(): CSSResultGroup[] {
		return [
			css`
				:host {
				}
			`,
		]
	}

	render(): TemplateResult {
		return renderField(this.field!, this.skin, this.fgColumns, this.labelPosition, fieldsInRow, props, formsValueContainer, formValuesContainerChanged)
	}
}
customElements.define('iqr-bridged-field', BridgedField)
