import { IqrTextFieldSchema } from '../fields/text-field'
import { Labels } from '../../../models'

type FieldType =
	| 'textfield'
	| 'measure-field'
	| 'number-field'
	| 'date-picker'
	| 'time-picker'
	| 'date-time-picker'
	| 'multiple-choice'
	| 'dropdown-field'
	| 'radio-button'
	| 'checkbox'
	| 'label'

//todo: create abstract class for all fields + delete useless properties

export abstract class Field {
	clazz = 'field' as const
	field: string
	type: FieldType
	shortLabel?: string
	rows?: number
	columns?: number
	grows?: boolean
	schema?: IqrTextFieldSchema
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
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		schema?: IqrTextFieldSchema,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		multiline?: boolean,
		hideCondition?: string,
		now?: boolean,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
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
		this.multiline = multiline
		this.hideCondition = hideCondition
		this.now = now
		this.translate = translate ?? true
		this.width = width
		this.styleOptions = styleOptions
	}

	static parse(json: Field): Field {
		switch (json.type as string) {
			case 'textfield':
				return new TextField(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.schema,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.multiline,
					json.hideCondition,
					json.translate,
					json.width,
					json.styleOptions,
				)
			case 'measure-field':
				return new MeasureField(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					json.unit,
					json.hideCondition,
					json.translate,
					json.width,
				)
			case 'number-field':
				return new NumberField(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.hideCondition,
					json.translate,
					json.width,
				)
			case 'date-picker':
				return new DatePicker(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.hideCondition,
					json.now,
					json.translate,
					json.width,
				)
			case 'time-picker':
				return new TimePicker(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.hideCondition,
					json.now,
					json.translate,
					json.width,
				)
			case 'date-time-picker':
				return new DateTimePicker(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.hideCondition,
					json.now,
					json.translate,
					json.width,
				)
			case 'multiple-choice':
				return new MultipleChoice(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					undefined,
					json.hideCondition,
					json.translate,
					json.width,
				)
			case 'dropdown':
				return new DropdownField(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.labels,
					json.value,
					json.hideCondition,
					json.translate,
					json.sortable,
					json.sortOptions,
					json.width,
					json.styleOptions,
				)
			case 'radio-button':
				return new RadioButton(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.value,
					json.hideCondition,
					json.translate,
					json.sortable,
					json.sortOptions,
					json.width,
					json.styleOptions,
				)
			case 'checkbox':
				return new CheckBox(
					json.field,
					json.shortLabel,
					json.rows,
					json.grows,
					json.columns,
					json.tags,
					json.codifications,
					json.options,
					json.value,
					json.hideCondition,
					json.translate,
					json.sortable,
					json.sortOptions,
					json.width,
					json.styleOptions,
				)
			case 'label':
				return new Label(json.field, json.shortLabel, json.rows, json.grows, json.columns)
			default:
				throw Error('Invalid field type ' + json.type)
		}
	}
}

export class TextField extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		schema?: IqrTextFieldSchema,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		multiline?: boolean,
		hideCondition?: string,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'textfield',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			schema || 'styled-text-with-codes',
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			multiline,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
	}
}

export class MeasureField extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'measure-field',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
	}
}

export class NumberField extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'number-field',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
	}
}

export class DatePicker extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		now?: boolean,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'date-picker',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		)
	}
}

export class TimePicker extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		now?: boolean,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'time-picker',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		)
	}
}

export class DateTimePicker extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		now?: boolean,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'date-time-picker',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			now,
			translate,
			width,
			styleOptions,
		)
	}
}

export class MultipleChoice extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		unit?: string,
		hideCondition?: string,
		translate?: boolean,
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'multiple-choice',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			unit,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
	}
}

export class DropdownField extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		labels?: Labels,
		value?: string,
		hideCondition?: string,
		translate?: boolean,
		sortable?: boolean,
		sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean },
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'dropdown-field',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			labels,
			value,
			undefined,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
		this.sortable = sortable ?? false
		this.sortOptions = sortOptions ?? undefined
	}
}

export class RadioButton extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		value?: string,
		hideCondition?: string,
		translate?: boolean,
		sortable?: boolean,
		sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean },
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'radio-button',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			undefined,
			value,
			undefined,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
		this.sortable = sortable ?? false
		this.sortOptions = sortOptions ?? undefined
	}
}

export class CheckBox extends Field {
	constructor(
		label: string,
		shortLabel?: string,
		rows?: number,
		grows?: boolean,
		columns?: number,
		tags?: string[],
		codifications?: string[],
		options?: { [key: string]: unknown },
		value?: string,
		hideCondition?: string,
		translate?: boolean,
		sortable?: boolean,
		sortOptions?: { other?: number; none?: number; empty?: number; asc?: boolean; alpha?: boolean },
		width?: number,
		styleOptions?: { width: number; direction: string; columns: number; rows: number; alignItems: string },
	) {
		super(
			'checkbox',
			label,
			shortLabel,
			rows,
			grows,
			columns,
			undefined,
			tags,
			codifications,
			options,
			undefined,
			value,
			undefined,
			false,
			hideCondition,
			false,
			translate,
			width,
			styleOptions,
		)
		this.sortable = sortable ?? false
		this.sortOptions = sortOptions ?? undefined
	}
}
export class Label extends Field {
	constructor(label: string, shortLabel?: string, rows?: number, grows?: boolean, columns?: number) {
		super('label', label, shortLabel, rows, grows, columns)
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

	constructor(title: string, fields: Array<Field | Group>, rows?: number, columns?: number, hideCondition?: string, width?: number, styleOptions?: { [key: string]: unknown }) {
		this.group = title
		this.fields = fields
		this.rows = rows
		this.columns = columns
		this.hideCondition = hideCondition
		this.width = width
		this.styleOptions = styleOptions
	}

	static parse(json: { group: string; fields?: Array<Field | Group>; rows?: number; columns?: number; hideCondition?: string; width?: number }): Group {
		return new Group(
			json.group,
			(json.fields || []).map((s: Field | Group) => (s['group'] ? Group.parse(s as Group) : Field.parse(s as Field))),
			json.rows,
			json.columns,
			json.hideCondition,
			json.width,
		)
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
}

export enum StateToUpdate {
	VALUE = 'VALUE',
	VISIBLE = 'VISIBLE',
	OPTIONS = 'OPTIONS',
	READONLY = 'READONLY',
	CLAZZ = 'CLAZZ',
	REQUIRED = 'REQUIRED',
}
