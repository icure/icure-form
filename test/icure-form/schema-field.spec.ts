import { DecryptedContact, DecryptedContent, DecryptedForm, DecryptedService } from '@icure/cardinal-sdk'
import {
	decodeStroke,
	encodeStroke,
	Field,
	FieldValue,
	Form,
	parseSchemaDrawing,
	pteq,
	SchemaDrawing,
	SchemaField,
	SchemaPoint,
	schemaDrawingToSvg,
	simplifyStroke,
	Stroke,
} from '../../src/components/model'
import { contentToPrimitiveType, primitiveTypeToContent } from '../../src/icure/icure-utils'
import { BridgedFormValuesContainer, ContactFormValuesContainer } from '../../src/icure'
import { makeInterpreter } from '../../src/utils/interpreter'
import { getRevisionsFilter } from '../../src/utils/fields-values-provider'
import { isBlankPrimitive, isEmptyFieldValues, VALUE_BEARING_FIELD_TYPES } from '../../src/utils/field-emptiness'
import { parsePrimitive } from '../../src/utils/primitive'

const definition = {
	field: 'Schéma',
	type: 'schema-field',
	shortLabel: 'Schéma visage',
	span: 24,
	rowSpan: 3,
	stencils: ['face', { id: 'custom', label: { float: 'Custom' }, src: 'data:image/png;base64,AAAA', width: 300, height: 200 }],
	defaultStencil: 'face',
	colors: ['#1a1a1a', '#d32f2f', '#1976d2', '#388e3c'],
	strokeWidths: [2, 4, 8],
	tags: ['SK-NATURE|observation|1'],
	codifications: ['CD-ITEM'],
	labels: { float: 'Schéma' },
	computedProperties: { hidden: 'return false' },
	validators: [{ validation: 'return false', message: 'never' }],
	readonly: true,
	required: true,
	roles: ['practitioner'],
	alwaysVisible: true,
	samePage: true,
	options: { foo: 'bar' },
}

const drawing = (strokes: Stroke[] = [], stencil: string | null = 'face'): SchemaDrawing => ({ format: 'icure-schema', v: 1, stencil, width: 600, height: 800, strokes })

const pen = (points: SchemaPoint[], color = '#d32f2f'): Stroke => ({ tool: 'pen', color, width: 4, points: encodeStroke(points, false) })

describe('schema-field definition', () => {
	it('parses as a SchemaField, not a text field', () => {
		const field = Field.parse(definition as any) as SchemaField
		expect(field).toBeInstanceOf(SchemaField)
		expect(field.type).toBe('schema-field')
		expect(VALUE_BEARING_FIELD_TYPES.has('schema-field')).toBe(true)
	})

	it('round-trips every definition key through toJson', () => {
		const field = Field.parse(definition as any) as SchemaField
		const json = field.toJson() as any
		for (const [key, value] of Object.entries(definition)) {
			expect([key, json[key]]).toEqual([key, value])
		}
		const again = Field.parse(json) as SchemaField
		expect(again.toJson()).toEqual(json)
	})

	it('emits the schema keys only when they are set', () => {
		const json = Field.parse({ field: 'Plain', type: 'schema-field' } as any).toJson() as any
		for (const key of ['stencils', 'defaultStencil', 'colors', 'strokeWidths', 'readonly', 'required', 'validators', 'rowSpan']) {
			expect(key in json).toBe(false)
		}
	})

	it('keeps every key through copyIfNeeded', () => {
		const field = Field.parse(definition as any) as SchemaField
		const copy = field.copyIfNeeded({ span: 12 }) as SchemaField
		expect(copy).not.toBe(field)
		expect(copy.span).toBe(12)
		const { span, ...rest } = copy.toJson() as any
		const { span: originalSpan, ...originalRest } = field.toJson() as any
		expect(span).toBe(12)
		expect(originalSpan).toBe(24)
		expect(rest).toEqual(originalRest)
		expect(field.copyIfNeeded({ span: 24 })).toBe(field)
	})

	it('parses inside a form', () => {
		const form = Form.parse({ form: 'F', sections: [{ section: 'S', fields: [definition as any] }] } as any)
		expect(form.sections[0].fields[0]).toBeInstanceOf(SchemaField)
	})
})

