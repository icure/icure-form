# Plan: hide empty fields in read-only rendering

> Source PRD: [plans/prd-hide-empty-fields.md](./prd-hide-empty-fields.md) (to be published as a GitHub issue)
>
> Governing ADR: [0001 Inactive tab sections are never evaluated](../code-docs/adr/0001-lazy-tab-evaluation.md)
>
> Glossary: CONTEXT.md, section "Read-only review" (`Empty field`, `hideEmptyFields`, `alwaysVisible`)

Adds a host-set `hideEmptyFields` prop to `<icure-form>`. When the form is read-only and the prop is on, the `form` and `form:tab` renderers omit every Empty field and cascade upward through groups, subform instances and (plain `form` only) sections. Authors exempt elements with `alwaysVisible`. Rendering with the prop off is unchanged. Ships as **3.4.0** (minor: new prop, new optional schema flag, no breaking change).

## Task status overview

Tasks are grouped in three phases; each task is one dispatch. Status is tracked in the SDD ledger, not here.

| Task | Phase | Title | Tests |
|------|-------|-------|-------|
| 1 | 1 | Emptiness predicate (internal utility) | `test/utils/field-emptiness.spec.ts` |
| 2 | 1 | `hideEmptyFields` prop, field-level hiding in plain `form`, harness options, phase-1 e2e | `test/e2e/hide-empty-phase1.spec.ts` |
| 3 | 2 | `alwaysVisible` in the model at all four levels, round-trip test | `test/icure-form/always-visible-roundtrip.spec.ts` |
| 4 | 2 | Structured internal return and upward cascade, phase-2 e2e | `test/e2e/hide-empty-phase2.spec.ts` |
| 5 | 3 | `form:tab` behaviour and no-evaluation proof | `test/e2e/hide-empty-phase3.spec.ts` |
| 6 | 3 | Demo app toggles | manual |
| 7 | 3 | README and WHATSNEW | – |

Regression gate for every task: `yarn test` (jest) and `yarn test:e2e` (Playwright) green, and `test/e2e/forms.spec.ts` unchanged in outcome. Release 3.4.0 (`form-release` skill) happens after the branch is reviewed and merged; it is not a task.

## Architectural decisions

Durable across all phases. Each traces to a PRD decision number or to the ADR.

