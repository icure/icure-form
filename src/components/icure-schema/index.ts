import { CSSResultGroup, html, nothing, PropertyValues, svg, TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
// @ts-ignore
import baseCss from '../common/styles/style.scss'
import { Field } from '../common'
import { generateLabels } from '../common/utils'
import { extractSingleValue } from '../icure-form/fields/utils'
import {
	decodeStroke,
	emptySchemaDrawing,
	encodeStroke,
	FieldMetadata,
	FieldValue,
	HIGHLIGHTER_OPACITY,
	isSafeStencilSrc,
	isSchemaColor,
	Labels,
	MAX_PRESSURE,
	PrimitiveType,
	SchemaDrawing,
	schemaDrawingsEqual,
	SchemaPoint,
	simplifyStroke,
	Stencil,
	StencilRef,
	Stroke,
	strokeColor,
	strokeHitTest,
	strokePathData,
} from '../model'
import { Version } from '../../generic'
import { colorNameKey, SchemaKey, schemaText } from './translation-keys'

export { schemaDefaults, schemaText } from './translation-keys'
export type { SchemaKey } from './translation-keys'

/** Resolves stencil ids to stencils. Ids it does not know are left out of the result. */
export type StencilProvider = (ids: string[], language: string) => Promise<Stencil[]>

type Tool = 'pen' | 'highlighter' | 'eraser'
type Confirmation = { kind: 'clear' } | { kind: 'stencil'; stencilId: string }

const DEFAULT_COLORS = ['#1a1a1a', '#d32f2f', '#1976d2', '#388e3c']
const DEFAULT_WIDTHS = [2, 4, 8]
/** Coordinate space of a drawing made without a resolvable stencil. */
const BLANK_SIZE = { width: 800, height: 600 }
/** The highlighter draws this many times wider than the selected width. */
const HIGHLIGHTER_FACTOR = 4
/** Points closer than this to the previous kept point (in drawing units) are dropped: it does not move the line, and keeps drawings small. */
const MIN_POINT_DISTANCE = 1.5
/** Eraser reach beyond a stroke's half width, in screen pixels. */
const ERASER_TOLERANCE_PX = 6
const MAX_UNDO = 100

const pathCache = new WeakMap<Stroke, string>()
const strokePath = (stroke: Stroke): string => {
	let d = pathCache.get(stroke)
	if (d === undefined) {
		d = strokePathData(decodeStroke(stroke))
		pathCache.set(stroke, d)
	}
	return d
}

/** The strokes of a drawing, as Lit SVG templates: values are bound as attributes, never parsed as markup. */
export const renderStrokes = (strokes: Stroke[]) =>
	strokes.map(
		(s) =>
			svg`<path d=${strokePath(s)} fill="none" stroke=${strokeColor(s)} stroke-width=${Number.isFinite(+s.width) ? +s.width : 1} stroke-linecap="round" stroke-linejoin="round" stroke-opacity=${
				s.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : nothing
			}></path>`,
	)

const schemaOf = (content: { [language: string]: PrimitiveType } | undefined, language: string): SchemaDrawing | undefined => {
	const pt = content?.[language] ?? content?.['*'] ?? Object.values(content ?? {}).find((p) => p?.type === 'schema')
	return pt?.type === 'schema' ? pt.value : undefined
}

const labelText = (label: Labels | string | undefined): string | undefined => (typeof label === 'string' ? label : label ? label.float ?? Object.values(label)[0] : undefined)

/**
 * The drawing surface of a `schema-field`: one value, drawn with Pointer Events over a stencil image.
 *
 * Every committed change (a stroke, an erase, undo, redo, clear) goes through `handleValueChanged` once. Until the
 * container reflects it, the drawing is kept locally; while the value's first commit is still creating it (no id
 * yet), later changes wait for the id instead of creating a second value.
 */
export class IcureSchema extends Field {
	@property({ attribute: false }) stencils?: StencilRef[]
	@property() defaultStencil?: string
	@property({ attribute: false }) colors?: string[]
	@property({ attribute: false }) strokeWidths?: number[]
	@property({ attribute: false }) stencilProvider?: StencilProvider

	@state() private resolved: { [id: string]: Stencil | null } = {}
	@state() private stencilsLoading = false
	@state() private failedImages: string[] = []
	@state() private tool: Tool = 'pen'
	@state() private colorIndex = 0
	@state() private widthIndex = 0
	@state() private local?: SchemaDrawing
	@state() private erasePreview?: SchemaDrawing
	@state() private chosenStencil?: string
	@state() private confirmation?: Confirmation
	@state() private focusIndex = 0
	@state() private undoStack: (SchemaDrawing | null)[] = []
	@state() private redoStack: (SchemaDrawing | null)[] = []
	@state() private activeStyle?: { color: string; width: number; tool: Tool }

	private stencilKey?: string
	private resolveSeq = 0
	private pendingCreate = false
	private sendAfterCreate = false
	private recentCommits: SchemaDrawing[] = []
	private pointers = new Map<number, string>()
	private suppressTouch = false
	private drawingPointer?: number
	private drawingPointerType?: string
	private activePoints: SchemaPoint[] = []

	static get styles(): CSSResultGroup[] {
		return [baseCss]
	}

	private t(key: SchemaKey, substitutions?: Record<string, string | number>): string {
		return schemaText(this.translationProvider, this.language(), key, substitutions)
	}

	// ---- Value ----

	private current(): { id?: string; versions?: Version<FieldValue>[]; drawing?: SchemaDrawing; historical: boolean } {
		const [id, versions] = extractSingleValue(this.valueProvider?.())
		const version = this.selectedRevision ? versions?.find((v) => v.revision === this.selectedRevision) ?? versions?.[0] : versions?.[0]
		const historical = !!versions?.length && !!version && version !== versions[0]
		return { id, versions, drawing: schemaOf(version?.value?.content, this.language()), historical }
	}

	/** What is shown: an erase in progress, else a change not yet reflected by the container, else the stored drawing. */
	private displayed(): SchemaDrawing | undefined {
		const { drawing, historical } = this.current()
		return historical ? drawing : this.erasePreview ?? this.local ?? drawing
	}

	private isReadonly(): boolean {
		return this.readonly || this.current().historical
	}

	private send(drawing: SchemaDrawing, id: string | undefined) {
		this.recentCommits = [...this.recentCommits.slice(-19), drawing]
		const language = this.language()
		this.handleValueChanged?.(this.label, language, { content: { [language]: { type: 'schema', value: drawing } } }, id)
	}

	private commit(drawing: SchemaDrawing, recordHistory = true) {
		if (recordHistory) {
			this.undoStack = [...this.undoStack.slice(-(MAX_UNDO - 1)), this.displayed() ?? null]
			this.redoStack = []
		}
		this.local = drawing
		const { id } = this.current()
		if (id) {
			this.send(drawing, id)
		} else if (!this.pendingCreate) {
			this.pendingCreate = true
			this.send(drawing, undefined)
		}
		// Else the value is being created: `updated` sends the latest drawing once its id arrives.
	}

	/** Reconciles the local drawing with what the container now holds. */
	private reconcile() {
		const { id, drawing } = this.current()
		if (this.pendingCreate && id) {
			this.pendingCreate = false
			this.sendAfterCreate = !!this.local && !schemaDrawingsEqual(drawing, this.local)
		}
		if (!this.local) return
		if (schemaDrawingsEqual(drawing, this.local)) {
			this.local = undefined
			this.recentCommits = []
		} else if (!this.pendingCreate && !this.sendAfterCreate && !this.recentCommits.some((c) => schemaDrawingsEqual(c, drawing))) {
			// Not one of ours: the value was changed elsewhere (another device, a formula). It wins.
			this.local = undefined
			this.recentCommits = []
		}
	}

	// ---- Stencils ----

	private stencilRefIds(): string[] {
		return (this.stencils ?? []).map((s) => (typeof s === 'string' ? s : s.id)).filter((id) => !!id)
	}

	private defaultStencilId(): string | null {
		return this.defaultStencil ?? this.stencilRefIds()[0] ?? null
	}

	private async resolveStencils(ids: string[]) {
		const seq = ++this.resolveSeq
		const inline: { [id: string]: Stencil | null } = {}
		for (const ref of this.stencils ?? []) {
			if (typeof ref !== 'string' && ref && isSafeStencilSrc(ref.src) && ref.width > 0 && ref.height > 0) {
				const label = labelText(ref.label)
				inline[ref.id] = { id: ref.id, label: label && this.translate ? this.translationProvider(this.language(), label) : label, src: ref.src, width: ref.width, height: ref.height }
			}
		}
		const wanted = ids.filter((id) => !(id in inline))
		const unresolved = Object.fromEntries(wanted.map((id) => [id, null]))
		if (!wanted.length || !this.stencilProvider) {
			this.resolved = { ...unresolved, ...inline }
			this.stencilsLoading = false
			return
		}
		this.stencilsLoading = true
		let found: Stencil[] = []
		try {
			found = (await this.stencilProvider(wanted, this.language())) ?? []
		} catch {
			found = []
		}
		if (seq !== this.resolveSeq) return
		const valid = (Array.isArray(found) ? found : []).filter((s) => s && wanted.includes(s.id) && isSafeStencilSrc(s.src) && s.width > 0 && s.height > 0)
		this.resolved = { ...unresolved, ...Object.fromEntries(valid.map((s) => [s.id, s])), ...inline }
		this.stencilsLoading = false
	}

	private stencilFor(id: string | null | undefined): Stencil | null {
		return id ? this.resolved[id] ?? null : null
	}

	/** The stencil and coordinate space of what is shown, and of the next stroke. */
	private space(): { requested: string | null; stencil: Stencil | null; stencilId: string | null; width: number; height: number } {
		const drawing = this.displayed()
		if (drawing && (drawing.strokes.length || this.isReadonly())) {
			return { requested: drawing.stencil, stencil: this.stencilFor(drawing.stencil), stencilId: drawing.stencil, width: drawing.width, height: drawing.height }
		}
		const requested = this.chosenStencil ?? drawing?.stencil ?? this.defaultStencilId()
		const stencil = this.stencilFor(requested)
		if (stencil) return { requested, stencil, stencilId: stencil.id, width: stencil.width, height: stencil.height }
		if (drawing && drawing.stencil === requested) return { requested, stencil: null, stencilId: drawing.stencil, width: drawing.width, height: drawing.height }
		return { requested, stencil: null, stencilId: null, ...BLANK_SIZE }
	}

	private stencilLabel(id: string | null): string {
		if (!id) return this.t('schema.blank')
		const stencil = this.stencilFor(id)
		return stencil?.label ?? id
	}

	// ---- Lifecycle ----

	protected willUpdate(changed: PropertyValues) {
		super.willUpdate(changed)
		const stored = this.current().drawing?.stencil
		const ids = Array.from(new Set([...this.stencilRefIds(), ...(this.defaultStencil ? [this.defaultStencil] : []), ...(stored ? [stored] : [])]))
		const key = `${ids.join('\u0000')}|${this.language()}`
		if (key !== this.stencilKey || changed.has('stencilProvider') || changed.has('stencils')) {
			this.stencilKey = key
			void this.resolveStencils(ids)
		}
		if (changed.has('valueProvider')) {
			this.reconcile()
		}
	}

	updated(changed: PropertyValues) {
		super.updated(changed)
		if (this.sendAfterCreate) {
			this.sendAfterCreate = false
			const { id } = this.current()
			if (this.local && id) this.send(this.local, id)
		}
		if (changed.has('confirmation') && this.confirmation) {
			;(this.renderRoot.querySelector('.icure-schema-confirm button') as HTMLElement | null)?.focus()
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		this.pointers.clear()
		this.drawingPointer = undefined
	}

	// ---- Drawing ----

	private canvas(): SVGSVGElement | null {
		return this.renderRoot.querySelector('svg.icure-schema-surface')
	}

	private toDrawing(e: PointerEvent, width: number, height: number, withPressure: boolean): SchemaPoint {
		const rect = this.canvas()?.getBoundingClientRect()
		const x = rect && rect.width ? ((e.clientX - rect.left) * width) / rect.width : 0
		const y = rect && rect.height ? ((e.clientY - rect.top) * height) / rect.height : 0
		const point: SchemaPoint = { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)) }
		if (withPressure) point.p = Math.round(Math.min(1, Math.max(0, e.pressure)) * MAX_PRESSURE)
		return point
	}

	private penDown(): boolean {
		return Array.from(this.pointers.values()).includes('pen')
	}

	private touchCount(): number {
		return Array.from(this.pointers.values()).filter((t) => t === 'touch').length
	}

	private cancelStroke() {
		const pointer = this.drawingPointer
		this.drawingPointer = undefined
		this.drawingPointerType = undefined
		this.activePoints = []
		this.activeStyle = undefined
		this.erasePreview = undefined
		this.updateActivePath()
		if (pointer !== undefined) {
			try {
				this.canvas()?.releasePointerCapture(pointer)
			} catch {
				// The capture was already gone.
			}
		}
	}

	private onPointerDown = (e: PointerEvent) => {
		if (this.isReadonly() || this.stencilsLoading || this.confirmation) return
		if (e.pointerType === 'mouse' && e.button !== 0) return
		this.pointers.set(e.pointerId, e.pointerType)
		if (e.pointerType === 'touch') {
			// Palm rejection: a hand resting on the screen while a pen draws.
			if (this.penDown()) return
			// Two fingers never draw.
			if (this.touchCount() > 1) {
				if (this.drawingPointerType === 'touch') this.cancelStroke()
				this.suppressTouch = true
				return
			}
			if (this.suppressTouch) return
		}
		if (e.pointerType === 'pen' && this.drawingPointerType === 'touch') {
			// The palm landed before the pen.
			this.cancelStroke()
		}
		if (this.drawingPointer !== undefined) return
		e.preventDefault()
		try {
			this.canvas()?.setPointerCapture(e.pointerId)
		} catch {
			// Synthetic events have no active pointer to capture.
		}
		this.drawingPointer = e.pointerId
		this.drawingPointerType = e.pointerType
		const { width, height } = this.space()
		if (this.tool === 'eraser') {
			this.erasePreview = this.displayed() ?? undefined
			this.eraseAt(e)
			return
		}
		const colors = this.palette()
		const widths = this.widths()
		const baseWidth = widths[Math.min(this.widthIndex, widths.length - 1)]
		this.activeStyle = {
			tool: this.tool,
			color: colors[Math.min(this.colorIndex, colors.length - 1)],
			width: this.tool === 'highlighter' ? baseWidth * HIGHLIGHTER_FACTOR : baseWidth,
		}
		this.activePoints = [this.toDrawing(e, width, height, e.pointerType === 'pen')]
		this.updateActivePath()
	}

	private onPointerMove = (e: PointerEvent) => {
		if (e.pointerId !== this.drawingPointer) return
		e.preventDefault()
		const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
		const samples = events.length ? events : [e]
		if (this.tool === 'eraser') {
			samples.forEach((s) => this.eraseAt(s))
			return
		}
		const { width, height } = this.space()
		const withPressure = this.drawingPointerType === 'pen'
		for (const sample of samples) {
			const point = this.toDrawing(sample, width, height, withPressure)
			const last = this.activePoints[this.activePoints.length - 1]
			if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_POINT_DISTANCE) this.activePoints.push(point)
		}
		this.updateActivePath()
	}

	private onPointerUp = (e: PointerEvent) => {
		this.pointers.delete(e.pointerId)
		if (!this.touchCount()) this.suppressTouch = false
		if (e.pointerId !== this.drawingPointer) return
		if (this.tool === 'eraser') {
			const preview = this.erasePreview
			this.cancelStroke()
			if (preview && preview.strokes.length !== (this.displayedWithoutPreview()?.strokes.length ?? 0)) this.commit(preview)
			return
		}
		const { width, height, stencilId } = this.space()
		const withPressure = this.drawingPointerType === 'pen'
		const end = this.toDrawing(e, width, height, withPressure)
		const last = this.activePoints[this.activePoints.length - 1]
		if (last && (end.x !== last.x || end.y !== last.y) && Math.hypot(end.x - last.x, end.y - last.y) >= 0.5) this.activePoints.push(end)
		const style = this.activeStyle
		const points = this.activePoints
		this.cancelStroke()
		if (!style || !points.length || style.tool === 'eraser') return
		const stroke: Stroke = {
			tool: style.tool,
			color: style.color,
			width: style.width,
			points: encodeStroke(simplifyStroke(points), withPressure),
			...(withPressure ? { pressure: true as const } : {}),
		}
		const base = this.displayed()
		const drawing = base?.strokes.length ? base : emptySchemaDrawing(stencilId, width, height)
		this.chosenStencil = undefined
		this.commit({ ...drawing, strokes: [...drawing.strokes, stroke] })
	}

	private onPointerCancel = (e: PointerEvent) => {
		this.pointers.delete(e.pointerId)
		if (!this.touchCount()) this.suppressTouch = false
		if (e.pointerId === this.drawingPointer) this.cancelStroke()
	}

	private displayedWithoutPreview(): SchemaDrawing | undefined {
		const { drawing, historical } = this.current()
		return historical ? drawing : this.local ?? drawing
	}

	private eraseAt(e: PointerEvent) {
		const preview = this.erasePreview
		if (!preview?.strokes.length) return
		const rect = this.canvas()?.getBoundingClientRect()
		const point = this.toDrawing(e, preview.width, preview.height, false)
		const tolerance = rect?.width ? (ERASER_TOLERANCE_PX * preview.width) / rect.width : ERASER_TOLERANCE_PX
		const kept = preview.strokes.filter((s) => !strokeHitTest(s, point, tolerance))
		if (kept.length !== preview.strokes.length) this.erasePreview = { ...preview, strokes: kept }
	}

	private updateActivePath() {
		const path = this.renderRoot?.querySelector('path.icure-schema-active') as SVGPathElement | null
		path?.setAttribute('d', strokePathData(this.activePoints))
	}

	// ---- Actions ----

	private palette(): string[] {
		const colors = (this.colors ?? []).filter(isSchemaColor).map((c) => c.toLowerCase())
		return colors.length ? colors : DEFAULT_COLORS
	}

	private widths(): number[] {
		const widths = (this.strokeWidths ?? []).filter((w) => typeof w === 'number' && Number.isFinite(w) && w > 0)
		return widths.length ? widths : DEFAULT_WIDTHS
	}

	private emptyLike(drawing: SchemaDrawing | undefined): SchemaDrawing {
		const { stencilId, width, height } = this.space()
		return drawing ? { ...drawing, strokes: [] } : emptySchemaDrawing(stencilId, width, height)
	}

	private undo() {
		if (this.isReadonly() || !this.undoStack.length) return
		const previous = this.undoStack[this.undoStack.length - 1]
		const current = this.displayed()
		this.undoStack = this.undoStack.slice(0, -1)
		this.redoStack = [...this.redoStack, current ?? null]
		this.commit(previous ?? this.emptyLike(current), false)
	}

	private redo() {
		if (this.isReadonly() || !this.redoStack.length) return
		const next = this.redoStack[this.redoStack.length - 1]
		const current = this.displayed()
		this.redoStack = this.redoStack.slice(0, -1)
		this.undoStack = [...this.undoStack, current ?? null]
		this.commit(next ?? this.emptyLike(current), false)
	}

	private requestClear() {
		if (this.isReadonly() || !this.displayed()?.strokes.length) return
		this.confirmation = { kind: 'clear' }
	}

	private requestStencil(stencilId: string) {
		if (this.isReadonly() || stencilId === this.space().requested) return
		if (this.displayed()?.strokes.length) {
			this.confirmation = { kind: 'stencil', stencilId }
		} else {
			this.chosenStencil = stencilId
		}
	}

	private confirm() {
		const confirmation = this.confirmation
		this.confirmation = undefined
		if (!confirmation) return
		if (confirmation.kind === 'clear') {
			this.commit(this.emptyLike(this.displayed()))
		} else {
			// The coordinate space changes with the stencil: the drawing starts over on the new one.
			this.chosenStencil = confirmation.stencilId
			const stencil = this.stencilFor(confirmation.stencilId)
			this.commit(stencil ? emptySchemaDrawing(stencil.id, stencil.width, stencil.height) : emptySchemaDrawing(null, BLANK_SIZE.width, BLANK_SIZE.height))
		}
	}

	private cancelConfirmation() {
		this.confirmation = undefined
		;(this.renderRoot.querySelector('[role="toolbar"] [tabindex="0"]') as HTMLElement | null)?.focus()
	}

	private onKeyDown = (e: KeyboardEvent) => {
		if (this.isReadonly()) return
		const mod = e.ctrlKey || e.metaKey
		if (mod && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault()
			e.shiftKey ? this.redo() : this.undo()
		} else if (mod && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault()
			this.redo()
		} else if (e.key === 'Escape' && this.confirmation) {
			e.preventDefault()
			this.cancelConfirmation()
		}
	}

	private onToolbarKeyDown = (e: KeyboardEvent) => {
		const items = Array.from(this.renderRoot.querySelectorAll('[role="toolbar"] [data-roving]')) as HTMLElement[]
		if (!items.length) return
		const index = Math.max(0, items.indexOf(e.target as HTMLElement))
		const next =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? (index + 1) % items.length
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
				? (index - 1 + items.length) % items.length
				: e.key === 'Home'
				? 0
				: e.key === 'End'
				? items.length - 1
				: undefined
		if (next === undefined) return
		e.preventDefault()
		this.focusIndex = next
		items[next].focus()
	}

	// ---- Rendering ----

	private summary(drawing: SchemaDrawing | undefined, stencilId: string | null): string {
		const stencil = this.stencilLabel(stencilId)
		const strokes = drawing?.strokes ?? []
		if (!strokes.length) return this.t('schema.summary-empty', { stencil })
		const names = Array.from(new Set(strokes.map((s) => this.t(colorNameKey(strokeColor(s))))))
		let colors = names.join(', ')
		try {
			colors = new (Intl as any).ListFormat(this.language(), { type: 'conjunction' }).format(names)
		} catch {
			// Keep the plain list.
		}
		return strokes.length === 1 ? this.t('schema.summary-one', { stencil, colors }) : this.t('schema.summary', { stencil, count: strokes.length, colors })
	}

	private colorLabel(color: string, colors: string[]): string {
		const name = this.t(colorNameKey(color))
		return colors.filter((c) => colorNameKey(c) === colorNameKey(color)).length > 1 ? `${name} ${color}` : name
	}

	private renderToolbar(drawing: SchemaDrawing | undefined, requested: string | null): TemplateResult {
		const colors = this.palette()
		const widths = this.widths()
		const stencilIds = this.stencilRefIds()
		const itemCount = 3 + colors.length + widths.length + 3 + (stencilIds.length > 1 ? stencilIds.length : 0)
		const focused = Math.min(this.focusIndex, itemCount - 1)
		let index = 0
		const roving = () => {
			const i = index++
			return { tabindex: i === focused ? '0' : '-1', i }
		}
		const radio = (checked: boolean, label: string, onSelect: () => void, content: TemplateResult, extraClass = '') => {
			const r = roving()
			return html`<button
				type="button"
				class="icure-schema-tool ${extraClass}"
				role="radio"
				data-roving
				aria-checked="${checked ? 'true' : 'false'}"
				aria-label="${label}"
				title="${label}"
				tabindex="${r.tabindex}"
				@focus="${() => (this.focusIndex = r.i)}"
				@click="${onSelect}"
			>
				${content}
			</button>`
		}
		const action = (label: string, enabled: boolean, onActivate: () => void, content: TemplateResult, extraClass = '') => {
			const r = roving()
			return html`<button
				type="button"
				class="icure-schema-tool ${extraClass}"
				data-roving
				aria-label="${label}"
				title="${label}"
				aria-disabled="${enabled ? nothing : 'true'}"
				tabindex="${r.tabindex}"
				@focus="${() => (this.focusIndex = r.i)}"
				@click="${() => enabled && onActivate()}"
			>
				${content}
			</button>`
		}
		const icon = (d: string) => html`<svg class="icure-schema-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"></path></svg>`
		const hasStrokes = !!drawing?.strokes.length
		return html`<div class="icure-schema-toolbar" role="toolbar" aria-label="${this.t('schema.toolbar')}" @keydown="${this.onToolbarKeyDown}">
			<div class="icure-schema-group" role="radiogroup" aria-label="${this.t('schema.tool')}">
				${radio(
					this.tool === 'pen',
					this.t('schema.pen'),
					() => (this.tool = 'pen'),
					icon('M3 21l3.8-1 11-11-2.8-2.8-11 11L3 21zM16.4 4.6l2.8 2.8 1.4-1.4a1 1 0 000-1.4l-1.4-1.4a1 1 0 00-1.4 0l-1.4 1.4z'),
				)}
				${radio(this.tool === 'highlighter', this.t('schema.highlighter'), () => (this.tool = 'highlighter'), icon('M4 20h16v2H4zM6 17l3-9 6 0 3 9zM10 6l1-4h2l1 4z'))}
				${radio(
					this.tool === 'eraser',
					this.t('schema.eraser'),
					() => (this.tool = 'eraser'),
					icon('M15.1 3.6l5.3 5.3a2 2 0 010 2.8L12 20H7l-3.4-3.4a2 2 0 010-2.8L12.3 3.6a2 2 0 012.8 0zM6 15l3 3h2l1.5-1.5-4.2-4.2z'),
				)}
			</div>
			<div class="icure-schema-group" role="radiogroup" aria-label="${this.t('schema.color')}">
				${colors.map((c, i) =>
					radio(
						i === Math.min(this.colorIndex, colors.length - 1),
						this.colorLabel(c, colors),
						() => (this.colorIndex = i),
						html`<span class="icure-schema-swatch" style="background-color: ${c}" aria-hidden="true"></span>`,
					),
				)}
			</div>
			<div class="icure-schema-group" role="radiogroup" aria-label="${this.t('schema.width')}">
				${widths.map((w, i) =>
					radio(
						i === Math.min(this.widthIndex, widths.length - 1),
						this.t('schema.width-value', { width: w }),
						() => (this.widthIndex = i),
						html`<span class="icure-schema-width" style="width: ${Math.min(18, Math.max(2, w))}px; height: ${Math.min(18, Math.max(2, w))}px" aria-hidden="true"></span>`,
					),
				)}
			</div>
			<div class="icure-schema-group">
				${action(this.t('schema.undo'), this.undoStack.length > 0, () => this.undo(), icon('M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0120.4 16l2.4-.8A10.5 10.5 0 0012.5 8z'))}
				${action(this.t('schema.redo'), this.redoStack.length > 0, () => this.redo(), icon('M11.5 8c2.6 0 5 1 6.9 2.6L22 7v9h-9l3.6-3.6A8 8 0 003.6 16l-2.4-.8A10.5 10.5 0 0111.5 8z'))}
				${action(this.t('schema.clear'), hasStrokes, () => this.requestClear(), icon('M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'))}
			</div>
			${stencilIds.length > 1
				? html`<div class="icure-schema-group" role="radiogroup" aria-label="${this.t('schema.stencil')}">
						${stencilIds.map((id) =>
							radio(id === requested, this.stencilLabel(id), () => this.requestStencil(id), html`<span class="icure-schema-stencil-name">${this.stencilLabel(id)}</span>`, 'icure-schema-tool--text'),
						)}
				  </div>`
				: nothing}
		</div>`
	}

	private renderConfirmation(): TemplateResult | typeof nothing {
		const confirmation = this.confirmation
		if (!confirmation) return nothing
		const message = confirmation.kind === 'clear' ? this.t('schema.clear-confirm') : this.t('schema.stencil-confirm')
		return html`<div class="icure-schema-confirm" role="group" aria-labelledby="confirm-message">
			<span id="confirm-message">${message}</span>
			<button type="button" class="icure-schema-confirm-yes" @click="${() => this.confirm()}">${this.t('schema.confirm')}</button>
			<button type="button" class="icure-schema-confirm-no" @click="${() => this.cancelConfirmation()}">${this.t('schema.cancel')}</button>
		</div>`
	}

	override renderSync({ validationErrors }: { validationErrors: [FieldMetadata, string][] }): TemplateResult {
		if (!this.visible) {
			return html``
		}
		const { id, versions } = this.current()
		const readonly = this.isReadonly()
		const drawing = this.displayed()
		const { requested, stencil, stencilId, width, height } = this.space()
		const showImage = !!stencil && !this.failedImages.includes(stencil.id)
		const unavailable = !!requested && !this.stencilsLoading && !showImage
		const rev = (this.selectedRevision ? versions?.find((v) => v.revision === this.selectedRevision) : versions?.[0])?.revision
		const metadata = id && rev !== undefined ? this.metadataProvider?.(id, versions?.map((v) => v.revision) ?? [])?.[id]?.find((m) => m.revision === rev)?.value : undefined
		const invalid = validationErrors.length > 0
		const style = this.activeStyle

		return html`<div class="icure-text-field icure-schema-field ${readonly ? 'readonly' : ''}" @keydown="${this.onKeyDown}">
			<div class="icure-label-extra">
				${generateLabels(this.displayedLabels ?? {}, this.language(), this.translate ? this.translationProvider : undefined, this.labelId)}
				${this.displayMetadata && metadata
					? html`<icure-metadata-buttons-bar
							.metadata="${metadata}"
							.revision="${rev}"
							.versions="${versions ?? []}"
							.valueId="${id}"
							.defaultLanguage="${this.defaultLanguage}"
							.selectedLanguage="${this.selectedLanguage}"
							.languages="${this.languages}"
							.handleMetadataChanged="${this.handleMetadataChanged}"
							.handleLanguageSelected="${(iso: string) => (this.selectedLanguage = iso)}"
							.handleRevisionSelected="${(rev: string) => (this.selectedRevision = rev)}"
							.ownersProvider="${this.ownersProvider}"
							.translationProvider="${this.translationProvider}"
					  ></icure-metadata-buttons-bar>`
					: nothing}
			</div>
			${readonly ? nothing : this.renderToolbar(drawing, requested)} ${readonly ? nothing : this.renderConfirmation()}
			<div class="icure-schema-canvas" style="--icure-schema-ratio: ${width / height}; aspect-ratio: ${width} / ${height}">
				${showImage && stencil
					? html`<img class="icure-schema-stencil" src="${stencil.src}" alt="" draggable="false" @error="${() => (this.failedImages = [...this.failedImages, stencil.id])}" />`
					: nothing}
				<svg
					class="icure-schema-surface"
					viewBox="0 0 ${width} ${height}"
					preserveAspectRatio="none"
					role="img"
					aria-labelledby="${this.labelId}"
					aria-describedby="${invalid ? 'summary errors' : 'summary'}"
					aria-invalid="${invalid ? 'true' : nothing}"
					@pointerdown="${this.onPointerDown}"
					@pointermove="${this.onPointerMove}"
					@pointerup="${this.onPointerUp}"
					@pointercancel="${this.onPointerCancel}"
					@lostpointercapture="${this.onPointerCancel}"
				>
					${renderStrokes(drawing?.strokes ?? [])}
					<path
						class="icure-schema-active"
						d=""
						fill="none"
						stroke="${style?.color ?? 'none'}"
						stroke-width="${style?.width ?? 0}"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-opacity="${style?.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : nothing}"
					></path>
				</svg>
			</div>
			${unavailable ? html`<div class="icure-schema-notice">${this.t('schema.stencil-unavailable')}</div>` : nothing}
			<span id="summary" class="icure-schema-summary" aria-live="polite"
				>${this.summary(drawing, stencilId)}${this.required ? html`<span class="icure-schema-required">, ${this.t('schema.required')}</span>` : nothing}</span
			>
			<div id="errors" class="error">${validationErrors.map(([, error]) => html` <div>${this.translationProvider?.(this.language(), error) ?? error}</div>`)}</div>
		</div>`
	}
}
