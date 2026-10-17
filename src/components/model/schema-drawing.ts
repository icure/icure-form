/**
 * The stored value of a `schema-field`: a freehand vector drawing over a background image (a Stencil).
 *
 * Everything in this module is pure and DOM-free — no lit, no `document`, no `localStorage` — so that hosts can
 * parse drawings and build SVGs for printing, PDFs and thumbnails in Node or in a worker. Import it through the
 * model entry point (`@icure/form/components/model`), not the package root: the root reads `localStorage` when it
 * loads.
 */
import type { Labels } from './index'

/** A background image a schema is drawn on, as resolved by the host's `stencilProvider`. */
export interface Stencil {
	id: string
	label?: string
	/** URL or `data:` URI of the image. */
	src: string
	/** Natural size of the image, in pixels. It is the coordinate space of the drawings made on it. */
	width: number
	height: number
	mime?: string
}

/** A stencil declared inline in a form definition, instead of an id the host resolves. */
export interface InlineStencil {
	id: string
	label?: Labels | string
	src: string
	width: number
	height: number
}

/** A stencil reference of a field definition: an id the host resolves, or an inline stencil. */
export type StencilRef = string | InlineStencil

export interface Stroke {
	/** The eraser removes whole strokes; it is not stored. */
	tool: 'pen' | 'highlighter'
	/** `#rrggbb` */
	color: string
	/** In drawing units. */
	width: number
	/**
	 * The stroke's points: base64 of a little-endian Int16 array. The first point is absolute, every next one is a
	 * delta from the previous. A point is `x,y` or, when `pressure` is set, `x,y,pressure` (pressure 0–1023).
	 */
	points: string
	/** Set when every point of `points` carries a pressure value. */
	pressure?: true
}

export interface SchemaDrawing {
	format: 'icure-schema'
	v: 1
	/** The id of the stencil drawn on (an inline stencil's own id), or `null` for a blank canvas. */
	stencil: string | null
	/** The drawing's coordinate space: the stencil's natural size. */
	width: number
	height: number
	strokes: Stroke[]
}

export interface SchemaPoint {
	x: number
	y: number
	/** Pressure, 0–1023. */
	p?: number
}

export const SCHEMA_DRAWING_FORMAT = 'icure-schema'
export const SCHEMA_DRAWING_VERSION = 1
/** Pressure values are stored as integers in 0..MAX_PRESSURE. */
export const MAX_PRESSURE = 1023
/** Translucency of the highlighter. */
export const HIGHLIGHTER_OPACITY = 0.35

const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const MAX_COORDINATE = 32767

export const isSchemaColor = (color: unknown): color is string => typeof color === 'string' && COLOR_RE.test(color)

export const emptySchemaDrawing = (stencil: string | null, width: number, height: number): SchemaDrawing => ({
	format: SCHEMA_DRAWING_FORMAT,
	v: SCHEMA_DRAWING_VERSION,
	stencil,
	width,
	height,
	strokes: [],
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
	}
	return btoa(binary)
}