- **Public API (PRD 1, 2, 8).** New `@property({ type: Boolean }) hideEmptyFields = false` on `<icure-form>` (`src/components/icure-form/index.ts`, next to `readonly` and `displayMetadata`). The element computes the *effective* flag `this.readonly && this.hideEmptyFields` and passes it as a new optional `hideEmptyFields?: boolean` on `RendererProps` (`src/components/icure-form/renderer/index.ts`). Both `readonly` and `hideEmptyFields` join the `Task` args so toggling either re-renders. Renderers never see a non-effective flag; the card renderer ignores the prop.
- **Emptiness predicate (PRD 3, R2).** New internal module `src/utils/field-emptiness.ts` exporting `isEmptyFieldValues(values: VersionedData<FieldValue>): boolean`, `isBlankPrimitive(p: PrimitiveType | undefined): boolean`, and `VALUE_BEARING_FIELD_TYPES` (every `FieldType` except `label` and `action`). It is consumed only by the form renderer and is not re-exported from `src/index.ts` (which exports `./components` only), so it does not become public API. The renderer calls it on the output of the same `fieldValuesProvider(formsValueContainer, fg, revisionsFilter)` the field component will use, so predicate and display agree.
- **Render-and-observe with a structured internal return (ADR, PRD R3).** Inside `src/components/icure-form/renderer/form/form.ts`, `renderFieldGroupOrSubform`, `renderGroup`, `renderSubform` and `renderForm` return `RenderedNode = { template: TemplateResult | typeof nothing; content: boolean }` where `content` means "this node counts as surviving content". A new internal `renderInternal(...)` returns `{ template, content }` for a whole form and is what `renderSubform` recurses into; the exported `render` keeps the `Renderer` signature and returns `renderInternal(...).template`. No pre-pass, no survival map, no shared counter (siblings render concurrently under `Promise.all`, so a counter would interleave).
- **Decision order per node (PRD R3).** `roles` → evaluate `computedProperties` (all keys except `value`/`defaultValue`, as today) → `hidden` truthy → `nothing` (content `false`) → if the effective flag is on and the node is a value-bearing Field: `alwaysVisible` resolved as `computedProperties['alwaysVisible'] ?? fg.alwaysVisible`; if not `alwaysVisible` and `isEmptyFieldValues(...)` → `nothing` (content `false`); else render, content `true`. `label` and `action` fields always render when reached but report content `false`.
- **`alwaysVisible` is read from the original node, never from the copy (PRD 6, 7, 9).** Field subclass constructors re-list their options explicitly, so a flag set after construction does not survive `copyIfNeeded` (the same is already true of `roles`, `standalone`, `samePage`). The renderer therefore resolves `alwaysVisible` before calling `copyIfNeeded`, exactly like `span` and `rowSpan`. No Field constructor changes.
- **Schema (PRD R4).** Optional `alwaysVisible?: boolean` on `Field` (assigned post-construction in `Field.parse`, emitted in `toJson`, mirroring `standalone`), on `Group` and `Subform` (constructor option, `parse`, `toJson`, mirroring `samePage`), and on `Section` (constructor parameter, `parse`, `toJson`, mirroring `roles`). Computed variant on Field, Group and Subform arrives for free through the existing `computedProperties` evaluation; Section has no computed properties and gets none.
- **Cascade (PRD R3).**
  - Group: render children; `contentChildren = results.filter(r => r.content)`. If the effective flag is on and `contentChildren` is empty: `alwaysVisible` → emit the group shell with its title and an empty grid, content `true`; otherwise `nothing`, content `false` (labels and buttons go with it). If any child has content (or the flag is off) → emit all child templates, content `true` when the flag is on and any child has content.
  - Subform: for each child container, `renderInternal(childForm, …)`; when the flag is on, drop instances whose `content` is `false`. Emit the heading when at least one instance survives or the Subform is `alwaysVisible`; otherwise `nothing`. Content is `true` iff an instance survived or `alwaysVisible`.
  - Section, plain `form`: render children; when the flag is on and no child has content and the Section is not `alwaysVisible`, return `nothing` without calling the section wrapper. An `alwaysVisible` empty Section calls the wrapper with an empty grid (nothing visible in this layout, as the PRD notes).
  - Section, `form:tab`: the wrapper is always called (the tab bar in `<icure-form>` is untouched). Inside the active thunk the section's surviving content is rendered; an all-empty active Section shows an empty grid. Inactive thunks are never invoked, so nothing about them is evaluated (ADR point 1).
  - Whole form: `render` returns the array of section templates as today. Nothing else is emitted (PRD 5).
- **Zero regression by construction (PRD 11).** Every new branch is guarded by the effective flag. With it off, `content` is computed but never consulted, `renderGroup` keeps its current "any non-`nothing` child" collapse rule, and the section wrapper is called exactly as before.
- **Test strategy.** Jest (node) for the predicate and for parse/`toJson` round-trips; Playwright for rendering. The e2e harness (`test/e2e/test-page/harness.ts`) gains `readonly?: boolean` and `hideEmptyFields?: boolean` options, typed prefill (`prefill[].primitive?: PrimitiveType` and `codes?: Code[]` alongside the existing string `value`), and a `computeCount` spy (wrap `compute` on the bridged container, expose the count on `window`) for the ADR proof.
- **Release.** Version 3.4.0 via the `form-release` skill after phase 3. WHATSNEW entry under 3.4.0.

## Global Constraints

Binding for every task. Reviewers check against these verbatim.

