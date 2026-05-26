import { Field, FieldMetadata, FieldValue, Form, Group, Subform, isVisibleForRole } from '../../../model'
import { FormValuesContainer } from '../../../../generic'

/**
 * A single card in the card renderer's flat sequence.
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
	/** Active viewer role. Sections/groups/fields/subforms whose `roles` does not include this value are skipped. */
	role?: string
}

/**
 * Counts interactive (patient-input) Fields, excluding Labels and read-only display Fields.
 */
function countInteractive(fields: Field[]): number {
	return fields.filter(isInteractive).length
}

/**
 * Sync flatten — role-based visibility only, no computed-hidden evaluation. Used by tests and unit
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
	role?: string
	/**
	 * Counter of currently-active `samePage` Group walks. While > 0, all `commitCard` calls are
	 * suppressed so the group's content accumulates onto the previous card.
	 */
	samePageDepth: number
}

function newCtx(options: FlattenOptions): FlattenCtx {
	const k = clampK(options.questionsPerCard ?? 1)
	return { out: [], current: null, k, role: options.role, samePageDepth: 0 }
}

function clampK(n: number): number {
	if (!Number.isFinite(n)) return 1
	if (n < 1) return 1
	if (n > 2) return 2
	return Math.floor(n)
}

function commitCard(ctx: FlattenCtx): void {
	if (ctx.samePageDepth > 0) return
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
	const isSamePage = !!field.samePage
	// `samePage` suppresses the pre-add boundaries (section/group change, standalone-before, questionsPerCard)
	// so the field joins whatever card is currently open. Boundaries AFTER the field (e.g., standalone) still run.
	if (!isSamePage) {
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
	}
	if (!ctx.current) {
		// `samePage` may arrive after the previous card was already committed (e.g., the field sits
		// inside a fresh Group, whose entry commit closed the previous card). Reopen it so we land
		// on the same card as the previous Field, matching the documented intent.
		if (isSamePage && ctx.out.length > 0) {
			ctx.current = ctx.out.pop() as Card
		} else {
			ctx.current = { sectionTitle, groupTitle, fields: [] }
		}
	}
	ctx.current.fields.push(field)
	// And another fresh card boundary AFTER, so the next field (sibling or not) starts on a new card.
	if (isStandalone) {
		commitCard(ctx)
	}
}

function walkForm(form: Form, ctx: FlattenCtx, visited: Set<Form>): void {
	if (visited.has(form)) {
		console.warn('[card] Cycle detected while recursing through Subform; skipping form', form.form)
		return
	}
	visited.add(form)
	for (const section of form.sections ?? []) {
		if (!isVisibleForRole(section.roles, ctx.role)) continue
		commitCard(ctx) // Section boundary — new section starts a new card context.
		for (const child of section.fields ?? []) {
			walkChild(child, section.section, undefined, ctx, visited)
		}
		commitCard(ctx) // Commit any in-progress card at section close.
	}
	visited.delete(form)
}

function walkChild(child: Field | Group | Subform, sectionTitle: string, groupTitle: string | undefined, ctx: FlattenCtx, visited: Set<Form>): void {
	if (!isVisibleForRole((child as any).roles, ctx.role)) return
	if (isGroup(child)) {
		const nextGroupTitle = groupTitle ? `${groupTitle} / ${child.group}` : child.group
		const groupSamePage = !!child.samePage
		// When `samePage`, do NOT commit before entering — the group's content joins the previous card.
		if (!groupSamePage) commitCard(ctx)
		if (groupSamePage) {
			ctx.samePageDepth++
			// Previous card may already be committed by a section/parent boundary — reopen it.
			if (!ctx.current && ctx.out.length > 0) ctx.current = ctx.out.pop() as Card
		}
		for (const inner of child.fields ?? []) {
			walkChild(inner, sectionTitle, nextGroupTitle, ctx, visited)
		}
		if (groupSamePage) ctx.samePageDepth--
		// Likewise, defer the post-group commit when samePage — the next sibling decides.
		if (!groupSamePage) commitCard(ctx)
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
		console.warn('[card] Button (action) field is not supported in card renderer — skipping', field.field)
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
 * display-only. Buttons never appear in card renderer (filtered earlier).
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
 * Composition rule: a Field is shown iff `isVisibleForRole(roles, role) && !computedHidden`.
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
		console.warn('[card] Cycle detected while recursing through Subform; skipping form', form.form)
		return
	}
	visited.add(form)
	for (const section of form.sections ?? []) {
		if (!isVisibleForRole(section.roles, ctx.role)) continue
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
	if (!isVisibleForRole((child as any).roles, ctx.role)) return
	if (await isComputedHidden(child, container)) return
	if (isGroup(child)) {
		const nextGroupTitle = groupTitle ? `${groupTitle} / ${child.group}` : child.group
		const groupSamePage = !!child.samePage
		if (!groupSamePage) commitCard(ctx)
		if (groupSamePage) {
			ctx.samePageDepth++
			if (!ctx.current && ctx.out.length > 0) ctx.current = ctx.out.pop() as Card
		}
		for (const inner of child.fields ?? []) {
			await walkChildAsync(inner, sectionTitle, nextGroupTitle, ctx, visited, container)
		}
		if (groupSamePage) ctx.samePageDepth--
		if (!groupSamePage) commitCard(ctx)
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
		console.warn('[card] Button (action) field is not supported in card renderer — skipping', field.field)
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
