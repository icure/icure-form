# PRD: Hide empty fields in read-only rendering

> Status: draft, grilled 2026-09-07; amended the same day during plan grilling (tabs always shown, see decision 12). Vocabulary recorded in [CONTEXT.md](../CONTEXT.md) under "Read-only review".
> Companion: none yet. Implementation plan to follow once this PRD is published as a GitHub issue.

## Summary

Add a host-set display prop `hideEmptyFields` to `<icure-form>`. When the form is rendered read-only with this prop on, the `form` and `form:tab` renderers omit every field that holds no displayable answer, and drop groups, subform instances and, in the plain `form` layout, sections that end up with nothing to show. In `form:tab` the tab bar is untouched: an inactive section is never evaluated, so its tab always stays. Form authors can mark a Field, Group, Subform or Section `alwaysVisible` to exempt it. Nothing about the stored data changes: this is a view filter over values the host has already loaded.

## Problem

A consultation form is authored to cover everything a clinician might record, so most of its fields stay empty in any given Contact. When a healthcare party later reviews that Contact in a timeline, a consultation summary, or a print view, the read-only form is dominated by blank boxes and headings with nothing under them. Today the host has no way to obtain a compact view short of re-implementing rendering, and the library's visibility rules (`roles`, computed `hidden`) are all decided from the definition and formulas, never from whether a field was answered.

## Personas

- **Primary: a healthcare party reviewing a past Contact.** A `DataOwner` who already holds the `SecureDelegation` on the Contact, reading it in a timeline, summary or print view in the host application. This persona sets `readonly` and `hideEmptyFields` together.
- **Form author.** Writes the YAML/JSON definition and decides which absences must stay visible via `alwaysVisible`.
- **Not targeted this iteration:** a patient reading their own completed form in a portal, and a third-party report or export generator. Both would work with the same prop but drove no decision here.

## Goals

1. A read-only `form` or `form:tab` rendering with `hideEmptyFields` shows only answered fields and the containers needed to frame them.
2. Form authors can keep a specific field or block visible even when empty.
3. Rendering with the prop off is unchanged, byte for byte.

## Decisions

Each decision was taken during the grilling; the alternative rejected is named so it is not re-litigated.

| # | Decision | Rejected |
|---|---|---|
| 1 | `hideEmptyFields` is a `<icure-form>` prop set by the host, sibling of `readonly` and `displayMetadata`. Never serialized in the Form definition. | Form-model property; both with override. Whether empties are noise depends on the viewing situation, not on the questionnaire. |
| 2 | Honoured only while `readonly` is `true`; silently ignored otherwise. | Applying in edit mode, immediate or deferred on blur. Hiding empties removes the fields the user needs to fill. |
| 3 | Emptiness is semantic across all languages (see "Emptiness predicate"). | Structural "no value ids" (leaves persisted blank strings, unit-less measures and empty compounds visible as blank boxes). Displayed-language only (would hide an answer written in another language). |
| 4 | Full upward cascade: labels and buttons never count as content; empty groups, subform instances, subform headings and, in plain `form`, sections are dropped. | Fields only; cascade stopping at sections. A heading over nothing is the clutter being removed. |
| 5 | When nothing survives, the element renders nothing and emits no signal. | Exported emptiness predicate; placeholder text; fallback to the full form. |
| 6 | Authors get a per-element exemption, `alwaysVisible`. | No override (record absences as explicit values); host-side allow-list. |
| 7 | `alwaysVisible` is allowed on Field, Group, Subform and Section. An exempt empty field renders as a blank read-only box; an exempt container with no surviving content renders its title only. Either counts as surviving content. | Field only; containers only. |
| 8 | Names: `hideEmptyFields` and `alwaysVisible`. `alwaysVisible` does not override `roles` or computed `hidden`. | `showWhenEmpty`, `keepWhenEmpty`, `compact`. |
| 9 | `alwaysVisible` may be computed via `computedProperties.alwaysVisible` on Field, Group and Subform. Section is static only. | Static everywhere; adding computed properties to Section. |
| 10 | Primary reader is a healthcare party `DataOwner` reviewing a Contact. No PHI or audit change. | Patient or exporter as primary persona. |
| 11 | Success is zero regression with the prop off plus exact behavior on fixtures with it on. | Adoption or performance targets. |
| 12 | In `form:tab`, inactive sections are never evaluated: no values read, no formulas computed. Tabs are therefore always shown; an all-empty active tab shows an empty page. Survival is decided by render-and-observe, never by a pre-pass. | A resolution pre-pass over all sections feeding the tab bar. Rejected because it evaluates inactive sections, which is a hard constraint of the tab layout. |