1. **No evaluation of inactive tab Sections.** In `form:tab`, nothing about a non-active Section is read or computed: no `getValues`, no `compute`, no field component. The tab bar is never derived from data. (ADR 0001) **Today's code violates this:** `renderForm` renders every section's children eagerly and only the wrapper discards inactive templates, so computed properties of all sections are evaluated on every pass. Task 4 makes section rendering lazy; from then on the constraint is real.
2. **No pre-pass and no survival map.** Survival is decided inside the render pass by render-and-observe. No shared mutable counter: siblings render concurrently under `Promise.all`.
3. **Zero regression with the prop off.** Every new branch is guarded by the effective flag `readonly && hideEmptyFields`. With it off, DOM output is unchanged.
4. **Effective flag computed in `<icure-form>`.** Renderers receive `RendererProps.hideEmptyFields` already gated on `readonly`. The card renderer ignores it.
5. **Emptiness predicate is one shared internal function** in `src/utils/field-emptiness.ts`, applied to the output of the same `fieldValuesProvider(...)` the field component uses. It is not re-exported from `src/index.ts`.
6. **Emptiness definition (PRD R2):** empty iff no value ids after the revisions filter, or every id's most recent version (index 0) has no codes and every content entry in every language is blank. Blank: string with trimmed length 0; number/measure value undefined or NaN (unit alone does not count); boolean/timestamp/datetime undefined; compound with no non-blank member (recursive).
7. **Value-bearing field types** are every `FieldType` except `label` and `action`. Labels and action buttons always render when reached and report content `false`.
8. **`alwaysVisible` resolution:** `computedProperties['alwaysVisible'] ?? node.alwaysVisible`, read on the original node before `copyIfNeeded`. It never overrides `roles` or computed `hidden`. Meaningful only when the effective flag is on.
9. **Cascade (PRD R3):** Group with no content child → `nothing`, or title-only shell when `alwaysVisible` (content `true`). Subform instance with no content → dropped; heading only when an instance survives or the Subform is `alwaysVisible`. Section in plain `form` with no content and not `alwaysVisible` → `nothing` (wrapper not called). Section in `form:tab` → wrapper always called.
10. **Public `Renderer` return type unchanged** (bare `Promise<TemplateResult>`); structure lives on an internal function. The one deliberate signature change is the `sectionWrapper` thunk becoming async (`section: () => Promise<TemplateResult>`, wrapper returning `Promise<TemplateResult>`), which is what makes lazy section rendering possible.
11. **Code style:** no semicolons, single quotes, trailing commas, `printWidth` 200, eslint clean (`eslint . --ext .ts`).
12. **Tests:** jest (node) for pure logic and model round-trips; Playwright e2e through `test/e2e/test-page/harness.ts` for rendering. Each task lists its own tests; run them plus the regression gate.

## Risks and hazards

- **Pre-existing: `copyIfNeeded` drops post-construction flags** (`roles`, `standalone`, `samePage`). Not fixed here; this plan avoids depending on the copy for `alwaysVisible`. Worth its own small issue.
- **Concurrent sibling rendering.** The structured return is the only safe way to observe children; do not introduce shared mutable state in `form.ts`.
- **Container `compute` loop.** `value`/`defaultValue` formulas run inside the container regardless of rendering. The phase-3 proof fixture must not contain them, or the count assertion becomes meaningless.
- **Harness prefill is string-only today.** Typed prefill is required for the measure, number and code cases in phase 1 (c).
- **Demo uses `form:tab` by default.** Without the plain "Form" button, the section cascade cannot be demonstrated.

## Tasks

Everything below a `Task N` heading up to the next one is that task's brief. Paths are repo-relative. "Regression gate" means `yarn test` and `yarn test:e2e` green with `test/e2e/forms.spec.ts` unchanged in outcome, plus `npx eslint . --ext .ts` clean on touched files.

### Task 1 (Phase 1): Emptiness predicate

Create `src/utils/field-emptiness.ts` (internal, not re-exported from `src/index.ts`) and its jest tests. Pure functions over `VersionedData<FieldValue>` from `src/generic` and `FieldValue`/`PrimitiveType`/`FieldType` from `src/components/model`.

