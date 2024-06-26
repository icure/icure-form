import { DocumentSchema, InlineSchema, StyledSchema } from '../icure-text-field/schema/markdown-schema'
import { TokensSchema } from '../icure-text-field/schema/token-schema'
import { ItemsListSchema } from '../icure-text-field/schema/items-list-schema'
import { DateSchema, DateTimeSchema, TimeSchema } from '../icure-text-field/schema/date-time-schema'
import { DecimalSchema } from '../icure-text-field/schema/decimal-schema'
import { MeasureSchema } from '../icure-text-field/schema/measure-schema'

export interface Code {
	id: string
	label: { [key: string]: string }
}

export interface FieldMetadata {
	label: string
	index?: number
	valueDate?: number
	owner?: string
	tags?: Code[]
}

export interface FieldValue {
	content: { [language: string]: PrimitiveType }
	codes?: Code[]
}

export type PrimitiveType = StringType | NumberType | BooleanType | TimestampType | DateTimeType | MeasureType | CompoundType

export interface StringType {
	type: 'string'
	value: string
}

export interface NumberType {
	type: 'number'
	value: number
}

export interface BooleanType {
	type: 'boolean'
	value: boolean
}

export interface TimestampType {
	type: 'timestamp'
	value: number
}

export interface DateTimeType {
	type: 'datetime'
	value: number
}

export interface MeasureType {
	type: 'measure'
	value?: number
	unit?: string
}

export interface CompoundType {
	type: 'compound'
	value: { [label: string]: PrimitiveType }
}

export interface Labels {
	[position: string]: string
}

export interface SortOptions {
	sort: 'asc' | 'desc' | 'natural'
	promotions?: string
}

export const pteq = (a: PrimitiveType | undefined, b: PrimitiveType | undefined): boolean => {
	if (a === b) {
		return true
	}
	if (a === undefined || b === undefined) {
		return false
	}
	if (a?.type !== b?.type) {
		return false
	}
	if (a.value === b.value && (a.type !== 'measure' || b.type !== 'measure' || a.unit === b.unit)) {
		return true
	}
	if (a.type === 'compound' && b.type === 'compound') {
		return Object.keys(a.value).every((k) => pteq(a.value[k], b.value[k]))
	}
	return false
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
	| 'text-field'
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
	span?: number
	rowSpan?: number
	grows: boolean
	schema?: IcureTextFieldSchema
	tags?: string[]
	codifications?: string[]
	readonly?: boolean
	options?: { [key: string]: unknown }
	labels?: Labels
	value?: string
	unit?: string
	multiline?: boolean
	computedProperties?: { [key: string]: string }
	now?: boolean
	translate?: boolean
	sortOptions?: SortOptions
	width?: number
	styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
	hasOther?: boolean

	label(): string {
		return this.field
	}

	protected constructor(
		type: FieldType,
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			schema,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			multiline,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
			hasOther,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			schema?: IcureTextFieldSchema
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			computedProperties?: { [key: string]: string }
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
			hasOther?: boolean
		},
	) {
		this.field = label
		this.type = type
		this.shortLabel = shortLabel
		this.grows = grows === undefined ? true : grows
		this.span = span
		this.rowSpan = rowSpan
		this.schema = schema
		this.tags = tags
		this.codifications = codifications
		this.readonly = readonly || false
		this.options = options
		this.labels = labels
		this.value = value
		this.unit = unit
		this.multiline = multiline || false
		this.computedProperties = computedProperties
		this.now = now
		this.translate = translate ?? true
		this.width = width
		this.styleOptions = styleOptions
		this.hasOther = hasOther
	}

	abstract copy(properties: Partial<Field>): Field

	static parse(json: Field): Field {
		return (
			(
				{
					'text-field': () => new TextField(json.field, { ...json }),
					'measure-field': () => new MeasureField(json.field, { ...json }),
					'token-field': () => new TokenField(json.field, { ...json }),
					'items-list-field': () => new ItemsListField(json.field, { ...json }),
					'number-field': () => new NumberField(json.field, { ...json }),
					'date-picker': () => new DatePicker(json.field, { ...json }),
					'time-picker': () => new TimePicker(json.field, { ...json }),
					'date-time-picker': () => new DateTimePicker(json.field, { ...json }),
					dropdown: () => new DropdownField(json.field, { ...json }),
					'radio-button': () => new RadioButton(json.field, { ...json }),
					checkbox: () => new CheckBox(json.field, { ...json }),
					label: () => new Label(json.field, { ...json }),
				} as { [key: string]: () => Field }
			)[json.type as string]?.() ?? new TextField(json.field, { ...json })
		)
	}

	toJson(): {
		grows: boolean | undefined
		schema: string | undefined
		span: number | undefined
		codifications: string[] | undefined
		type:
			| 'text-field'
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
		translate: boolean | undefined
		tags: string[] | undefined
		labels: Labels | undefined
		unit: string | undefined
		field: string
		styleOptions: { width: number; direction: string; span: number; rows: number; alignItems: string } | undefined
		sortOptions: SortOptions | undefined
		multiline: boolean | undefined
		now: boolean | undefined
		options: { [key: string]: unknown } | undefined
		width: number | undefined
		shortLabel: string | undefined
		computedProperties: { [key: string]: string } | undefined
		value: string | undefined
	} {
		return {
			field: this.field,
			type: this.type,
			shortLabel: this.shortLabel,
			grows: this.grows,
			span: this.span,
			schema: this.schema?.toString(),
			tags: this.tags,
			codifications: this.codifications,
			options: this.options,
			labels: this.labels,
			value: this.value,
			unit: this.unit,
			multiline: this.multiline,
			computedProperties: this.computedProperties,
			now: this.now,
			translate: this.translate,
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
			grows,
			span,
			rowSpan,
			schema,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			multiline,
			computedProperties,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			schema?: IcureTextFieldSchema
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			computedProperties?: { [key: string]: string }
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('text-field', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			schema: schema || 'styled-text-with-codes',
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			multiline: multiline,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
	}

	override copy(properties: Partial<TextField>): TextField {
		return new TextField(this.field, { ...this, ...properties })
	}
}

export class MeasureField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('measure-field', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<MeasureField>): MeasureField {
		return new MeasureField(this.field, { ...this, ...properties })
	}
}