## Functional requirements

### R1. The `hideEmptyFields` prop

- Boolean property on `<icure-form>`, default `false`, documented next to `readonly` and `displayMetadata` in the README renderer-props list.
- Effective only when `readonly` is `true`. When `readonly` is `false` the prop has no effect and produces no warning.
- Honoured by the `form` and `form:tab` renderers. The card renderer ignores it.
- Re-evaluated on every render pass, exactly as computed `hidden` is today, so a host that swaps the values container sees the visible set update.

### R2. Emptiness predicate

A value-bearing Field (text, measure, token, items-list, number, date, time, date-time, dropdown, radio, checkbox) is **empty** when either holds:

- it has no value ids after the same revisions filter the field's own value provider uses; or
- for every value id, the most recent version has no codes **and** no content entry, in any language, whose primitive is non-blank.

Non-blank per primitive type:

| Type | Non-blank when |
|---|---|
| `string` | trimmed length > 0 |
| `number` | value is a defined, non-NaN number |
| `boolean` | value is defined (`false` is an answer) |
| `timestamp`, `datetime` | value is defined |
| `measure` | `value` is a defined, non-NaN number; a unit alone does not count |
| `compound` | at least one member is non-blank, applying these rules recursively |

Consequences the tests must pin down:

- Preserved-but-invalid date or time text is a non-blank string, so the field stays visible with its warning.
- An answer written only in a language other than the displayed one keeps the field visible.
- Label and action Fields carry no value and are outside the predicate; they survive only through their container.
- The predicate must be a single shared function used by both renderers' code paths so tests and rendering cannot diverge.

### R3. Cascade

With `hideEmptyFields` active, an element **survives** when it is a non-empty value-bearing Field, or it is marked `alwaysVisible` (static or computed truthy), or it is a container with at least one surviving child.

- **Field:** rendered if it survives; otherwise omitted.
- **Group:** rendered with its title and surviving children if any child survives. If no child survives and the group is `alwaysVisible`, rendered as title only (bordered or borderless as authored). Otherwise omitted, together with its labels and buttons.
- **Subform instance:** rendered if any field in the embedded form survives; otherwise omitted. The subform heading is rendered if at least one instance survives or the Subform is `alwaysVisible`; otherwise omitted. (The "add" button is already absent in read-only mode.)
- **Section, plain `form`:** rendered if any child survives, or if the Section is `alwaysVisible`. Otherwise omitted. A Section has no visible title of its own in this layout, so an `alwaysVisible` empty Section renders nothing visible.
- **Section, `form:tab`:** the tab bar is not affected. Every Section keeps its tab. The active Section renders its surviving content, or an empty page when nothing survives. `alwaysVisible` on a Section is therefore meaningful only in plain `form`.
- **Whole form:** in plain `form`, when no Section survives the element renders nothing. In `form:tab` the tab bar remains and the active page is empty. No event, attribute or placeholder is emitted in either case.

**Hard constraint:** an inactive Section in `form:tab` is never evaluated. No value is read and no formula is computed for it. Survival is decided while rendering the active content (render-and-observe), never by a pre-pass over the definition. Note: at the time of writing the renderer builds every Section's templates before the tab wrapper discards the inactive ones, so inactive Sections' computed properties are evaluated today. Implementing this PRD includes making section rendering genuinely lazy (ADR 0001).

`roles` and computed `hidden` are applied first and are unaffected: an element they hide is never a candidate for survival, `alwaysVisible` or not.

### R4. The `alwaysVisible` flag

