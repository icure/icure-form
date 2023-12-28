import { DocumentSchema, InlineSchema, StyledSchema } from '../icure-text-field/schema/markdown-schema'
import { TokensSchema } from '../icure-text-field/schema/token-schema'
import { ItemsListSchema } from '../icure-text-field/schema/items-list'
import { DateSchema, DateTimeSchema, TimeSchema } from '../icure-text-field/schema/date-time-schema'
import { DecimalSchema } from '../icure-text-field/schema/decimal-schema'
import { MeasureSchema } from '../icure-text-field/schema/measure-schema'

export interface OptionCode {
	id: string
	label: { [key: string]: string }
}

export interface Labels {
	[position: string]: string
}

export type IcureTextFieldSchema =
	| DocumentSchema
	| TokensSchema
	| ItemsListSchema
	| StyledSchema
	| InlineSchema
	| DateSchema
	| TimeSchema
	| DateTimeSchema
	| DecimalSchema
	| MeasureSchema

type FieldType =
	| 'textfield'
	| 'measure-field'
	| 'number-field'
	| 'token-field'
	| 'items-list-field'
	| 'date-picker'
	| 'time-picker'
	| 'date-time-picker'
	| 'multiple-choice'
	| 'dropdown-field'
	| 'radio-button'
	| 'checkbox'
	| 'label'
	| 'action'

//todo: create abstract class for all fields + delete useless properties

export abstract class Field {
	clazz = 'field' as const
	field: string
	type: FieldType
	shortLabel?: string
	rows?: number
	columns?: number
	grows?: boolean
	schema?: IcureTextFieldSchema
	tags?: string[]
	codifications?: string[]
	options?: { [key: string]: unknown }
	labels?: Labels
	value?: string
	unit?: string
	multiline?: boolean
	hideCondition?: string
	now?: boolean
	translate?: boolean
	sortable?: boolean
	sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean }
	width?: number
	styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }

	label(): string {
		return this.field
	}

	protected constructor(
		type: FieldType,
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			schema,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			multiline,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			schema?: IcureTextFieldSchema
			tags?: string[]
			codifications?: string[]
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			hideCondition?: string
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		this.field = label
		this.type = type
		this.shortLabel = shortLabel
		this.rows = rows || 1
		this.grows = grows || false
		this.columns = columns || 1
		this.schema = schema
		this.tags = tags
		this.codifications = codifications
		this.options = options
		this.labels = labels
		this.value = value
		this.unit = unit
		this.multiline = multiline || false
		this.hideCondition = hideCondition
		this.now = now
		this.translate = translate ?? true
		this.width = width
		this.styleOptions = styleOptions
	}

	static parse(json: Field): Field {
		return (
			{
				textfield: () => new TextField(json.field, { ...json }),
				'measure-field': () => new MeasureField(json.field, { ...json }),
				'token-field': () => new TokenField(json.field, { ...json }),
				'items-list-field': () => new ItemsListField(json.field, { ...json }),
				'number-field': () => new NumberField(json.field, { ...json }),
				'date-picker': () => new DatePicker(json.field, { ...json }),
				'time-picker': () => new TimePicker(json.field, { ...json }),
				'date-time-picker': () => new DateTimePicker(json.field, { ...json }),
				'multiple-choice': () => new MultipleChoice(json.field, { ...json }),
				dropdown: () => new DropdownField(json.field, { ...json }),
				'radio-button': () => new RadioButton(json.field, { ...json }),
				checkbox: () => new CheckBox(json.field, { ...json }),
				label: () => new Label(json.field, { ...json }),
			}[json.type]?.() ?? new TextField(json.field, { ...json })
		)
	}

	toJson(): {
		grows: boolean | undefined
		schema: string | undefined
		columns: number | undefined
		codifications: string[] | undefined
		sortable: boolean | undefined
		type:
			| 'textfield'
			| 'measure-field'
			| 'number-field'
			| 'token-field'
			| 'items-list-field'
			| 'date-picker'
			| 'time-picker'
			| 'date-time-picker'
			| 'multiple-choice'
			| 'dropdown-field'
			| 'radio-button'
			| 'checkbox'
			| 'label'
			| 'action'
		rows: number | undefined
		translate: boolean | undefined
		tags: string[] | undefined
		labels: Labels | undefined
		unit: string | undefined
		field: string
		styleOptions: { width: number; direction: string; columns: number; rows: number; alignItems: string } | undefined
		sortOptions: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean } | undefined
		multiline: boolean | undefined
		now: boolean | undefined
		options: { [p: string]: unknown } | undefined
		width: number | undefined
		shortLabel: string | undefined
		hideCondition: string | undefined
		value: string | undefined
	} {
		return {
			field: this.field,
			type: this.type,
			shortLabel: this.shortLabel,
			rows: this.rows,
			grows: this.grows,
			columns: this.columns,
			schema: this.schema?.toString(),
			tags: this.tags,
			codifications: this.codifications,
			options: this.options,
			labels: this.labels,
			value: this.value,
			unit: this.unit,
			multiline: this.multiline,
			hideCondition: this.hideCondition,
			now: this.now,
			translate: this.translate,
			sortable: this.sortable,
			sortOptions: this.sortOptions,
			width: this.width,
			styleOptions: this.styleOptions,
		}
	}
}