export class NumberField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('number-field', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<NumberField>): NumberField {
		return new NumberField(this.field, { ...this, ...properties })
	}
}

export class TokenField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('token-field', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<TokenField>): TokenField {
		return new TokenField(this.field, { ...this, ...properties })
	}
}

export class ItemsListField extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('items-list-field', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<ItemsListField>): ItemsListField {
		return new ItemsListField(this.field, { ...this, ...properties })
	}
}

export class DatePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('date-picker', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<DatePicker>): DatePicker {
		return new DatePicker(this.field, { ...this, ...properties })
	}
}

export class TimePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('time-picker', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<TimePicker>): TimePicker {
		return new TimePicker(this.field, { ...this, ...properties })
	}
}

export class DateTimePicker extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [key: string]: string }
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('date-time-picker', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			labels,
			value,
			unit,
			computedProperties,
			now,
			translate,
			width,
			styleOptions,
		})
	}
	override copy(properties: Partial<DateTimePicker>): DateTimePicker {
		return new DateTimePicker(this.field, { ...this, ...properties })
	}
}

export class DropdownField extends Field {
	constructor(
		label: string,
		options: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			labels?: Labels
			value?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			sortOptions?: SortOptions
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('dropdown-field', label, {
			shortLabel: options.shortLabel,
			grows: options.grows,
			span: options.span,
			tags: options.tags,
			codifications: options.codifications,
			options: options.options,
			labels: options.labels,
			value: options.value,
			computedProperties: options.computedProperties,
			translate: options.translate,
			width: options.width,
			styleOptions: options.styleOptions,
		})
		this.sortOptions = options.sortOptions ?? undefined
	}
	override copy(properties: Partial<DropdownField>): DropdownField {
		return new DropdownField(this.field, { ...this, ...properties })
	}
}

export class RadioButton extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			value,
			computedProperties,
			translate,
			sortOptions,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			value?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			sortOptions?: SortOptions
			width?: number
			hasOther?: boolean
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('radio-button', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			value,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
		this.sortOptions = sortOptions ?? undefined
	}
	override copy(properties: Partial<RadioButton>): RadioButton {
		return new RadioButton(this.field, { ...this, ...properties })
	}
}