describe('stroke encoding', () => {
	it('round-trips points, including negative deltas', () => {
		const points = [
			{ x: 100, y: 200 },
			{ x: 90, y: 250 },
			{ x: 0, y: 0 },
			{ x: 599, y: 799 },
			{ x: 598, y: 10 },
		]
		expect(decodeStroke({ points: encodeStroke(points) })).toEqual(points)
	})

	it('round-trips pressure', () => {
		const points = [
			{ x: 10, y: 10, p: 512 },
			{ x: 12, y: 9, p: 1023 },
			{ x: 14, y: 9, p: 0 },
		]
		const encoded = encodeStroke(points)
		expect(decodeStroke({ points: encoded, pressure: true })).toEqual(points)
	})

	it('rounds coordinates to drawing units', () => {
		expect(decodeStroke({ points: encodeStroke([{ x: 1.4, y: 2.6 }]) })).toEqual([{ x: 1, y: 3 }])
	})

	it('is little-endian', () => {
		const bytes = Buffer.from(encodeStroke([{ x: 0x0102, y: 3 }]), 'base64')
		expect(Array.from(bytes)).toEqual([0x02, 0x01, 0x03, 0x00])
	})

	it('decodes garbage as no points', () => {
		expect(decodeStroke({ points: '%%%' })).toEqual([])
		expect(decodeStroke({ points: 'AAA=' })).toEqual([])
		expect(decodeStroke(undefined as any)).toEqual([])
	})

	it('keeps a typical drawing under 20 KB', () => {
		// 50 freehand strokes of about 160 drawing units, sampled every 2 units as the editor keeps them, half with pen pressure.
		const strokes = Array.from({ length: 50 }, (_, s): Stroke => {
			const raw = Array.from({ length: 80 }, (_, i) => ({ x: 100 + i * 2, y: 100 + s * 12 + Math.sin(i / 12) * 15, p: 500 + Math.round(Math.sin(i / 20) * 100) }))
			const withPressure = s % 2 === 1
			const points = simplifyStroke(withPressure ? raw : raw.map(({ x, y }) => ({ x, y })))
			return { tool: 'pen', color: '#1976d2', width: 4, points: encodeStroke(points, withPressure), ...(withPressure ? { pressure: true as const } : {}) }
		})
		const json = JSON.stringify(drawing(strokes))
		expect(new TextEncoder().encode(json).length).toBeLessThan(20 * 1024)
	})

	it('simplifies without moving the line by more than the tolerance', () => {
		const raw = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.sin(i / 30) * 40 + 100 }))
		const simplified = simplifyStroke(raw)
		expect(simplified.length).toBeLessThan(raw.length / 4)
		expect(simplified[0]).toEqual(raw[0])
		expect(simplified[simplified.length - 1]).toEqual(raw[raw.length - 1])
	})
})

describe('parseSchemaDrawing', () => {
	const valid = drawing([pen([{ x: 1, y: 2 }])])

	it('reads a drawing and its JSON text', () => {
		expect(parseSchemaDrawing(valid)).toEqual(valid)
		expect(parseSchemaDrawing(JSON.stringify(valid))).toEqual(valid)
	})

	it('returns null on anything it cannot read, without throwing', () => {
		for (const input of [
			undefined,
			null,
			42,
			'garbage',
			'{',
			[],
			{},
			{ ...valid, format: 'other' },
			{ ...valid, v: 2 },
			{ ...valid, width: -1 },
			{ ...valid, stencil: 3 },
			{ ...valid, strokes: 'x' },
		]) {
			expect(parseSchemaDrawing(input)).toBeNull()
		}
	})

	it('refuses a malformed stroke', () => {
		expect(parseSchemaDrawing({ ...valid, strokes: [{ ...valid.strokes[0], color: 'red' }] })).toBeNull()
		expect(parseSchemaDrawing({ ...valid, strokes: [{ ...valid.strokes[0], tool: 'eraser' }] })).toBeNull()
		expect(parseSchemaDrawing({ ...valid, strokes: [{ ...valid.strokes[0], points: '!!' }] })).toBeNull()
		expect(parseSchemaDrawing({ ...valid, strokes: [{ ...valid.strokes[0], width: 0 }] })).toBeNull()
	})
})