export class TextField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			schema,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			multiline,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			schema?: IcureTextFieldSchema
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('textfield', label, {
			shortLabel,
			rows,
			grows,
			columns,
			schema: schema || 'styled-text-with-codes',
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			multiline: multiline,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class MeasureField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('measure-field', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class NumberField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('number-field', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class TokenField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('token-field', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class ItemsListField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('items-list-field', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class DatePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('date-picker', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		})
	}
}

export class TimePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('time-picker', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		})
	}
}

export class DateTimePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('date-time-picker', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		})
	}
}

export class MultipleChoice extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			hideCondition?: string
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('multiple-choice', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
	}
}

export class DropdownField extends Field {
	constructor(
		label: string,
		options: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			hideCondition?: string
			translate?: boolean
			sortable?: boolean
			sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean }
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('dropdown-field', label, {
			shortLabel: options.shortLabel,
			rows: options.rows,
			grows: options.grows,
			columns: options.columns,
			tags: options.tags,
			codifications: options.codifications,
			options: options.options,
			labels: options.labels,
			value: options.value,
			hideCondition: options.hideCondition,
			translate: options.translate,
			width: options.width,
			styleOptions: options.styleOptions,
		})
		this.sortable = options.sortable ?? false
		this.sortOptions = options.sortOptions ?? undefined
	}
}

export class RadioButton extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			value,
			hideCondition,
			translate,
			sortable,
			sortOptions,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			value?: string
			hideCondition?: string
			translate?: boolean
			sortable?: boolean
			sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean }
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('radio-button', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			value,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
		this.sortable = sortable ?? false
		this.sortOptions = sortOptions ?? undefined
	}
}

export class CheckBox extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			value,
			hideCondition,
			translate,
			sortable,
			sortOptions,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			rows?: number
			grows?: boolean
			columns?: number
			tags?: string[]
			codifications?: string[]
			options?: { [p: string]: unknown }
			value?: string
			hideCondition?: string
			translate?: boolean
			sortable?: boolean
			sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean }
			width?: number
			styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string }
		},
	) {
		super('checkbox', label, {
			shortLabel,
			rows,
			grows,
			columns,
			tags,
			codifications,
			options,
			value,
			hideCondition,
			translate,
			width,
			styleOptions,
		})
		this.sortable = sortable ?? false
		this.sortOptions = sortOptions ?? undefined
	}
}
export class Label extends Field {
	constructor(label: string, { shortLabel, rows, grows, columns }: { shortLabel?: string; rows?: number; grows?: boolean; columns?: number }) {
		super('label', label, { shortLabel, rows, grows, columns })
	}
}

export class ActionButton extends Field {
	constructor(label: string, { shortLabel, rows, grows, columns }: { shortLabel?: string; rows?: number; grows?: boolean; columns?: number }) {
		super('action', label, { shortLabel, rows, grows, columns })
	}
}
export class Group {
	clazz = 'group' as const
	group: string
	fields?: Array<Field | Group>
	rows?: number
	columns?: number
	hideCondition?: string
	width?: number
	styleOptions?: { [key: string]: unknown }

