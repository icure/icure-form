import obstetrics from './samples/obstetrics.json'
import {
	CheckBox,
	ItemsListField,
	TokenField,
	DatePicker,
	DateTimePicker,
	DropdownField,
	Form,
	MeasureField,
	NumberField,
	Section,
	TextField,
	ActionButton,
} from '../../src/components/icure-form/model'
import YAML from 'yaml'
import { FormLayoutData } from '@icure/api/icc-api/model/FormLayoutData'
import { FormLayout } from '@icure/api'

describe('Form conversion', () => {
	it('should convert an obstetrics form', () => {
		const form: FormLayout = obstetrics as FormLayout

		const makeTextField = (formData: FormLayoutData) => new TextField(formData.name ?? '', { shortLabel: formData.label })
		const makeItemsListField = (formData: FormLayoutData) => new ItemsListField(formData.name ?? '', { shortLabel: formData.label })
		const makeTokenField = (formData: FormLayoutData) => new TokenField(formData.name ?? '', { shortLabel: formData.label })
		const makeCheckBox = (formData: FormLayoutData) => new CheckBox(formData.name ?? '', { shortLabel: formData.label })
		const makeMeasureField = (formData: FormLayoutData) => new MeasureField(formData.name ?? '', { shortLabel: formData.label })
		const makeNumberField = (formData: FormLayoutData) => new NumberField(formData.name ?? '', { shortLabel: formData.label })
		const makeDateTimeField = (formData: FormLayoutData) =>
			(formData.editor as any)?.displayTime
				? new DateTimePicker(formData.name ?? '', { shortLabel: formData.label })
				: new DatePicker(formData.name ?? '', { shortLabel: formData.label })

		const makeDropdownField = (formData: FormLayoutData) =>
			new DropdownField(formData.name ?? '', {
				shortLabel: formData.label,
				options: (formData.editor as any)?.menuOptions
					? (formData.editor as any)?.menuOptions.reduce(
							(
								acc: {
									[key: string]: unknown
								},
								v: string,
							) => ({ ...acc, [v]: `LEGACY|${v}|1` }),
							{},
					  )
					: undefined,
			})

		const makeSubForm = (formData: FormLayoutData) => {}

		const makeActionButton = (formData: FormLayoutData) => new ActionButton(formData.name ?? '', { shortLabel: formData.label })

		const translated = new Form(
			(form.group ? `${form.group}/${form.name}` : form.name) ?? 'Unknown',
			(form.sections ?? []).map(
				(section) =>
					new Section(
						'Main',
						(section.formColumns ?? []).flatMap((column) =>
							(column.formDataList ?? []).map((formData: FormLayoutData) => {
								return {
									StringEditor: makeTextField,
									CheckBoxEditor: makeCheckBox,
									MeasureEditor: makeMeasureField,
									NumberEditor: makeNumberField,
									PopupMenuEditor: makeDropdownField,
									DateTimeEditor: makeDateTimeField,
									StringTableEditor: makeItemsListField,
									TokenFieldEditor: makeTokenField,
									SubFormEditor: makeSubForm,
									ActionButton: makeActionButton,
								}[formData.editor?.key ?? '']?.(formData)
							}),
						),
					),
			),
		)
		const json = YAML.stringify(JSON.parse(JSON.stringify(translated)))
		console.log(json)
	})
})