Exports:

- `VALUE_BEARING_FIELD_TYPES: ReadonlySet<FieldType>` — every `FieldType` except `'label'` and `'action'`. Derive the list from the `FieldType` union in `src/components/model/index.ts`; do not hand-copy a stale list.
- `isBlankPrimitive(p: PrimitiveType | undefined): boolean` — `true` for `undefined`; string with `trim().length === 0`; number whose `value` is `undefined` or `NaN`; measure whose `value` is `undefined` or `NaN` (a unit alone does not count); boolean, timestamp and datetime whose `value` is `undefined`; compound whose members are all blank (recursive; a compound with no members is blank).
- `isEmptyFieldValues(values: VersionedData<FieldValue> | undefined): boolean` — `true` when `values` is `undefined` or has no ids; otherwise `true` iff for **every** id, the most recent version (`versions[0]`) either is missing or has `(codes ?? []).length === 0` **and** every entry of `content` (all languages) satisfies `isBlankPrimitive`. Older versions are never consulted.

Tests in `test/utils/field-emptiness.spec.ts` (jest, node). One `it` per case, asserting the boolean:

- `isBlankPrimitive`: `undefined`; `{type:'string', value:''}`; `{type:'string', value:'   '}`; `{type:'string', value:'a'}` (not blank); `{type:'number', value: NaN}`; `{type:'number', value: 0}` (not blank); `{type:'boolean', value:false}` (not blank); `{type:'boolean', value: undefined as any}`; `{type:'timestamp', value: 0}` (not blank; check the actual `TimestampType` shape in the model first); `{type:'measure', value: undefined, unit:'kg'}`; `{type:'measure', value: 70, unit:'kg'}` (not blank); `{type:'compound', value: {}}`; compound with one `{type:'boolean', value:true}` member (not blank); compound whose only member is a blank string.
- `isEmptyFieldValues`: `undefined`; `{}`; one id whose latest version has `content: {}` and no codes; one id with `content: { en: {type:'string', value:''} }`; one id with `content: { fr: {type:'string', value:'bonjour'} }` and no `en` (not empty: language-agnostic); one id with `content: {}` and `codes: [{id:'X', label:{}}]` (not empty: codes count); one id with a preserved invalid date stored as `{type:'string', value:'31/02/2024'}` (not empty); two ids, one blank and one non-blank (not empty); one id whose `versions[0]` is blank and `versions[1]` is filled (empty: only the most recent version counts); one id with an empty `versions` array (empty).

Run `npx jest test/utils/field-emptiness.spec.ts` and then the regression gate (jest only for this task; e2e is unaffected). Commit with a message in the repo's style (imperative subject, no trailing period).

### Task 2 (Phase 1): `hideEmptyFields` prop and field-level hiding in plain `form`

Wire the prop end to end and hide empty value-bearing fields. No cascade in this task: groups keep their current collapse rule, sections always render, subform instances always render.