export class CheckBox extends Field {
	constructor(
		label: string,
		{
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			value,
			computedProperties,
			translate,
			sortOptions,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [key: string]: unknown }
			value?: string
			computedProperties?: { [key: string]: string }
			translate?: boolean
			sortOptions?: SortOptions
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
		},
	) {
		super('checkbox', label, {
			shortLabel,
			grows,
			span,
			rowSpan,
			tags,
			codifications,
			readonly,
			options,
			value,
			computedProperties,
			translate,
			width,
			styleOptions,
		})
		this.sortOptions = sortOptions ?? undefined
	}
	override copy(properties: Partial<CheckBox>): CheckBox {
		return new CheckBox(this.field, { ...this, ...properties })
	}
}
export class Label extends Field {
	constructor(label: string, { shortLabel, grows, span }: { shortLabel?: string; grows?: boolean; span?: number; rowSpan?: number }) {
		super('label', label, { shortLabel, grows, span })
	}
	override copy(properties: Partial<Label>): Label {
		return new Label(this.field, { ...this, ...properties })
	}
}

export class ActionButton extends Field {
	constructor(label: string, { shortLabel, grows, span }: { shortLabel?: string; grows?: boolean; span?: number; rowSpan?: number }) {
		super('action', label, { shortLabel, grows, span })
	}
	override copy(properties: Partial<ActionButton>): ActionButton {
		return new ActionButton(this.field, { ...this, ...properties })
	}
}
export class Group {
	clazz = 'group' as const
	group: string
	borderless: boolean
	translate: boolean
	fields?: Array<Field | Group | Subform>
	span?: number
	rowSpan?: number
	computedProperties?: { [key: string]: string }
	width?: number
	styleOptions?: { [key: string]: unknown }

	constructor(
		title: string,
		fields: Array<Field | Group | Subform>,
		{
			span,
			rowSpan,
			borderless,
			translate,
			computedProperties,
			width,
			styleOptions,
		}: {
			borderless?: boolean
			translate?: boolean
			span?: number
			rowSpan?: number
			computedProperties?: { [key: string]: string }
			width?: number
			styleOptions?: { [key: string]: unknown }
		},
	) {
		this.group = title
		this.fields = fields
		this.borderless = borderless ?? false
		this.translate = translate ?? true
		this.fields = fields
		this.span = span
		this.rowSpan = rowSpan
		this.computedProperties = computedProperties
		this.width = width
		this.styleOptions = styleOptions
	}

	copy(properties: Partial<Group>): Group {
		return new Group(this.group, this.fields ?? [], { ...this, ...properties })
	}

	static parse({
		borderless,
		span,
		computedProperties,
		fields,
		group,
		translate,
		width,
	}: {
		group: string
		fields?: Array<Field | Group | Subform>
		borderless?: boolean
		translate?: boolean
		span?: number
		rowSpan?: number
		computedProperties?: { [key: string]: string }
		width?: number
	}): Group {
		return new Group(
			group,
			(fields || []).map((s: Field | Group | Subform) =>
				(s as Group)['group'] ? Group.parse(s as Group) : (s as Subform)['forms'] ? Subform.parse(s as Subform & { subform: string }) : Field.parse(s as Field),
			),
			{
				span: span,
				borderless: borderless,
				translate: translate,
				computedProperties: computedProperties,
				width: width,
			},
		)
	}

	toJson(): any {
		return {
			group: this.group,
			computedProperties: this.computedProperties,
			fields: this.fields?.map((f: Field | Group) => f.toJson()),
			borderless: this.borderless,
			translatable: this.translate,
			span: this.span,
			width: this.width,
		}
	}
}

export class Subform {
	clazz = 'subform' as const
	id: string
	shortLabel?: string
	forms: { [key: string]: Form }
	span?: number
	rowSpan?: number
	computedProperties?: { [key: string]: string }
	width?: number
	styleOptions?: { [key: string]: unknown }

	constructor(
		title: string,
		forms: { [key: string]: Form },
		{
			shortLabel,
			span,
			rowSpan,
			computedProperties,
			width,
			styleOptions,
		}: {
			shortLabel?: string
			span?: number
			rowSpan?: number
			computedProperties?: { [key: string]: string }
			width?: number
			styleOptions?: { [key: string]: unknown }
		},
	) {
		this.id = title
		this.shortLabel = shortLabel
		this.forms = forms
		this.span = span
		this.rowSpan = rowSpan
		this.computedProperties = computedProperties
		this.width = width
		this.styleOptions = styleOptions
	}