	constructor(
		title: string,
		{
			fields,
			rows,
			columns,
			hideCondition,
			width,
			styleOptions,
		}: {
			fields: Array<Field | Group>
			rows?: number
			columns?: number
			hideCondition?: string
			width?: number
			styleOptions?: { [p: string]: unknown }
		},
	) {
		this.group = title
		this.fields = fields
		this.rows = rows
		this.columns = columns
		this.hideCondition = hideCondition
		this.width = width
		this.styleOptions = styleOptions
	}

	static parse(json: { group: string; fields?: Array<Field | Group>; rows?: number; columns?: number; hideCondition?: string; width?: number }): Group {
		return new Group(json.group, {
			fields: (json.fields || []).map((s: Field | Group) => (s['group'] ? Group.parse(s as Group) : Field.parse(s as Field))),
			rows: json.rows,
			columns: json.columns,
			hideCondition: json.hideCondition,
			width: json.width,
		})
	}

	toJson(): any {
		return {
			group: this.group,
			hideCondition: this.hideCondition,
			fields: this.fields?.map((f: Field | Group) => f.toJson()),
			rows: this.rows,
			columns: this.columns,
			width: this.width,
		}
	}
}

export class SubForm {
	clazz = 'subform' as const
	subform: string
	shortLabel?: string
	forms?: { [key: string]: Form }
	rows?: number
	columns?: number
	hideCondition?: string
	width?: number
	styleOptions?: { [key: string]: unknown }

	constructor(
		title: string,
		{
			shortLabel,
			forms,
			rows,
			columns,
			hideCondition,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			forms: { [key: string]: Form }
			rows?: number
			columns?: number
			hideCondition?: string
			width?: number
			styleOptions?: { [p: string]: unknown }
		},
	) {
		this.subform = title
		this.shortLabel = shortLabel
		this.forms = forms
		this.rows = rows
		this.columns = columns
		this.hideCondition = hideCondition
		this.width = width
		this.styleOptions = styleOptions
	}

	static parse(json: { group: string; fields?: Array<Field | Group>; rows?: number; columns?: number; hideCondition?: string; width?: number }): Group {
		return new Group(json.group, {
			fields: (json.fields || []).map((s: Field | Group) => (s['group'] ? Group.parse(s as Group) : Field.parse(s as Field))),
			rows: json.rows,
			columns: json.columns,
			hideCondition: json.hideCondition,
			width: json.width,
		})
	}
}
export class Section {
	section: string
	fields: Array<Field | Group>
	description?: string
	keywords?: string[]

	constructor(title: string, fields: Array<Field | Group>, description?: string, keywords?: string[]) {
		this.section = title
		this.fields = fields
		this.description = description
		this.keywords = keywords
	}

	static parse(json: {
		section: string
		fields?: Array<Field | Group>
		groups?: Array<Field | Group>
		sections?: Array<Field | Group>
		description?: string
		keywords?: string[]
	}): Section {
		return new Section(
			json.section,
			(json.fields || json.groups || json.sections || []).map((s: Field | Group) => (s['group'] ? Group.parse(s as Group) : Field.parse(s as Field))),
			json.description,
			json.keywords,
		)
	}

	toJson(): {
		section: string
		keywords?: string[]
		description?: string
		fields: any[]
	} {
		return {
			section: this.section,
			fields: this.fields.map((f: Field | Group) => f.toJson()),
			description: this.description,
			keywords: this.keywords,
		}
	}
}

export class Form {
	form: string
	sections: Section[]
	description?: string
	keywords?: string[]
	actions?: Action[]

	constructor(title: string, sections: Section[], description?: string, keywords?: string[], actions?: Action[]) {
		this.form = title
		this.description = description
		this.keywords = keywords
		this.sections = sections
		this.actions = actions
	}

	static parse(json: { form: string; sections: Section[]; description?: string; keywords?: string[]; actions?: Action[] }): Form {
		return new Form(
			json.form,
			(json.sections || []).map((s: Section) => Section.parse(s)),
			json.description,
			json.keywords,
			(json.actions || []).map((a: Action) => Action.parse(a)),
		)
	}