1. `src/components/icure-form/renderer/index.ts`: add `hideEmptyFields?: boolean` to `RendererProps` with a JSDoc line: "Effective read-only flag: `<icure-form>` passes `readonly && hideEmptyFields`. Form renderers omit Empty fields when set; the card renderer ignores it."
2. `src/components/icure-form/index.ts` (`<icure-form>`): add `@property({ type: Boolean }) hideEmptyFields = false` next to `displayMetadata`. In the `Task`, pass `hideEmptyFields: !!(this.readonly && this.hideEmptyFields)` in the props object, and add `this.readonly` and `this.hideEmptyFields` to the `args` array so toggling either re-renders.
3. `src/components/icure-form/renderer/form/form.ts`, in `renderFieldGroupOrSubform`, after the computed `hidden` check and before the clazz dispatch: when `props.hideEmptyFields` is truthy and `fg.clazz === 'field'` and `VALUE_BEARING_FIELD_TYPES.has(fg.type)`, resolve `alwaysVisible` as `computedProperties['alwaysVisible'] ?? (fg as any).alwaysVisible` (the model flag arrives in Task 3; reading it defensively now is intended) and compute `isEmptyFieldValues(formsValueContainer ? fieldValuesProvider(formsValueContainer, fg, revisionsFilter)() : undefined)`. If empty and not `alwaysVisible`, return `nothing`. Import from `../../../../utils/field-emptiness` and reuse the existing `fieldValuesProvider` import.
4. Harness `test/e2e/test-page/harness.ts`: add `readonly?: boolean` and `hideEmptyFields?: boolean` to `InitFormOptions`, applied to the element after the existing `icureFormEl.readonly = false` line (default remains `false`). Extend `prefill` entries to `{ label: string; language?: string; value?: string; primitive?: PrimitiveType; codes?: Code[] }`: when `primitive` is given, use it as the content instead of the string; pass `codes` through (default `[]`). Keep existing callers working. Also fix a latent harness bug: after mounting, the harness overwrites `window.__currentFvc` with the original pre-prefill container (`(window as any).__currentFvc = bridgedFormValuesContainer` near the end of `initForm`); it must be the post-prefill `currentFvc`, otherwise a test calling `__currentFvc.setValue` after prefill mutates a stale container and loses the prefilled values. Remove that overwrite (the change listener already keeps `__currentFvc` current).
5. Fixture `test/e2e/fixtures/hide-empty-fields.yaml`: one section, one field of each value-bearing type (`text-field`, `measure-field`, `token-field`, `items-list-field`, `number-field`, `date-picker`, `time-picker`, `date-time-picker`, `dropdown-field` with inline `options`, `radio-button` with options, `checkbox` with options), plus one `label` field and one `action` field. Look at `app/samples/01-components-gallery.yaml` for the exact YAML shapes.
6. `test/e2e/hide-empty-phase1.spec.ts`, following the helpers in `test/e2e/forms.spec.ts` (page load, `initForm`, `waitForFormRender`). Count rendered field components via the shadow root (`.icure-form-field`, `.icure-form-button`, and label elements; check the classes the renderers actually emit). Cases:
   - (a) `readonly: true`, prop off: baseline count equals the number of fields in the fixture.
   - (b) `readonly: true, hideEmptyFields: true`, nothing prefilled: only the label and the action button remain.
   - (c) same, with prefill: text `'hello'`; measure `primitive: {type:'measure', value: 70, unit:'kg'}`; dropdown `value: '<option label>'` with `codes: [{ id: '<option id>', label: { en: '<option label>' } }]`: exactly those three plus label and button.
   - (d) `readonly: false, hideEmptyFields: true`: identical count to (a).
   - (e) after (c), clear the text field to a persisted empty string via `page.evaluate` on `window.__currentFvc.setValue(label, 'en', { content: { en: { type: 'string', value: '' } }, codes: [] }, id)` (get the id from `window.__currentFvc.getValues(() => [null])`), wait for re-render: the text field is gone, count drops by one.
   - (f) `renderer: 'card'`, `readonly: true, hideEmptyFields: true`: the card count from `window.cardFlatten` or the rendered `.card` count is the same as with the prop off.
7. Regression gate.

### Task 3 (Phase 2): `alwaysVisible` in the model

Add the optional authored flag at all four levels in `src/components/model/index.ts`, mirroring existing flags exactly:

- `Field`: `alwaysVisible?: boolean` declared next to `standalone`, assigned post-construction in `Field.parse` the way `standalone` is (`if ((json as any).alwaysVisible !== undefined) result.alwaysVisible = !!(json as any).alwaysVisible`), emitted in `toJson` next to `standalone`. JSDoc: "Read-only review: exempts the field from `hideEmptyFields`. Does not override `roles` or computed `hidden`."
- `Group` and `Subform`: constructor option, `parse`, `toJson`, mirroring `samePage` (Group) and `roles` (Subform). Absent stays `undefined`, never `false`.
- `Section`: constructor parameter after `roles`, `parse`, `toJson`, mirroring `roles`.