describe('schemaDrawingToSvg', () => {
	it('draws every stroke over the stencil', () => {
		const svg = schemaDrawingToSvg(
			drawing([
				pen([
					{ x: 1, y: 2 },
					{ x: 5, y: 6 },
				]),
				{ ...pen([{ x: 3, y: 3 }]), tool: 'highlighter' },
			]),
			{
				id: 'face',
				src: 'https://example.org/face.png',
				width: 600,
				height: 800,
			},
		)
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"')).toBe(true)
		expect(svg).toContain('<image href="https://example.org/face.png"')
		expect(svg.match(/<path /g)?.length).toBe(2)
		expect(svg).toContain('stroke-opacity="0.35"')
	})

	it('escapes the stencil source and drops unsafe ones', () => {
		const svg = schemaDrawingToSvg(drawing(), { id: 'x', src: 'https://e.org/a.png?"><script>alert(1)</script>&b=1', width: 1, height: 1 })
		expect(svg).not.toContain('<script>')
		expect(svg).toContain('&quot;&gt;&lt;script&gt;')
		expect(schemaDrawingToSvg(drawing(), { id: 'x', src: 'javascript:alert(1)', width: 1, height: 1 })).not.toContain('<image')
	})

	it('never places an unvalidated colour or width', () => {
		const evil = { ...pen([{ x: 1, y: 1 }]), color: '"/><script>x</script>', width: '"/><g' as any }
		const svg = schemaDrawingToSvg(drawing([evil]))
		expect(svg).not.toContain('<script>')
		expect(svg).not.toContain('<g')
		expect(svg).toContain('stroke="#000000"')
	})
})

describe('the schema primitive', () => {
	const a = drawing([pen([{ x: 1, y: 2 }])])

	it('is blank without strokes', () => {
		expect(isBlankPrimitive({ type: 'schema', value: drawing() })).toBe(true)
		expect(isBlankPrimitive({ type: 'schema', value: a })).toBe(false)
		expect(isEmptyFieldValues({ s: [{ revision: '1', modified: 0, value: { content: { fr: { type: 'schema', value: drawing() } } } }] } as any)).toBe(true)
	})

	it('compares structurally', () => {
		expect(pteq({ type: 'schema', value: a }, { type: 'schema', value: JSON.parse(JSON.stringify(a)) })).toBe(true)
		expect(pteq({ type: 'schema', value: a }, { type: 'schema', value: drawing() })).toBe(false)
		expect(pteq({ type: 'schema', value: a }, { type: 'schema', value: { ...a, stencil: 'body-male' } })).toBe(false)
	})

	it('shows formulas the stencil and the stroke count only', () => {
		expect(parsePrimitive({ type: 'schema', value: a })).toEqual({ stencil: 'face', strokes: 1 })
		expect(parsePrimitive({ type: 'schema', value: a }, true)).toBe('1')
	})
})