const base64ToBytes = (b64: string): Uint8Array => {
	const binary = atob(b64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

/**
 * Encodes points into a stroke's `points` string. Coordinates are rounded to integer drawing units; pressure is kept
 * only when `withPressure` (by default: when every point has one).
 */
export const encodeStroke = (points: SchemaPoint[], withPressure: boolean = points.length > 0 && points.every((p) => p.p !== undefined)): string => {
	const stride = withPressure ? 3 : 2
	const view = new DataView(new ArrayBuffer(points.length * stride * 2))
	let px = 0
	let py = 0
	let pp = 0
	points.forEach((point, i) => {
		const x = clamp(Math.round(point.x), 0, MAX_COORDINATE)
		const y = clamp(Math.round(point.y), 0, MAX_COORDINATE)
		const offset = i * stride * 2
		view.setInt16(offset, x - px, true)
		view.setInt16(offset + 2, y - py, true)
		px = x
		py = y
		if (withPressure) {
			const p = clamp(Math.round(point.p ?? MAX_PRESSURE / 2), 0, MAX_PRESSURE)
			view.setInt16(offset + 4, p - pp, true)
			pp = p
		}
	})
	return bytesToBase64(new Uint8Array(view.buffer))
}

const strictDecode = (points: string, withPressure: boolean): SchemaPoint[] | null => {
	if (typeof points !== 'string' || !BASE64_RE.test(points)) return null
	let bytes: Uint8Array
	try {
		bytes = base64ToBytes(points)
	} catch {
		return null
	}
	const stride = withPressure ? 3 : 2
	if (bytes.length % (stride * 2) !== 0) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const result: SchemaPoint[] = []
	let x = 0
	let y = 0
	let p = 0
	for (let offset = 0; offset < bytes.length; offset += stride * 2) {
		x += view.getInt16(offset, true)
		y += view.getInt16(offset + 2, true)
		if (withPressure) {
			p += view.getInt16(offset + 4, true)
			result.push({ x, y, p })
		} else {
			result.push({ x, y })
		}
	}
	return result
}

/** Decodes a stroke's points. Returns an empty list for anything it cannot read; never throws. */
export const decodeStroke = (stroke: Pick<Stroke, 'points' | 'pressure'>): SchemaPoint[] => strictDecode(stroke?.points, !!stroke?.pressure) ?? []

const parseStroke = (raw: unknown): Stroke | null => {
	if (!raw || typeof raw !== 'object') return null
	const s = raw as { [key: string]: unknown }
	if (s.tool !== 'pen' && s.tool !== 'highlighter') return null
	if (!isSchemaColor(s.color)) return null
	if (typeof s.width !== 'number' || !Number.isFinite(s.width) || s.width <= 0) return null
	if (s.pressure !== undefined && s.pressure !== true) return null
	if (typeof s.points !== 'string' || !strictDecode(s.points, !!s.pressure)) return null
	return { tool: s.tool, color: s.color.toLowerCase(), width: s.width, points: s.points, ...(s.pressure ? { pressure: true } : {}) }
}

/**
 * Reads a drawing from a parsed object or from its JSON text. Tolerant: returns `null` for anything it cannot read —
 * garbage, another `format`, a future version, a malformed stroke — and never throws.
 */
export const parseSchemaDrawing = (input: unknown): SchemaDrawing | null => {
	try {
		const raw = typeof input === 'string' ? JSON.parse(input) : input
		if (!raw || typeof raw !== 'object') return null
		const d = raw as { [key: string]: unknown }
		if (d.format !== SCHEMA_DRAWING_FORMAT || d.v !== SCHEMA_DRAWING_VERSION) return null
		if (d.stencil !== null && typeof d.stencil !== 'string') return null
		if (typeof d.width !== 'number' || typeof d.height !== 'number' || !(d.width > 0) || !(d.height > 0) || d.width > MAX_COORDINATE || d.height > MAX_COORDINATE) return null
		if (!Array.isArray(d.strokes)) return null
		const strokes = d.strokes.map(parseStroke)
		if (strokes.some((s) => s === null)) return null
		return { format: SCHEMA_DRAWING_FORMAT, v: SCHEMA_DRAWING_VERSION, stencil: d.stencil, width: d.width, height: d.height, strokes: strokes as Stroke[] }
	} catch {
		return null
	}
}

/** Structural equality of two drawings. */
export const schemaDrawingsEqual = (a: SchemaDrawing | undefined | null, b: SchemaDrawing | undefined | null): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	return (
		a.stencil === b.stencil &&
		a.width === b.width &&
		a.height === b.height &&
		a.strokes.length === b.strokes.length &&
		a.strokes.every((s, i) => {
			const t = b.strokes[i]
			return s.tool === t.tool && s.color === t.color && s.width === t.width && s.points === t.points && !!s.pressure === !!t.pressure
		})
	)
}

/**
 * The SVG path of a stroke's points, lightly smoothed: quadratic curves through the midpoints of consecutive
 * points, which keeps the line within half a segment of what was drawn. A single point draws a dot (the path's
 * round line caps make it visible).
 */
export const strokePathData = (points: SchemaPoint[]): string => {
	if (!points.length) return ''
	const f = (n: number) => `${Math.round(n * 10) / 10}`
	if (points.length === 1) return `M${f(points[0].x)} ${f(points[0].y)}L${f(points[0].x)} ${f(points[0].y)}`
	if (points.length === 2) return `M${f(points[0].x)} ${f(points[0].y)}L${f(points[1].x)} ${f(points[1].y)}`
	let d = `M${f(points[0].x)} ${f(points[0].y)}`
	for (let i = 1; i < points.length - 1; i++) {
		const mx = (points[i].x + points[i + 1].x) / 2
		const my = (points[i].y + points[i + 1].y) / 2
		d += `Q${f(points[i].x)} ${f(points[i].y)} ${f(mx)} ${f(my)}`
	}
	const last = points[points.length - 1]
	return d + `L${f(last.x)} ${f(last.y)}`
}

/** The display colour of a stroke: its own when well-formed, black otherwise. */
export const strokeColor = (stroke: Stroke): string => (isSchemaColor(stroke.color) ? stroke.color : '#000000')

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** `true` for a stencil source that is safe to reference from an image element: an http(s), relative or `data:image/` URL. */
export const isSafeStencilSrc = (src: unknown): src is string => {
	if (typeof src !== 'string' || !src) return false
	const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(src.trim())?.[1]?.toLowerCase()
	return scheme === undefined || scheme === 'http' || scheme === 'https' || (scheme === 'data' && /^data:image\//i.test(src.trim()))
}

const num = (n: number) => `${Number.isFinite(n) ? n : 0}`

/**
 * A standalone SVG document of the drawing, over the stencil when one is given and its source is safe. For printing,
 * PDFs and thumbnails; every value placed in it is validated or escaped.
 */
export const schemaDrawingToSvg = (drawing: SchemaDrawing, stencil?: Stencil | null): string => {
	const width = num(drawing.width)
	const height = num(drawing.height)
	const image = stencil && isSafeStencilSrc(stencil.src) ? `<image href="${escapeXml(stencil.src)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>` : ''
	const paths = (drawing.strokes ?? [])
		.map((stroke) => {
			const d = strokePathData(decodeStroke(stroke))
			if (!d) return ''
			const opacity = stroke.tool === 'highlighter' ? ` stroke-opacity="${HIGHLIGHTER_OPACITY}"` : ''
			return `<path d="${escapeXml(d)}" fill="none" stroke="${escapeXml(strokeColor(stroke))}" stroke-width="${num(+stroke.width)}" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`
		})
		.join('')
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${image}${paths}</svg>`
}

/** Distance from `p` to the segment `a`–`b`. */
const distanceToSegment = (p: SchemaPoint, a: SchemaPoint, b: SchemaPoint): number => {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len2 = dx * dx + dy * dy
	const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1)
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Drops the points that lie within `tolerance` drawing units of the line through their neighbours (Ramer–Douglas–
 * Peucker). With the default sub-unit tolerance no line moves by more than the integer rounding of the encoding
 * already does, while nearly straight runs shrink to a few points. A point whose pressure departs from its neighbours'
 * by more than `pressureTolerance` is kept too. The first and last points are always kept.
 */
export const simplifyStroke = (points: SchemaPoint[], tolerance = 0.75, pressureTolerance = 48): SchemaPoint[] => {
	if (points.length <= 2) return points.slice()
	const keep = new Uint8Array(points.length)
	keep[0] = 1
	keep[points.length - 1] = 1
	const stack: [number, number][] = [[0, points.length - 1]]
	while (stack.length) {
		const [first, last] = stack.pop() as [number, number]
		let farthest = -1
		let distance = tolerance
		const p0 = points[first].p
		const p1 = points[last].p
		for (let i = first + 1; i < last; i++) {
			let d = distanceToSegment(points[i], points[first], points[last])
			const p = points[i].p
			if (p !== undefined && p0 !== undefined && p1 !== undefined && Math.abs(p - (p0 + ((p1 - p0) * (i - first)) / (last - first))) > pressureTolerance) {
				d = Math.max(d, tolerance + 1)
			}
			if (d > distance) {
				distance = d
				farthest = i
			}
		}
		if (farthest >= 0) {
			keep[farthest] = 1
			stack.push([first, farthest], [farthest, last])
		}
	}
	return points.filter((_, i) => keep[i])
}

/** `true` when `point` lies on the stroke, within `tolerance` drawing units beyond its half width. */
export const strokeHitTest = (stroke: Stroke, point: SchemaPoint, tolerance = 0): boolean => {
	const points = decodeStroke(stroke)
	const reach = stroke.width / 2 + tolerance
	if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach
	for (let i = 1; i < points.length; i++) {
		if (distanceToSegment(point, points[i - 1], points[i]) <= reach) return true
	}
	return false
}
