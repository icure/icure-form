import { Field, FieldMetadata, FieldValue, Form, Group, Subform } from '../../../model'
import { FormValuesContainer } from '../../../../generic'

/**
 * A single card in the patient-cards renderer's flat sequence.
 *
 * `fields` may contain a mix of interactive Fields, Labels, and read-only display Fields. Only
 * interactive Fields count toward `questionsPerCard`; Labels and read-only displays are visual
 * content that attach to the surrounding card.
 */
export interface Card {
	sectionTitle: string
	groupTitle?: string
	fields: Field[]
}

/**
 * Options shared by the sync and async flatten variants.
 */
export interface FlattenOptions {
	/** Maximum interactive Fields per card. Default 1. Capped at 2 by the renderer prop. */
	questionsPerCard?: number
}

/**
 * Counts interactive (patient-input) Fields, excluding Labels and read-only display Fields.
 */
function countInteractive(fields: Field[]): number {
	return fields.filter(isInteractive).length
}

/**
 * Sync flatten — hiddenForPatient only, no computed-hidden evaluation. Used by tests and unit
 * helpers where no FormValuesContainer is available.
 *
 * Honours `questionsPerCard` chunking and Label / readonly attachment semantics.
 */
export function flatten(form: Form, options: FlattenOptions = {}): Card[] {
	const ctx = newCtx(options)
	const visited = new Set<Form>()
	walkForm(form, ctx, visited)
	commitCard(ctx)
	return ctx.out
}

interface FlattenCtx {
	out: Card[]
	current: Card | null
	k: number
}

function newCtx(options: FlattenOptions): FlattenCtx {
	const k = clampK(options.questionsPerCard ?? 1)
	return { out: [], current: null, k }
}

function clampK(n: number): number {
	if (!Number.isFinite(n)) return 1
	if (n < 1) return 1
	if (n > 2) return 2
	return Math.floor(n)
}

function commitCard(ctx: FlattenCtx): void {
	if (ctx.current && ctx.current.fields.length > 0) {
		ctx.out.push(ctx.current)
	}
	ctx.current = null
}

function shouldStartNewCardForContext(ctx: FlattenCtx, sectionTitle: string, groupTitle: string | undefined): boolean {
	if (!ctx.current) return true
	return ctx.current.sectionTitle !== sectionTitle || ctx.current.groupTitle !== groupTitle
}

function addFieldToCurrent(ctx: FlattenCtx, field: Field, sectionTitle: string, groupTitle: string | undefined): void {
	const interactive = isInteractive(field)
	const isStandalone = !!field.standalone
	if (shouldStartNewCardForContext(ctx, sectionTitle, groupTitle)) {
		commitCard(ctx)
	}
	// Standalone fields force a fresh card boundary BEFORE themselves so they never share with a sibling.
	if (isStandalone && ctx.current && ctx.current.fields.length > 0) {
		commitCard(ctx)
	}
	if (interactive && ctx.current && countInteractive(ctx.current.fields) >= ctx.k) {
		commitCard(ctx)
	}
	if (!ctx.current) {
		ctx.current = { sectionTitle, groupTitle, fields: [] }
	}
	ctx.current.fields.push(field)
	// And another fresh card boundary AFTER, so the next field (sibling or not) starts on a new card.
	if (isStandalone) {
		commitCard(ctx)
	}
}

function walkForm(form: Form, ctx: FlattenCtx, visited: Set<Form>): void {
	if (visited.has(form)) {
		console.warn('[patient-cards] Cycle detected while recursing through Subform; skipping form', form.form)
		return
	}
	visited.add(form)
	for (const section of form.sections ?? []) {
		if (section.hiddenForPatient) continue
		commitCard(ctx) // Section boundary — new section starts a new card context.
		for (const child of section.fields ?? []) {
			walkChild(child, section.section, undefined, ctx, visited)
		}
		commitCard(ctx) // Commit any in-progress card at section close.
	}
	visited.delete(form)
}