Tests in `test/icure-form/always-visible-roundtrip.spec.ts` (jest): parse a small YAML/JSON form with `alwaysVisible: true` on one section, one group, one subform and one field; assert the four parsed flags are `true`; assert `toJson()` emits them; parse a form without the flag and assert the four are `undefined` and that `toJson()` output has no `alwaysVisible` key. Confirm `test/parse-each-sample.spec.ts` still passes (existing samples serialize identically).

Regression gate (jest; e2e unaffected).

### Task 4 (Phase 2): Structured internal return and upward cascade

Convert the form renderer to render-and-observe with a structured internal result and implement the cascade rules. File: `src/components/icure-form/renderer/form/form.ts`.

1. Define `type RenderedNode = { template: TemplateResult | typeof nothing; content: boolean }` where `content` means "counts as surviving content".
2. Introduce `renderInternal(...)` with the exact parameter list of the exported `render` and return type `Promise<RenderedNode>`; move the body of `render` into it. The exported `render` calls `renderInternal` and returns `.template`, keeping the public `Renderer` type untouched.
3. Convert `renderFieldGroupOrSubform`, `renderGroup`, `renderSubform`, and `renderForm` to return `RenderedNode`. Resolve `alwaysVisible` for every node kind as `computedProperties['alwaysVisible'] ?? fg.alwaysVisible` on the original node (never on the `copyIfNeeded` copy). Let `hide = !!props.hideEmptyFields`.
   - Field, value-bearing: `nothing`/`false` when `hide && empty && !alwaysVisible` (Task 2 logic, now returning `RenderedNode`); otherwise template with `content: true`.
   - Field `label` or `action`: always rendered when reached, `content: false`.
   - Group: render children. `contentChildren = results.filter(r => r.content)`. If `hide` and `contentChildren.length === 0`: when `alwaysVisible`, emit the group shell (title as today, bordered/borderless as today, empty `.icure-form` grid) with `content: true`; otherwise `nothing`/`false`. If not `hide`: keep today's behaviour exactly (collapse only when every child template is `nothing`), `content: true` when any child has content. If `hide` and some child has content: emit all non-`nothing` child templates (labels and buttons included), `content: true`.
   - Subform: for each child container, call `renderInternal(childForm, …)` as today's recursive `render` call. When `hide`, skip instances whose `content` is `false` (no title, no remove button). Emit the heading (`subform__heading`) when at least one instance is emitted, or `alwaysVisible`, or `!hide`; otherwise `nothing`. `content` is `true` iff an instance was emitted or `alwaysVisible`.
   - Section (in `renderForm`) — **make section rendering lazy, then apply the cascade.** Today `renderForm` does `await Promise.all(s.fields.map(renderFieldGroupOrSubform))` for **every** section before calling `sectionWrapper`, so `form:tab` evaluates all sections' computed properties on each pass (ADR 0001 violation). Change `renderForm` so the children are rendered inside the thunk: `const renderSection = async (): Promise<RenderedNode> => { const results = await Promise.all(s.fields.map(...)); const content = results.some(r => r.content); return { template: html\` <div class="icure-form">${results.map(r => r.template)}</div>\`, content } }`. Then:
     - with no `sectionWrapper` (plain `form`): `const r = await renderSection()`; when `hide && !r.content && !alwaysVisible(section)` return `nothing` for that section, else return `r.template`;
     - with a `sectionWrapper` (`form:tab`): `return await sectionWrapper(idx, async () => (await renderSection()).template)`; the wrapper is always called, and only the active tab's thunk is invoked by `<icure-form>`'s wrapper.
     The `sectionWrapper` type in `src/components/icure-form/renderer/index.ts` becomes `(index: number, section: () => Promise<TemplateResult>) => Promise<TemplateResult>`; update the tab wrapper in `src/components/icure-form/index.ts` to `async (index, section) => html\`<div class="tab ${active ? 'active' : ''}">${index === this.selectedTab ? await section() : nothing}</div>\``, and the default wrapper to `async (idx, section) => section()`. The card renderer ignores the wrapper and needs no change. Verify with the existing e2e suites that plain `form` and `form:tab` DOM output is unchanged with the prop off.
   - Whole form: `renderInternal` returns `{ template: html\`${sections}\`, content: sections.some(s => s.content) }`.