	copy(properties: Partial<Subform>): Subform {
		return new Subform(this.id, this.forms, { ...this, ...properties })
	}

	static parse(json: {
		subform: string
		shortLabel?: string
		forms: { [key: string]: Form }
		span?: number
		rowSpan?: number
		computedProperties?: { [key: string]: string }
		width?: number
		styleOptions?: { [key: string]: unknown }
	}): Subform {
		return new Subform(json.subform, json.forms, {
			shortLabel: json.shortLabel,
			span: json.span,
			computedProperties: json.computedProperties,
			width: json.width,
			styleOptions: json.styleOptions,
		})
	}

	toJson(): any {
		return {
			subform: this.id,
			shortLabel: this.shortLabel,
			forms: this.forms,
			span: this.span,
			computedProperties: this.computedProperties,
			width: this.width,
			styleOptions: this.styleOptions,
		}
	}
}
export class Section {
	section: string
	fields: Array<Field | Group | Subform>
	description?: string
	keywords?: string[]

	constructor(title: string, fields: Array<Field | Group | Subform>, description?: string, keywords?: string[]) {
		this.section = title
		this.fields = fields
		this.description = description
		this.keywords = keywords
	}

	static parse(json: {
		section: string
		fields?: Array<Field | Group | Subform>
		groups?: Array<Field | Group | Subform>
		sections?: Array<Field | Group | Subform>
		description?: string
		keywords?: string[]
	}): Section {
		return new Section(
			json.section,
			(json.fields ?? json.groups ?? json.sections ?? []).map((s: Field | Group | Subform) =>
				(s as Group)['group'] ? Group.parse(s as Group) : (s as Subform)['forms'] ? Subform.parse(s as Subform & { subform: string }) : Field.parse(s as Field),
			),
			json.description,
			json.keywords,
		)
	}

	toJson(): {
		section: string
		keywords?: string[]
		description?: string
		fields: (Field | Group | Subform)[]
	} {
		return {
			section: this.section,
			fields: this.fields.map((f: Field | Group | Subform) => f.toJson()),
			description: this.description,
			keywords: this.keywords,
		}
	}
}

export class Codification {
	type: string
	codes: Code[]

	constructor(type: string, codes: Code[]) {
		this.type = type
		this.codes = codes
	}

	static parse(json: { type: string; codes: Code[] }): Codification {
		return new Codification(json.type, json.codes)
	}

	toJson(): { type: string; codes: Code[] } {
		return {
			type: this.type,
			codes: this.codes,
		}
	}
}

export class TranslationTable {
	language: string
	translations: { [key: string]: string }

	constructor(language: string, translations: { [key: string]: string }) {
		this.language = language
		this.translations = translations
	}

	static parse(json: { language: string; translations: { [key: string]: string } }): TranslationTable {
		return new TranslationTable(json.language, json.translations)
	}

	toJson(): { language: string; translations: { [key: string]: string } } {
		return {
			language: this.language,
			translations: this.translations,
		}
	}
}

export class Form {
	form: string
	sections: Section[]
	id?: string
	description?: string
	keywords?: string[]
	codifications?: Codification[]
	translations?: TranslationTable[]

	constructor(title: string, sections: Section[], id?: string, description?: string, keywords?: string[], codifications?: Codification[], translations?: TranslationTable[]) {
		this.form = title
		this.description = description
		this.id = id
		this.keywords = keywords
		this.sections = sections
		this.codifications = codifications
		this.translations = translations
	}

	static parse(json: {
		form: string
		sections: Section[]
		id?: string
		description?: string
		keywords?: string[]
		codifications?: Codification[]
		translations: TranslationTable[]
	}): Form {
		return new Form(
			json.form,
			(json.sections || []).map((s: Section) => Section.parse(s)),
			json.id,
			json.description,
			json.keywords,
			json.codifications?.map((c: Codification) => Codification.parse(c)),
			json.translations?.map((t: TranslationTable) => TranslationTable.parse(t)),
		)
	}

	toJson(): {
		form: string
		keywords?: string[]
		description?: string
		sections: { section: string; keywords?: string[]; description?: string; fields: any[] }[]
	} {
		return {
			form: this.form,
			sections: this.sections.map((s: Section) => s.toJson()),
			description: this.description,
			keywords: this.keywords,
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