	toJson(): {
		form: string
		keywords?: string[]
		description?: string
		actions:
			| {
					launchers: { triggerer: string; shouldPassValue: boolean; name: string }[]
					expression: string
					states: { stateToUpdate: string; name: string; canLaunchLauncher: boolean }[]
			  }[]
			| undefined
		sections: { section: string; keywords?: string[]; description?: string; fields: any[] }[]
	} {
		return {
			form: this.form,
			sections: this.sections.map((s: Section) => s.toJson()),
			description: this.description,
			keywords: this.keywords,
			actions: this.actions?.map((a: Action) => a.toJson()),
		}
	}
}

/**
 * Action part.
 * An action is an expression that can be triggered by a launcher and that can change the state of the form.
 * Launchers are defined by a trigger and a name. Launchers are events that will trigger the action.
 * Expression is evaluated by an Interpreter (get from the frontend). The expression can change the state of the form or launch another action on the frontend.
 * States are the states that can be changed by the action. States are defined by a name and a state to update.
 * There is 3 types of Action:
 * - Formulas: the expression is a formula that will change the value of a field.
 * 		Example: OnChange of field A and B, expresion is A + B and state is value of field C.
 * - ExternalAction: the expression is a call to an external action.
 * 		Example: OnClick of button A, expression is open dialog B and state is value of field C (that will be returned by the dialog).
 * - ExternalEvent: the launcher is an external event.
 * 		Example: Frontend send an event, expression is value of the event and state is value of field A.
 */
export class Action {
	launchers: Launcher[]
	expression: string
	states: State[]
	constructor(launchers: Launcher[], expression: string, states: State[]) {
		this.launchers = launchers
		this.expression = expression
		this.states = states
	}

	static parse(json: { launchers: Launcher[]; expression: string; states: State[] }): Action {
		return new Action(
			(json.launchers || []).map((l: Launcher) => Launcher.parse(l)),
			json.expression,
			(json.states || []).map((s: State) => State.parse(s)),
		)
	}

	toJson(): {
		launchers: { triggerer: string; shouldPassValue: boolean; name: string }[]
		expression: string
		states: { stateToUpdate: string; name: string; canLaunchLauncher: boolean }[]
	} {
		return {
			launchers: this.launchers.map((l: Launcher) => l.toJson()),
			expression: this.expression,
			states: this.states.map((s: State) => s.toJson()),
		}
	}
}

export class Launcher {
	name: string
	triggerer: Trigger
	shouldPassValue: boolean
	constructor(name: string, triggerer: Trigger, shouldPassValue: boolean) {
		this.name = name
		this.triggerer = triggerer
		this.shouldPassValue = shouldPassValue
	}
	static parse(json: { name: string; triggerer: Trigger; shouldPassValue: boolean }): Launcher {
		return new Launcher(json.name, json.triggerer, json.shouldPassValue)
	}

	toJson(): { triggerer: string; shouldPassValue: boolean; name: string } {
		return {
			name: this.name,
			triggerer: this.triggerer.toString(),
			shouldPassValue: this.shouldPassValue,
		}
	}
}

export enum Trigger {
	INIT = 'INIT',
	CHANGE = 'CHANGE',
	SORT = 'SORT',
	CLICK = 'CLICK',
	VISIBLE = 'VISIBLE',
	ERROR = 'ERROR',
	VALID = 'VALID',
	EVENT = 'EVENT',
}

export class State {
	name: string
	stateToUpdate: StateToUpdate
	canLaunchLauncher: boolean
	constructor(name: string, stateToUpdate: StateToUpdate, canLaunchLauncher: boolean) {
		this.name = name
		this.stateToUpdate = stateToUpdate
		this.canLaunchLauncher = canLaunchLauncher
	}
	static parse(json: { name: string; stateToUpdate: StateToUpdate; canLaunchLauncher: boolean }): State {
		return new State(json.name, json.stateToUpdate, json.canLaunchLauncher)
	}

	toJson(): { stateToUpdate: string; name: string; canLaunchLauncher: boolean } {
		return {
			name: this.name,
			stateToUpdate: this.stateToUpdate.toString(),
			canLaunchLauncher: this.canLaunchLauncher,
		}
	}
}

export enum StateToUpdate {
	VALUE = 'VALUE',
	VISIBLE = 'VISIBLE',
	OPTIONS = 'OPTIONS',
	READONLY = 'READONLY',
	CLAZZ = 'CLAZZ',
	REQUIRED = 'REQUIRED',
}