4. Fixture `test/e2e/fixtures/hide-empty-cascade.yaml`: section A with a group holding two text fields, a label and an action button; section B with a group nested inside a group, one text field in the innermost; section C with a subform (`subform:` declaration with one embedded form of two text fields); section D marked `alwaysVisible: true` with one text field; in section A a second group marked `alwaysVisible: true` with one text field; a field marked `alwaysVisible: true`; a field with `computedProperties: { alwaysVisible: "return !!parseContent(driver[0]?.content)" }` next to a `driver` text field; a field with `roles: ['doctor']` and `alwaysVisible: true`. Use the shapes from `test/e2e/fixtures/dynamic-hidden-fields.yaml` and `app/samples` for subforms.
5. Harness additions if needed: a `window.__addSubformInstance(anchorId, templateId, label)` helper wrapping `__currentFvc.addChild(...)` and a `window.__setChildValue(childIndex, label, language, value)` helper using `(await __currentFvc.getChildren())[childIndex].setValue(...)`. Keep them minimal.
6. `test/e2e/hide-empty-phase2.spec.ts`, plain `form`, `readonly: true, hideEmptyFields: true` unless stated:
   - (a) nothing filled: section A's first group is absent, including its label and button.
   - (b) prefill one field of that group: field, label and button present.
   - (c) nested empty groups in section B are all absent.
   - (d) a section with no surviving content has no `.icure-form` grid rendered for it (count section grids).
   - (e) section D (`alwaysVisible`) renders its grid even though empty.
   - (f) the `alwaysVisible` group in A renders its title and no field boxes.
   - (g) the `alwaysVisible` field renders as a blank read-only box.
   - (h) computed `alwaysVisible`: set `driver` via `__currentFvc.setValue` → the dependent field appears; clear `driver` → it disappears.
   - (i) `role: 'patient'`: the `roles: ['doctor']` `alwaysVisible` field is absent.
   - (j) subform: add two instances, fill one → exactly one `subform__child` and the heading present; with no instance filled → no heading; then mark the Subform `alwaysVisible` in a second fixture variant (or a YAML string edit in the test) → heading present with no instances.
   - (k) whole form empty (fixture variant without section D): no `.icure-form` grid in the shadow root.
   - (l) prop off: DOM field count equals the fixture's field count (baseline).
7. Regression gate. In the report, confirm that after the change a `form:tab` render evaluates computed properties of the active section only (a quick manual check with a `console.count` in `compute` during development is enough; Task 5 adds the automated proof).

### Task 5 (Phase 3): `form:tab` behaviour and no-evaluation proof

Prove the ADR constraint holds and pin the `form:tab` behaviour.