describe('Cardinal mapping', () => {
	const value = drawing([
		pen([
			{ x: 1, y: 2 },
			{ x: 30, y: 40 },
		]),
		{ ...pen([{ x: 5, y: 5, p: 10 }]), points: encodeStroke([{ x: 5, y: 5, p: 10 }], true), pressure: true },
	])

	it('writes the UTF-8 JSON to binaryValue and reads it back', () => {
		const content = primitiveTypeToContent('fr', { type: 'schema', value })
		expect(content.binaryValue).toBeInstanceOf(Int8Array)
		expect(content.documentId).toBeUndefined()
		expect(JSON.parse(new TextDecoder().decode(new Uint8Array(content.binaryValue!.buffer, content.binaryValue!.byteOffset, content.binaryValue!.byteLength)))).toEqual(value)
		expect(contentToPrimitiveType('fr', content)).toEqual({ type: 'schema', value })
	})

	it('survives the SDK JSON serialisation', () => {
		const content = primitiveTypeToContent('fr', { type: 'schema', value })
		const back = DecryptedContent.fromJSON(JSON.parse(JSON.stringify(content.toJSON())))
		expect(contentToPrimitiveType('fr', back)).toEqual({ type: 'schema', value })
	})

	it('keeps reading any other binary as no value', () => {
		expect(contentToPrimitiveType('fr', new DecryptedContent({ binaryValue: new Int8Array([1, 2, 3]) }))).toBeUndefined()
		const otherJson = new TextEncoder().encode(JSON.stringify({ format: 'other', v: 1 }))
		expect(contentToPrimitiveType('fr', new DecryptedContent({ binaryValue: new Int8Array(otherJson.buffer) }))).toBeUndefined()
		expect(contentToPrimitiveType('fr', new DecryptedContent({ stringValue: 'text', binaryValue: new Int8Array([1]) }))).toEqual({ type: 'string', value: 'text' })
	})
})

describe('BridgedFormValuesContainer', () => {
	let ordinal = 0
	const serviceFactory = (label: string, serviceId?: string) => new DecryptedService({ id: serviceId ?? `s-${++ordinal}`, label, created: Date.now(), modified: Date.now(), content: {} })

	const makeBridged = async (onChange: (c: BridgedFormValuesContainer) => void) => {
		const contactFormValuesContainer = new ContactFormValuesContainer(
			new DecryptedForm({ id: 'form-id', formTemplateId: 'tpl', descr: 'Form' }),
			new DecryptedContact({ id: 'c1', created: Date.now(), services: [], subContacts: [] }),
			[],
			serviceFactory,
			[],
			async () => new DecryptedForm({ id: 'x' }),
			async () => undefined,
			[],
			undefined,
			true,
		)
		const bridged = await new BridgedFormValuesContainer(
			'me',
			contactFormValuesContainer,
			makeInterpreter(),
			undefined,
			() => [],
			() => [],
			() => [],
			'fr',
			[],
			{},
		).init()
		bridged.registerChangeListener((c) => onChange(c as BridgedFormValuesContainer))
		return bridged
	}

	it('stores a drawing as the bytes of a service content', async () => {
		let updated: BridgedFormValuesContainer | undefined
		const bridged = await makeBridged((c) => (updated = c))
		const value = drawing([pen([{ x: 1, y: 2 }])])
		const fv: FieldValue = { content: { fr: { type: 'schema', value } } }
		bridged.setValue('Schéma', 'fr', fv, undefined, { label: 'Schéma', tags: [{ id: 'SK-NATURE|observation|1' }] })
		expect(updated).toBeDefined()
		const services = updated!.getContactFormValuesContainer().currentContact.services ?? []
		expect(services).toHaveLength(1)
		const content = services[0].content?.fr
		expect(content?.binaryValue).toBeInstanceOf(Int8Array)
		expect(parseSchemaDrawing(new TextDecoder().decode(new Uint8Array(content!.binaryValue!.buffer, content!.binaryValue!.byteOffset, content!.binaryValue!.byteLength)))).toEqual(value)
		const values = updated!.getValues(getRevisionsFilter({ label: () => 'Schéma', tags: ['SK-NATURE|observation|1'] } as any))
		expect(Object.values(values)[0]?.[0]?.value?.content?.fr).toEqual({ type: 'schema', value })
	})

	it('refuses a schema value that is not a drawing', async () => {
		const bridged = await makeBridged(() => undefined)
		expect(() => bridged.setValue('Schéma', 'fr', { content: { fr: { type: 'schema', value: { format: 'nope' } as any } } }, undefined, { label: 'Schéma' })).toThrow(/icure-schema/)
	})
})
