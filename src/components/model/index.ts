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

//Most generic metadata interface
export interface Metadata {
	label: string
	index?: number
	valueDate?: number
	tags?: { id: string }[]
}

export interface FieldMetadata extends Metadata {
	label: string
	index?: number
	valueDate?: number
	owner?: string
	tags?: Code[]

	//The metadata values that are considered as exceptional
	discordantMetadata?: () => Partial<FieldMetadata>
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

export type Position = 'top' | 'left' | 'right' | 'bottom' | 'float' | 'add' | 'remove'

export type Labels = Partial<Record<Position, string>>

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

export type IcureTextFieldSchema = DocumentSchema | TokensSchema | ItemsListSchema | StyledSchema | InlineSchema | DateSchema | TimeSchema | DateTimeSchema | DecimalSchema | MeasureSchema

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

export interface Validator {
	validation: string
	message: string
}

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
	options?: { [_key: string]: unknown }
	labels?: Labels
	value?: string
	unit?: string
	multiline?: boolean
	computedProperties?: { [_key: string]: string }
	validators?: Validator[]
	now?: boolean
	translate?: boolean
	sortOptions?: SortOptions
	width?: number
	styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
	hasOther?: boolean
	event?: string
	payload?: unknown

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
			validators,
			now,
			translate,
			width,
			styleOptions,
			hasOther,
			event,
			payload,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			schema?: IcureTextFieldSchema
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
			now?: boolean
			translate?: boolean
			width?: number
			styleOptions?: { width: number; direction: string; span: number; rows: number; alignItems: string }
			hasOther?: boolean
			event?: string
			payload?: unknown
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
		this.validators = validators
		this.now = now
		this.translate = translate ?? true
		this.width = width
		this.styleOptions = styleOptions
		this.hasOther = hasOther
		this.event = event
		this.payload = payload
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
					action: () => new Button(json.field, { ...json }),
				} as { [key: string]: () => Field }
			)[json.type as string]?.() ?? new TextField(json.field, { ...json })
		)
	}

	// noinspection JSUnusedGlobalSymbols
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
		options: { [_key: string]: unknown } | undefined
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			multiline?: boolean
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			unit?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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
			options?: { [_key: string]: unknown }
			labels?: Labels
			value?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators: options.validators,
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
			validators,
			translate,
			sortOptions,
			width,
			styleOptions,
			hasOther,
		}: {
			shortLabel?: string
			grows?: boolean
			span?: number
			rowSpan?: number
			tags?: string[]
			codifications?: string[]
			readonly?: boolean
			options?: { [_key: string]: unknown }
			value?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
			translate,
			width,
			styleOptions,
			hasOther,
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
			validators,
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
			options?: { [_key: string]: unknown }
			value?: string
			computedProperties?: { [_key: string]: string }
			validators?: Validator[]
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
			validators,
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

export class Button extends Field {
	constructor(label: string, { shortLabel, grows, span, event, payload }: { shortLabel?: string; grows?: boolean; span?: number; rowSpan?: number; event?: string; payload?: unknown }) {
		super('action', label, { shortLabel, grows, span, event, payload })
	}
	override copy(properties: Partial<Button>): Button {
		return new Button(this.field, { ...this, ...properties })
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
	computedProperties?: { [_key: string]: string }
	width?: number
	styleOptions?: { [_key: string]: unknown }

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
			computedProperties?: { [_key: string]: string }
			width?: number
			styleOptions?: { [_key: string]: unknown }
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
		computedProperties?: { [_key: string]: string }
		width?: number
	}): Group {
		return new Group(
			group,
			(fields || []).map((s: Field | Group | Subform) =>
				(s as Group)['group']
					? Group.parse(s as Group)
					: (s as unknown as { subform: string })['subform'] || (s as Subform)['forms'] || (s as Subform)['refs']
					? Subform.parse(s as Subform & { subform: string })
					: Field.parse(s as Field),
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
	refs?: string[]
	forms: { [key: string]: Form }
	span?: number
	rowSpan?: number
	computedProperties?: { [_key: string]: string }
	width?: number
	styleOptions?: { [_key: string]: unknown }
	labels: Labels

	constructor(
		title: string,
		forms: { [key: string]: Form },
		{
			id,
			shortLabel,
			span,
			rowSpan,
			computedProperties,
			width,
			styleOptions,
			refs,
			labels,
		}: {
			id?: string
			shortLabel?: string
			span?: number
			rowSpan?: number
			computedProperties?: { [_key: string]: string }
			width?: number
			styleOptions?: { [_key: string]: unknown }
			refs?: string[]
			labels?: Labels
		},
	) {
		this.id = id || title
		this.shortLabel = shortLabel
		this.forms = forms
		this.span = span
		this.rowSpan = rowSpan
		this.computedProperties = computedProperties
		this.width = width
		this.styleOptions = styleOptions
		this.refs = refs
		this.labels = labels ?? {}
	}

	copy(properties: Partial<Subform>): Subform {
		return new Subform(this.id, this.forms, { ...this, ...properties })
	}

	static parse(json: {
		subform: string
		shortLabel?: string
		forms?: { [key: string]: Form }
		refs?: string[]
		span?: number
		rowSpan?: number
		computedProperties?: { [_key: string]: string }
		width?: number
		styleOptions?: { [_key: string]: unknown }
		labels?: Labels
		id: string
	}): Subform {
		return new Subform(json.subform, json.forms ?? {}, {
			id: json.id,
			shortLabel: json.shortLabel,
			span: json.span,
			computedProperties: json.computedProperties,
			width: json.width,
			styleOptions: json.styleOptions,
			refs: json.refs,
			labels: json.labels,
		})
	}

	toJson(): any {
		return {
			subform: this.id,
			shortLabel: this.shortLabel,
			forms: Object.fromEntries(Object.entries(this.forms).map(([k, f]) => [k, f.toJson()])),
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
				(s as Group)['group']
					? Group.parse(s as Group)
					: (s as unknown as { subform: string })['subform'] || (s as Subform)['forms'] || (s as Subform)['refs']
					? Subform.parse(s as Subform & { subform: string })
					: Field.parse(s as Field),
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
			fields: this.fields.map((f: Field | Group | Subform) => (f && f.toJson ? f.toJson() : JSON.stringify(f))),
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
		return new Codification(
			json.type,
			json.codes.map((code) => {
				const parts = code.id.split('|')
				if (parts.length === 1) {
					return { ...code, id: `${json.type}|${code.id}|1` }
				} else if (parts.length === 2) {
					return { ...code, id: `${code.id}|1` }
				} else {
					return code
				}
			}),
		)
	}

	// noinspection JSUnusedGlobalSymbols
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

	// noinspection JSUnusedGlobalSymbols
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

	static parse(
		json: {
			form: string
			sections: Section[]
			id?: string
			description?: string
			keywords?: string[]
			codifications?: Codification[]
			translations?: TranslationTable[]
			subForms?: { [key: string]: Form }
		},
		library: Form[] = [],
		subforms: { [key: string]: Form } = {},
	): Form {
		const parsed = new Form(
			json.form,
			(json.sections || []).map((s: Section) => Section.parse(s)),
			json.id,
			json.description,
			json.keywords,
			json.codifications?.map((c: Codification) => Codification.parse(c)),
			json.translations?.map((t: TranslationTable) => TranslationTable.parse(t)),
		)

		const allSubforms = { ...subforms, ...(json.subForms || {}) }

		const resolveAndCheckConsistencyInSubForm = (f: Subform, seenSubformId: string[]) => {
			if (seenSubformId.includes(f.id)) {
				throw new Error(`Subform ${f.id} is already declared in this form`)
			}
			seenSubformId.push(f.id)
			Object.entries((f as Subform).forms ?? {}).forEach(([k, subForm]) => {
				f.forms[k] = Form.parse({ ...subForm, id: k }, library, allSubforms)
			})
			;(f as Subform).refs?.forEach((r) => {
				const subForm = allSubforms?.[r]
				const form = subForm ? Form.parse({ ...subForm, id: r }, library, allSubforms) : library.find((f) => f.id === r)
				if (!form) {
					throw new Error(`Subform ${r} not found in top subForms declarations or the provided library of forms`)
				}
				f.forms[r] = form
			})
			Object.entries(f.forms).forEach(([, f]) => resolveAndCheckConsistencyInForm(f, seenSubformId))
		}

		const resolveAndCheckConsistencyInForm = (f: Form, seenSubformId: string[] = []) => {
			f.sections.forEach((s: Section) => {
				s.fields.forEach((f: Field | Group | Subform) => {
					if (f.clazz === 'group') {
						resolveAndCheckConsistencyInGroup(f, seenSubformId)
					} else if (f.clazz === 'subform') {
						resolveAndCheckConsistencyInSubForm(f, seenSubformId)
					}
				})
			})
			return f
		}

		const resolveAndCheckConsistencyInGroup = (g: Group, seenSubformId: string[]) => {
			g.fields?.forEach((f: Field | Group | Subform) => {
				if (f.clazz === 'group') {
					resolveAndCheckConsistencyInGroup(f, seenSubformId)
				} else if (f.clazz === 'subform') {
					resolveAndCheckConsistencyInSubForm(f, seenSubformId)
				}
			})
			return g
		}

		return resolveAndCheckConsistencyInForm(parsed, [])
	}

	// noinspection JSUnusedGlobalSymbols
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
