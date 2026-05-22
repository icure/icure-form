import { CheckBox, DatePicker, DateTimePicker, DropdownField, ItemsListField, Label, Button, MeasureField, NumberField, RadioButton, TextField, TimePicker, TokenField } from '../../icure-form/fields'
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
import { buildThemeRegistrar } from '../shared'

export const registerTheme = buildThemeRegistrar([
	{ tag: 'icure-metadata-buttons-bar', baseClass: MetadataButtonBar, themeCss: ehrLiteCss },
	{ tag: 'icure-metadata-buttons-bar-wrapper', baseClass: MetadataButtonBarWrapper },
	{ tag: 'icure-form-checkbox', baseClass: CheckBox },
	{ tag: 'icure-form-date-picker', baseClass: DatePicker },
	{ tag: 'icure-form-date-time-picker', baseClass: DateTimePicker },
	{ tag: 'icure-form-dropdown-field', baseClass: DropdownField },
	{ tag: 'icure-button-group', baseClass: IcureButtonGroup, themeCss: ehrLiteCss },
	{ tag: 'icure-date-picker-field', baseClass: IcureDatePickerField, themeCss: ehrLiteCss },
	{ tag: 'icure-dropdown-field', baseClass: IcureDropdownField, themeCss: ehrLiteCss },
	{ tag: 'icure-form', baseClass: IcureForm, themeCss: ehrLiteCss },
	{ tag: 'icure-label', baseClass: IcureLabel, themeCss: ehrLiteCss },
	{ tag: 'icure-button', baseClass: IcureButton, themeCss: ehrLiteCss },
	{ tag: 'icure-text-field', baseClass: IcureTextField, themeCss: ehrLiteCss },
	{ tag: 'icure-form-items-list-field', baseClass: ItemsListField },
	{ tag: 'icure-form-label', baseClass: Label, themeCss: ehrLiteCss },
	{ tag: 'icure-form-button', baseClass: Button, themeCss: ehrLiteCss },
	{ tag: 'icure-form-measure-field', baseClass: MeasureField },
	{ tag: 'icure-form-number-field', baseClass: NumberField },
	{ tag: 'icure-form-radio-button', baseClass: RadioButton },
	{ tag: 'icure-form-text-field', baseClass: TextField },
	{ tag: 'icure-form-time-picker', baseClass: TimePicker },
	{ tag: 'icure-form-token-field', baseClass: TokenField },
	{ tag: 'form-selection-button', baseClass: FormSelectionButton },
])
