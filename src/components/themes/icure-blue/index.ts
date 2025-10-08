import {
	CheckBox,
	DatePicker,
	DateTimePicker,
	DropdownField,
	ItemsListField,
	Label,
	Button,
	MeasureField,
	NumberField,
	RadioButton,
	TextField,
	TimePicker,
	TokenField,
} from '../../icure-form/fields'
import { IcureButtonGroup } from '../../icure-button-group'
import { IcureDatePickerField } from '../../icure-date-picker'
import { IcureDropdownField } from '../../icure-dropdown-field'
import { IcureForm } from '../../icure-form'
import { IcureLabel } from '../../icure-label'
import { IcureTextField, MetadataButtonBarWrapper } from '../../icure-text-field'

// @ts-ignore
import ehrLiteCss from './ehr-lite.scss'
import { MetadataButtonBar } from '../../common/metadata-buttons-bar'
import { IcureButton } from '../../icure-button'
import { FormSelectionButton } from '../../icure-form/renderer/form/form-selection-button'

class EhrLiteIcureButtonGroup extends IcureButtonGroup {
	static get styles() {
		return [...IcureButtonGroup.styles, ehrLiteCss]
	}
}
class EhrLiteIcureDatePickerField extends IcureDatePickerField {
	static get styles() {
		return [...IcureDatePickerField.styles, ehrLiteCss]
	}
}
class EhrLiteIcureDropdownField extends IcureDropdownField {
	static get styles() {
		return [...IcureDropdownField.styles, ehrLiteCss]
	}
}
class EhrLiteIcureForm extends IcureForm {
	static get styles() {
		return [...IcureForm.styles, ehrLiteCss]
	}
}
class EhrLiteIcureLabel extends IcureLabel {
	static get styles() {
		return [...IcureLabel.styles, ehrLiteCss]
	}
}
class EhrLiteIcureButton extends IcureButton {
	static get styles() {
		return [...IcureButton.styles, ehrLiteCss]
	}
}
class EhrLiteIcureTextField extends IcureTextField {
	static get styles() {
		return [...IcureTextField.styles, ehrLiteCss]
	}
}
class EhrLiteLabel extends Label {
	static get styles() {
		return [...Label.styles, ehrLiteCss]
	}
}
class EhrLiteMetadataButtonBar extends MetadataButtonBar {
	static get styles() {
		return [...MetadataButtonBar.styles, ehrLiteCss]
	}
}
class EhrLiteButton extends Button {
	static get styles() {
		return [...Button.styles, ehrLiteCss]
	}
}

customElements.define('icure-metadata-buttons-bar', EhrLiteMetadataButtonBar)
customElements.define('icure-metadata-buttons-bar-wrapper', MetadataButtonBarWrapper)

customElements.define('icure-form-checkbox', CheckBox)
customElements.define('icure-form-date-picker', DatePicker)
customElements.define('icure-form-date-time-picker', DateTimePicker)
customElements.define('icure-form-dropdown-field', DropdownField)
customElements.define('icure-button-group', EhrLiteIcureButtonGroup)
customElements.define('icure-date-picker-field', EhrLiteIcureDatePickerField)
customElements.define('icure-dropdown-field', EhrLiteIcureDropdownField)
customElements.define('icure-form', EhrLiteIcureForm)
customElements.define('icure-label', EhrLiteIcureLabel)
customElements.define('icure-button', EhrLiteIcureButton)
customElements.define('icure-text-field', EhrLiteIcureTextField)
customElements.define('icure-form-items-list-field', ItemsListField)
customElements.define('icure-form-label', EhrLiteLabel)
customElements.define('icure-form-button', EhrLiteButton)
customElements.define('icure-form-measure-field', MeasureField)
customElements.define('icure-form-number-field', NumberField)
customElements.define('icure-form-radio-button', RadioButton)
customElements.define('icure-form-text-field', TextField)
customElements.define('icure-form-time-picker', TimePicker)
customElements.define('icure-form-token-field', TokenField)
customElements.define('form-selection-button', FormSelectionButton)