function walkChild(child: Field | Group | Subform, sectionTitle: string, groupTitle: string | undefined, ctx: FlattenCtx, visited: Set<Form>): void {
	if ((child as any).hiddenForPatient) return
	if (isGroup(child)) {
		const nextGroupTitle = groupTitle ? `${groupTitle} / ${child.group}` : child.group
		commitCard(ctx) // Group boundary — start fresh group context.
		for (const inner of child.fields ?? []) {
			walkChild(inner, sectionTitle, nextGroupTitle, ctx, visited)
		}
		commitCard(ctx)
		return
	}
	if (isSubform(child)) {
		const inner = child.forms ?? {}
		for (const subform of Object.values(inner)) {
			walkForm(subform, ctx, visited)
		}
		return
	}
	// It's a Field.
	const field = child
	if (field.type === 'action') {
		console.warn('[patient-cards] Button (action) field is not supported in patient renderer — skipping', field.field)
		return
	}
	addFieldToCurrent(ctx, field, sectionTitle, groupTitle)
}

function isGroup(c: Field | Group | Subform): c is Group {
	return (c as Group).clazz === 'group'
}

function isSubform(c: Field | Group | Subform): c is Subform {
	return (c as Subform).clazz === 'subform'
}

/**
 * Interactive = "counts toward questionsPerCard". Labels are visual content; readonly Fields are
 * display-only. Buttons never appear in patient renderer (filtered earlier).
 */
export function isInteractive(f: Field): boolean {
	if (f.type === 'label') return false
	if (f.type === 'action') return false
	if (f.readonly) return false
	return true
}

/**
 * Async flatten with computed-`hidden` evaluation. The primary entry point used by the renderer.
 *
 * Composition rule: a Field is shown iff `!hiddenForPatient && !computedHidden`.
 */
export async function flattenWithVisibility(form: Form, container?: FormValuesContainer<FieldValue, FieldMetadata>, options: FlattenOptions = {}): Promise<Card[]> {
	const ctx = newCtx(options)
	const visited = new Set<Form>()
	await walkFormAsync(form, ctx, visited, container)
	commitCard(ctx)
	return ctx.out
}

async function walkFormAsync(form: Form, ctx: FlattenCtx, visited: Set<Form>, container?: FormValuesContainer<FieldValue, FieldMetadata>): Promise<void> {
	if (visited.has(form)) {
		console.warn('[patient-cards] Cycle detected while recursing through Subform; skipping form', form.form)
		return
	}
	visited.add(form)
	for (const section of form.sections ?? []) {
		if (section.hiddenForPatient) continue
		commitCard(ctx)
		for (const child of section.fields ?? []) {
			await walkChildAsync(child, section.section, undefined, ctx, visited, container)
		}
		commitCard(ctx)
	}
	visited.delete(form)
}

async function walkChildAsync(
	child: Field | Group | Subform,
	sectionTitle: string,
	groupTitle: string | undefined,
	ctx: FlattenCtx,
	visited: Set<Form>,
	container?: FormValuesContainer<FieldValue, FieldMetadata>,
): Promise<void> {
	if ((child as any).hiddenForPatient) return
	if (await isComputedHidden(child, container)) return
	if (isGroup(child)) {
		const nextGroupTitle = groupTitle ? `${groupTitle} / ${child.group}` : child.group
		commitCard(ctx)
		for (const inner of child.fields ?? []) {
			await walkChildAsync(inner, sectionTitle, nextGroupTitle, ctx, visited, container)
		}
		commitCard(ctx)
		return
	}
	if (isSubform(child)) {
		const inner = child.forms ?? {}
		for (const subform of Object.values(inner)) {
			await walkFormAsync(subform, ctx, visited, container)
		}
		return
	}
	const field = child
	if (field.type === 'action') {
		console.warn('[patient-cards] Button (action) field is not supported in patient renderer — skipping', field.field)
		return
	}
	addFieldToCurrent(ctx, field, sectionTitle, groupTitle)
}

async function isComputedHidden(node: Field | Group | Subform, container?: FormValuesContainer<FieldValue, FieldMetadata>): Promise<boolean> {
	const expr = (node as any).computedProperties?.hidden
	if (!expr || !container) return false
	try {
		const result = await (container as any).compute?.(expr)
		return !!result?.value
	} catch {
		return false
	}
}