1. Harness: before mounting, wrap `compute` on the bridged container instance (`const orig = fvc.compute.bind(fvc); fvc.compute = (...a) => { count++; return orig(...a) }`) and expose `window.__computeCount = () => count` and `window.__resetComputeCount()`. Because the harness swaps containers on change (`registerChangeListener`), re-wrap each new container in that listener so the count survives value changes. Also expose `window.__selectTab = (idx) => { el.selectedTab = idx }` (it is a `@state` on `<icure-form>`; set it directly and await `el.updateComplete`).
2. Fixture `test/e2e/fixtures/hide-empty-tabs.yaml`: three sections; section 1 has two plain text fields and one field with `computedProperties.hidden: "return false"`; sections 2 and 3 each have two fields with `computedProperties.hidden: "return false"` and one with `computedProperties.alwaysVisible: "return false"`. **No `value` or `defaultValue` formulas anywhere** (they run in the container regardless of rendering and would pollute the count).
3. `test/e2e/hide-empty-phase3.spec.ts`, `renderer: 'form:tab'`, `readonly: true, hideEmptyFields: true` unless stated:
   - (a) nothing filled: the tab bar lists three `li` entries.
   - (b) active tab 1 shows an `.icure-form` grid with no field boxes.
   - (c) `__computeCount()` after initial render equals section 1's formula count (1). Switch to tab 2 → count increases by exactly section 2's formula count (3). Note that Lit may render more than once; if the count is a multiple, assert on the set of formulas evaluated instead (wrap `compute` to record formula strings and assert no formula from section 3 appears).
   - (d) back on tab 1, prefill/set a field in section 2 via `__currentFvc.setValue` → tab bar unchanged, no section-3 formula evaluated.
   - (e) fixture variant with `alwaysVisible: true` on section 3: tab bar identical (three tabs), i.e. no visible effect in this layout.
   - (f) prop off: three tabs, active tab shows all its fields.
4. Regression gate. If (c) reveals that `form:tab` still evaluates inactive sections after Task 4, that is a Critical finding: report it as DONE_WITH_CONCERNS with the evidence rather than patching the renderer in this task.

### Task 6 (Phase 3): Demo app toggles

Make the feature demonstrable in `app/`.

1. `app/demo-app.ts`: add a "Form" button to the existing renderer toggle (values `'form' | 'form:tab' | 'card'`), a "Read-only" checkbox, and a "Hide empty fields" checkbox that is disabled while read-only is off. Keep them as `@state()` fields and follow the existing toggle markup and CSS.
2. `app/decorated-form.ts`: add `@property() readonly = false` and `@property() hideEmptyFields = false`, forwarded to `<icure-form>` as `.readonly` and `.hideEmptyFields` (leave `displayMetadata` as is). `demo-app.ts` passes both down to every `<decorated-form>`.
3. Manual check (document in the report): with a sample that has prefilled services, read-only on and hide-empty on, empty fields disappear in `form`, groups collapse, sections vanish in plain `form` and tabs stay in `form:tab`. If no sample has data, describe how you verified with a form you filled in the demo before toggling read-only.
4. `yarn build` must still pass (the demo is not part of the library build, but `tsc` may include it; check `tsconfig.json`). Regression gate.

### Task 7 (Phase 3): README and WHATSNEW

Documentation only. No code changes.

1. `README.md`:
   - "The renderer" props list: add `hideEmptyFields: boolean` after `displayMetadata`: honoured only when `readonly` is true; omits Empty fields and cascades; ignored by the card renderer; link to the new section.
   - Section, Field, Group and Subform property lists: add `alwaysVisible: boolean` with the one-line definition (exempts from `hideEmptyFields`; does not override `roles` or computed `hidden`; Section is static only).
   - "Computed Properties" → field properties list: add `alwaysVisible` alongside `readonly`, `hidden`.
   - New subsection "Read-only review: hiding empty fields" after "Role-based visibility": what "empty" means (the R2 table from `plans/prd-hide-empty-fields.md`), the cascade rules, the `form:tab` note ("tabs always stay; inactive sections are never evaluated", linking `code-docs/adr/0001-lazy-tab-evaluation.md`), and one YAML example with `alwaysVisible` at field and group level plus the `<icure-form readonly hideEmptyFields>` usage.
2. `WHATSNEW.md`: new top entry `## 3.4.0 (unreleased)` with two subsections: "Hide empty fields in read-only forms" and "`alwaysVisible` on fields, groups, subforms and sections", each with a short YAML/HTML snippet, in the style of the 3.3.0 entry. Do not touch `RELEASES.md` or `package.json` (the release skill does that).
3. Run a markdown link check by eye (anchors exist). Commit.