- Optional boolean on Field, Group, Subform and Section. Default `false`. Parsed by the corresponding `parse()` and written back by `toJson()`, following the `roles` and `standalone` precedents.
- On Field, Group and Subform it may also be supplied as `computedProperties.alwaysVisible`, evaluated per render and merged like every other computed property. On Section it is static only.
- Has no effect while `hideEmptyFields` is inactive.
- Does not override `roles` or computed `hidden`.

### R5. Tab bar in `form:tab`

Unchanged. The bar keeps listing every Section from the definition. (It also keeps ignoring `roles` today; fixing that is a separate, static, section-level change and is not part of this PRD.)

## Security, PHI, audit, jurisdiction

- The filter reads only the values the host's `FormValuesContainer` already exposes for rendering. No additional data is fetched or decrypted.
- No change to `SecureDelegation`, to who is a `DataOwner`, or to `AccessLog` behaviour. The renderer does not write access logs today and this does not change that.
- `alwaysVisible` cannot surface anything `roles` or computed `hidden` conceals, so role-based restriction is preserved.
- No jurisdiction-specific behaviour: hiding a blank box does not alter what is recorded, retained or consented.

## Success criteria

1. With `hideEmptyFields` off, the full existing test suite passes unchanged and rendering is identical.
2. Unit tests for the emptiness predicate cover every primitive type in R2, including empty string, unit-only measure, empty compound, multi-language content, `false` boolean and preserved invalid date text.
3. Rendering tests on fixture forms cover: each value-bearing field type empty and filled; a group emptied entirely with and without `alwaysVisible`; a subform with zero and one surviving instance; a section emptied entirely with and without `alwaysVisible` in plain `form`; the same section in `form:tab` keeping its tab and showing an empty page, with the inactive sections' formulas provably not evaluated; computed `alwaysVisible` toggling with a value change; `roles`-hidden element marked `alwaysVisible` staying hidden; the whole form empty rendering nothing; the prop set while `readonly` is false having no effect.
4. `Form.parse` and `toJson` round-trip `alwaysVisible` at all four levels.
5. The demo app exposes a toggle for `hideEmptyFields` on a read-only sample so the behaviour can be checked by hand.

## Non-goals

### Deferred (likely to return, one-line rationale each)

- **Exported emptiness predicate or whole-form-empty signal.** Declined so the library stays free of host-side API for this iteration; revisit if a timeline host needs to skip empty forms without rendering them.
- **Host-side allow-list of fields to keep.** Declined in favour of authored `alwaysVisible`; revisit if a host needs per-session exceptions the author did not foresee.
- **Special rendering of an `alwaysVisible` empty field** such as a "not recorded" marker. Declined to keep the field components untouched; revisit with a design.

### Out of scope

- Dropping tabs of empty Sections in `form:tab`, and any evaluation of inactive Sections.
- Making the tab bar honour `roles` (separate change).
- Any effect while `readonly` is `false`.
- The card renderer.
- Placeholder text inside the form when nothing survives.
- Falling back to the full form when nothing survives.
- Language-scoped emptiness.
- `alwaysVisible` overriding `roles` or computed `hidden`.
- Computed `alwaysVisible` on Section.
- Storing `hideEmptyFields` in the form definition.
- Patient-portal and exporter personas.

## Documentation impact

- README: add `hideEmptyFields` to the renderer props list; add `alwaysVisible` to the Field, Group, Subform and Section property lists; add `alwaysVisible` to the computed-properties list; a short "Read-only review" section with a YAML example.
- WHATSNEW: entry for the release that ships it.
- CONTEXT.md: already updated with `Empty field`, `hideEmptyFields`, `alwaysVisible`, and the `roles` correction replacing the stale `hiddenForPatient` entry.

## Known implementation constraints (for the plan, not decisions)

- Survival is render-and-observe: a dropped node renders `nothing`, and a container decides after rendering its children, as the Group code already does. No pre-pass, no survival map.
- Subform instances are rendered through a recursive call of the form renderer. Deciding whether an instance survived needs that recursion to report content presence internally; the public `Renderer` contract (a bare template) stays unchanged.
- In plain `form`, deciding whether to emit the section wrapper happens after the section's children rendered. In `form:tab` the wrapper is untouched.
