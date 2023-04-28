import { Field } from './model'
import {
	dateFieldValuesProvider,
	dateTimeFieldValuesProvider,
	FormValuesContainer,
	handleFieldValueChangedProvider,
	handleMetaChangedProvider,
	measureFieldValuesProvider,
	metaProvider,
	numberFieldValuesProvider,
	textFieldValuesProvider,
	timeFieldValuesProvider,
} from '../iqr-form-loader'
import { html } from 'lit/development'
import { dropdownOptionMapper } from '../iqr-form-loader/fieldsMapper'
import { VersionedValue } from '../iqr-text-field'

const firstItemValueProvider = (valuesProvider: () => VersionedValue[]) => () => valuesProvider()[0]

const calculateFieldOrGroupWidth = (columns: number, fieldsInRow: number) => {
	return `--width: ${(100 / fieldsInRow) * (columns || 0)}%`
}

export function renderField(
	fg: Field,
	skin: string,
	fgColumns: number,
	fieldsInRow: number,
	labelPosition: string,
	formsValueContainer: FormValuesContainer | undefined,
	formValuesContainerChanged: ((newValue: FormValuesContainer) => void) | undefined,
) {
	return html`${fg.type === 'textfield'
		? html`<iqr-form-textfield
				class="iqr-form-field"
				skin="${skin}"
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				multiline="${fg.multiline || false}"
				grows="${fg.grows || false}"
				.linksProvider=${fg.options?.linksProvider}
				.suggestionProvider=${fg.options?.suggestionProvider}
				.ownersProvider=${fg.options?.ownersProvider}
				.codeColorProvider=${fg.options?.codeColorProvider}
				.linkColorProvider=${fg.options?.linkColorProvider}
				.codeContentProvider=${fg.options?.codeContentProvider}
				.valueProvider="${formsValueContainer && textFieldValuesProvider(formsValueContainer, fg)}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-textfield>`
		: fg.type === 'measure-field'
		? html`<iqr-form-measure-field
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
				unit="${fg.unit}"
				.valueProvider="${formsValueContainer && firstItemValueProvider(measureFieldValuesProvider(formsValueContainer, fg))}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-measure-field>`
		: fg.type === 'number-field'
		? html`<iqr-form-number-field
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
				.valueProvider="${formsValueContainer && firstItemValueProvider(numberFieldValuesProvider(formsValueContainer, fg))}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-number-field>`
		: fg.type === 'date-picker'
		? html`<iqr-form-date-picker
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
				.valueProvider="${formsValueContainer && firstItemValueProvider(dateFieldValuesProvider(formsValueContainer, fg))}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-date-picker>`
		: fg.type === 'time-picker'
		? html`<iqr-form-time-picker
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
				.valueProvider="${formsValueContainer && firstItemValueProvider(timeFieldValuesProvider(formsValueContainer, fg))}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-time-picker>`
		: fg.type === 'date-time-picker'
		? html`<iqr-form-date-time-picker
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
				.valueProvider="${formsValueContainer && firstItemValueProvider(dateTimeFieldValuesProvider(formsValueContainer, fg))}"
				.metaProvider=${formsValueContainer && metaProvider(formsValueContainer, fg)}
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
				.handleMetaChanged=${formsValueContainer && handleMetaChangedProvider(formsValueContainer)}
		  ></iqr-form-date-time-picker>`
		: fg.type === 'multiple-choice'
		? html`<iqr-form-multiple-choice
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				value="${fg.value}"
		  ></iqr-form-multiple-choice>`
		: fg.type === 'dropdown-field'
		? html`<iqr-form-dropdown-field
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				.label="${fg.field}"
				.labels="${fg.labels}"
				.options="${dropdownOptionMapper(fg)}"
				.handleValueChanged=${formsValueContainer && formValuesContainerChanged && handleFieldValueChangedProvider(fg, formsValueContainer, formValuesContainerChanged)}
		  ></iqr-form-dropdown-field>`
		: fg.type === 'radio-button'
		? html`<iqr-form-radio-button
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				.options="${dropdownOptionMapper(fg)}"
				value="${fg.value}"
		  ></iqr-form-radio-button>`
		: fg.type === 'checkbox'
		? html`<iqr-form-checkbox
				style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}"
				skin="${skin}"
				labelPosition=${labelPosition}
				label="${fg.field}"
				.labels="${fg.labels}"
				.options="${dropdownOptionMapper(fg)}"
				value="${fg.value}"
		  ></iqr-form-checkbox>`
		: fg.type === 'label'
		? html`<iqr-form-label style="${calculateFieldOrGroupWidth(fgColumns, fieldsInRow)}" labelPosition=${labelPosition} label="${fg.field}"></iqr-form-label>`
		: ''}`
}
