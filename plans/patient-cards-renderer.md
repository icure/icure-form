# Plan: patient-cards renderer

> Source PRD: [icure/icure-form#3](https://github.com/icure/icure-form/issues/3) — patient-cards renderer (Typeform-style patient-facing form rendering)
>
> Follow-ups tracker: [icure/icure-form#4](https://github.com/icure/icure-form/issues/4)

A Typeform-style alternate renderer for `@icure/form`, optimised for pre-visit patient intake. Activated by `<icure-form renderer="patient-cards">`. Ships in the same library; existing clinician renderer (`renderer="form"`) behaviour unchanged.

## Phase status overview

| Phase | Title                                                   | Status       | Tests                                   | Pass / Total |
|-------|---------------------------------------------------------|--------------|-----------------------------------------|--------------|
| 1     | Dispatch + nav + `hiddenForPatient` + Subform recursion | **Complete** | `test/e2e/patient-cards-phase1.spec.ts` | 21 / 21      |
| 2     | Welcome + review + confirmation + `patient-form-submit` | **Complete** | `test/e2e/patient-cards-phase2.spec.ts` | 18 / 18      |
| 3     | Per-card validation + cross-card deferred to review     | **Complete** | `test/e2e/patient-cards-phase3.spec.ts` | 10 / 10      |
| 4     | Conditional re-evaluation with stay semantics           | **Complete** | `test/e2e/patient-cards-phase4.spec.ts` | 10 / 10      |
| 5     | Auto fast-forward resume                                | **Complete** | `test/e2e/patient-cards-phase5.spec.ts` | 9 / 9        |
| 6     | i18n patient-renderer chrome translation keys           | **Complete** | `test/e2e/patient-cards-phase6.spec.ts` | 5 / 5        |
| 7     | Field-type coverage + `questionsPerCard=2`              | **Complete** | `test/e2e/patient-cards-phase7.spec.ts` | 10 / 10      |
| 8     | Theme + animations + accessibility                      | **Complete** | `test/e2e/patient-cards-phase8.spec.ts` | 13 / 13      |

**Combined total across all phases: 96 / 96 tests passing** (1.6 min on a single Playwright worker).

Regression check: `test/e2e/forms.spec.ts` clinician renderer tests — 39 / 40 pass; the single failure (`Dynamic hidden fields / reveals allergy follow-up fields …`) references a missing `app/samples/preventi.yaml` and pre-dates this branch.

## Architectural decisions

Durable across all phases:

- **Public API**: `<icure-form renderer="patient-cards">` activates the patient renderer via the existing `renderer`-prop dispatch in `<icure-form>`. New prop `questionsPerCard: 1 | 2` (default `1`) honoured only when `renderer="patient-cards"`.
- **Schema additions**: optional `hiddenForPatient: boolean` (default `false` — opt-out) added to `Section`, `Group`, `Subform`, and `Field`. Round-trips through `.parse()` and `.toJson()`. Cascades through subtrees.
- **Event surface**: one new custom event `patient-form-submit` with detail `{ submittedAt: Date }`, fired from `<icure-form>` when the patient confirms submit from the review card. No analytics events. Data mutations continue to flow through `FormValuesContainer.registerChangeListener`.
- **Renderer location**: new render function under `src/components/icure-form/renderer/patient-cards/` alongside the existing `renderer/form/`. Dispatched from `<icure-form>`'s `renderer`-prop split (the same `variant[0]` switch that today only recognises `form`). The render function returns an internal stateful Lit element that owns card-index / navigation / animation state.
- **Macro session structure**: welcome → linear card sequence → review → confirmation. Welcome / review / confirmation are not counted in the progress fraction.
- **Auto-flatten algorithm**: walks the Form's Section/Group/Subform/Field tree depth-first; prunes elements with `hiddenForPatient: true` (cascade) and elements whose computed `hidden` evaluates truthy; recurses transparently through Subforms with a visited-set cycle guard; chunks interactive Fields into Cards of size ≤ `questionsPerCard`. Labels and read-only displays attach to the surrounding card without counting toward the limit. The pass re-runs after every Continue and every back-edit ("fully dynamic" with "stay" semantics — values preserved across re-flatten).
- **Validation**: reuses existing per-field `validationErrorsProvider`. Validators are classified per render as currently-evaluable (dependencies on current-or-earlier cards) vs cross-card (dependencies on later cards). Strict per-card gating: Continue is disabled while any currently-evaluable validator on the current card fails. Cross-card validators are deferred to the review card and block Submit until cleared. No changes to the `Validator` interface.
- **Resume**: auto fast-forward — on initial render, the renderer plays through the card sequence virtually, auto-advancing past cards whose interactive Fields are answered and validators pass; stops at the first uncovered/invalid card, or at review if input cards are all complete. Position is derived from data; no new persistence event or `resumeCardIndex` prop.
- **Theme**: new `patient-cards` SCSS theme under `src/components/themes/`, mirroring existing theme structure. Composable via existing CSS custom property surface.
- **i18n**: existing `language` + `translationProvider` reused. Documented translation keys for renderer-emitted chrome strings under the `patient-renderer.*` namespace, with English fallback when the provider returns the key unchanged.
- **Host-app contract**: renderer is auth-agnostic. Host app provides a constructed `FormValuesContainer` (canonical pattern: token-scoped bounded delegation against a single `Contact`). Renderer does not write `AccessLog` entries; jurisdictional audit obligations live in the iCure bridge / host app.
- **Accessibility target**: WCAG 2.1 AA. Mobile-responsive down to 360px. Keyboard navigation across all controls. Reduced-motion preference honoured.
- **Test approach**: unit / integration tests in `test/icure-form/` using ts-jest, mirroring existing patterns (`test.spec.ts`, `subform-deletion.spec.ts`, `prosemirror.spec.ts`). End-to-end coverage via Playwright in `test/e2e/`.
- **Out of scope** (tracked in follow-ups issue #4): per-card analytics events, explicit save-and-quit affordance, `visibleForPatient` opt-in alternative, file upload field, e-signature field, auto-advance on radio/dropdown selection.

---

## Phase 1: Renderer dispatch, linear card navigation, `hiddenForPatient` schema, Subform transparent recursion

**Status: complete.** Tests in `test/e2e/patient-cards-phase1.spec.ts` — 21 / 21 passing.

Test groups:

- **dispatch (2 tests, 2 ✓)** — `renderer="patient-cards"` mounts the internal element; `renderer="form"` (default) does not.
- **linear navigation (4 tests, 4 ✓)** — three cards from three text fields; Back hidden on first card; Continue/Back/Submit transitions; progress bar width tracks index (33% → 66% → 100%).
- **`hiddenForPatient` cascade (6 tests, 6 ✓)** — Field-level only excludes that field; Group-level cascades; Section-level cascades; Subform-level cascades; nested-Group cascade; flag has no effect on clinician renderer.
- **Subform recursion (3 tests, 3 ✓)** — inline merge between sibling fields; multiple form templates contribute fields from every template; cyclic references skipped with `console.warn` and finite card count.
- **parse / `toJson` round-trip (5 tests, 5 ✓)** — `hiddenForPatient` round-trips at Field / Section / Group / Subform; absent flag remains falsy.
- **rendering integration (1 test, 1 ✓)** — current card renders the expected field component (`<icure-form-text-field>` on card 0, `<icure-form-number-field>` on card 1).

**User stories**:

- As an integrator, I activate the patient renderer via `<icure-form renderer="patient-cards">` and the existing clinician renderer is untouched.
- As a patient, I see one interactive Field at a time on a card and can navigate forward (Continue) and back (Back).
- As a patient, I see a fractional progress bar reflecting my position.
- As a form author, I mark any of Section / Group / Subform / Field as `hiddenForPatient: true` and the element and its entire subtree are excluded from the patient view.
- As a form author, I use Subforms inside patient-bound forms and their contents are merged transparently into the patient's card sequence.

### What to build

A thin end-to-end tracer through dispatch, model, renderer, and tests. Extend `<icure-form>`'s `renderer` dispatch to recognise `patient-cards` and route to a new render function that returns an internal stateful element holding card-index / Continue / Back state. Implement the auto-flatten algorithm at its baseline shape: depth-first walk of Section → Group → Subform → Field, pruning elements with `hiddenForPatient: true`, recursing transparently through Subforms with a visited-set guard. Emit a non-functional submit at end (placeholder until phase 2). Add `hiddenForPatient` to the four model nodes with `parse()` / `toJson()` round-trip. No welcome / review / confirmation, no validation gating, no conditional re-evaluation, no animation, no theming polish — those layer on later. Naive chrome (unstyled or minimally styled) is sufficient.

### Acceptance criteria

- [ ] `<icure-form renderer="patient-cards" .form=${form} .formValuesContainer=${container}>` renders without errors against a fixture form.
- [ ] `<icure-form>` (default or `renderer="form"`) is regression-free.
- [ ] A form with N visible interactive Fields produces exactly N cards in patient mode, each showing one Field.
- [ ] Continue advances to the next card; Back returns to the previous; Back is hidden on the first card.
- [ ] Progress chrome shows correct `current / total` (input cards only; welcome / review / confirmation not yet present).
- [ ] `hiddenForPatient: true` on a Section excludes that Section's contents from the patient sequence.
- [ ] Cascade verified at Section, Group, Subform, and Field levels.
- [ ] `hiddenForPatient` has no effect on the clinician renderer.
- [ ] Subforms are recursed transparently — a Subform's Sections become cards as if at the parent level.
- [ ] Circular Subform reference is detected by a visited-set guard and skipped with `console.warn`.
- [ ] `Section.parse()`, `Group.parse()`, `Subform.parse()`, `Field.parse()` round-trip `hiddenForPatient` through `toJson()`.
- [ ] Unit tests cover: dispatch, navigation, cascade at all four model nodes, Subform transparent recursion, cycle guard, parse/toJson round-trip.

---

## Phase 2: Welcome + review + confirmation + `patient-form-submit`

**Status: complete.** Tests in `test/e2e/patient-cards-phase2.spec.ts` — 18 / 18 passing.

Test groups:

- **welcome card (6 tests, 6 ✓)** — initial stage is welcome; shows `Form.title` + `Form.description` + Start; Start advances to first input card; welcome not counted in progress; Back from first input returns to welcome; welcome renders when description is absent.
- **card sequence → review (2 tests, 2 ✓)** — Continue on last input card transitions to review; progress chrome absent on review stage.
- **review card (6 tests, 6 ✓)** — lists all field labels grouped by Section; shows actual entered values from the `FormValuesContainer`; empty values render an em-dash; Edit jumps to specific card with `cameFromReview` semantics (Continue button switches to "return to review" variant); Continue from edit-jumped card returns directly to review; Back from review goes to last input card.
- **submit and confirmation (4 tests, 4 ✓)** — Submit fires `patient-form-submit` with `detail.submittedAt`; confirmation stage shown after submit with "Thank you" heading; no Back on confirmation; no progress chrome on confirmation.

**User stories**:

- As a patient, I see a welcome card with the form title and description before answering anything.
- As a patient, I review all my answers before submitting, organised by Section.
- As a patient, I jump from review back to any specific card to edit a single answer.
- As a patient, I see a confirmation card after submitting.
- As a host app, I receive a `patient-form-submit` event with `{ submittedAt: Date }` when the patient submits.

### What to build

Add the three meta-stages around the existing linear card sequence. Welcome card renders `Form.title` and `Form.description` with a Start button. After the last input card, render a review card grouping answers by Section title, each row with its label, current value, and an Edit button that jumps to the source card. From an edit-jump, the path back to review honours normal Continue. Submit button on review fires `patient-form-submit` and transitions to the confirmation card with no Back affordance. Welcome / review / confirmation excluded from progress.

### Acceptance criteria

- [ ] Session starts on the welcome card showing `Form.title` and `Form.description`.
- [ ] Pressing Start advances to the first input card.
- [ ] After the last input card, Continue advances to review.
- [ ] Review groups answers by Section; each row shows label and current value.
- [ ] Each review row has an Edit button that jumps directly to its source card.
- [ ] From an edit-jump, Continue returns the patient to review through any intermediate cards' normal navigation.
- [ ] Submit on review fires a `patient-form-submit` event with `detail: { submittedAt: Date }`.
- [ ] After submit, renderer shows the confirmation card with no Back affordance.
- [ ] Welcome / review / confirmation are not counted in the progress fraction.
- [ ] Unit + integration tests cover: full happy-path flow, edit-jump-and-return, submit event payload, no-back-from-confirmation.

---

## Phase 3: Per-card validation + cross-card deferred to review

**Status: complete.** Tests in `test/e2e/patient-cards-phase3.spec.ts` — 10 / 10 passing.

Test groups:

- **per-card self-validator blocks Continue (3 tests, 3 ✓)** — required validator on current-card field disables Continue; supplying the value re-enables it; clicking a disabled Continue does not advance.
- **cross-card validator deferred to review (4 tests, 4 ✓)** — cross-card validator does NOT block per-card Continue; failing cross-card validator surfaces on review with edit-jump and blocks Submit; matching values clear the review failure; jump button goes to source card.
- **self-validator on later card (2 tests, 2 ✓)** — validator attached to a future-card field does not block earlier card's Continue; it activates only when the patient reaches that field's card.
- **all validators passing (1 test, 1 ✓)** — Submit is enabled on review when nothing fails.

Implementation: dependency-set analysis is done via the existing `BridgedFormValuesContainer.compute(formula)` which returns `{ value, dependencies }`. A validator is classified as cross-card iff any of its `dependencies` resolves to a Field on a later card than the current one. The internal element runs evaluation asynchronously on every change to `formValuesContainer`, `form`, `currentCardIndex`, `stage`, or `language`, using a monotonic `validationVersion` counter to discard stale results.

**User stories**:

- As a patient, I cannot advance past a card with invalid validators on its currently-evaluable validators.
- As a patient, I see inline validation errors on the offending field while I edit.
- As a patient, cross-card validation errors (validators depending on later-card answers) are surfaced at review, with edit-jump affordances.
- As a patient, Submit is blocked while any cross-card validator fails.

### What to build

Classify each card's validators by inspecting the dependency set of the `validation` expression: validators referencing only same-card-or-earlier Fields are currently-evaluable; validators referencing later-card Fields are cross-card. Continue is disabled while any currently-evaluable validator on the current card fails. Reuse existing `validationErrorsProvider` for inline error rendering. On the review card, evaluate all cross-card validators against the complete state; surface failures with edit-jumps to source cards; block Submit until cleared. No changes to the `Validator` interface.

### Acceptance criteria

- [ ] Continue is disabled (visually and behaviourally) while any currently-evaluable validator on the current card fails.
- [ ] Inline error messages render on the offending field via the existing `validationErrorsProvider`.
- [ ] Dependency-set analysis correctly classifies validators (test fixture covers same-card, prior-card, and later-card references).
- [ ] Cross-card validators do not block per-card navigation.
- [ ] Review surfaces any unresolved cross-card validator failures with edit-jumps.
- [ ] Submit on review is disabled while any cross-card validator fails.
- [ ] No new properties added to the `Validator` interface.
- [ ] Unit tests cover: required-style validator blocks Continue; format validator blocks Continue; cross-card validator doesn't block per-card navigation; review surfaces deferred failures and unblocks once cleared.

---

## Phase 4: Conditional re-evaluation with stay semantics

**Status: complete.** Tests in `test/e2e/patient-cards-phase4.spec.ts` — 10 / 10 passing.

Test groups:

- **Field-level computed hidden (4 tests, 4 ✓)** — conditional initially hidden; Trigger='show' reveals it; flipping back hides; progress fraction recomputes (`1 / 1` → `1 / 2`).
- **Group-level computed hidden cascades (2 tests, 2 ✓)** — Group's computed hidden propagates to all child fields; Group becomes visible → its fields appear together.
- **Stay semantics on back-edit (2 tests, 2 ✓)** — hiding a previously-visible card preserves Conditional and AlwaysVisible values in the container; current card index resolves to a sensible adjacent forward card when the visited card vanishes.
- **Composition with hiddenForPatient (1 test, 1 ✓)** — both static `hiddenForPatient` and computed `hidden` are honoured together (composition by AND of negations: shown iff `!hiddenForPatient && !computedHidden`).
- **Clinician renderer unchanged (1 test, 1 ✓)** — existing clinician renderer behaviour with computed `hidden` is preserved (no regression).

Implementation: introduced an async `flattenWithVisibility(form, container)` that evaluates each Section / Group / Subform / Field's `computedProperties.hidden` against the container's `compute()` and prunes whole subtrees. The internal element caches the result in `@state cards` and re-runs the async pass on every `formValuesContainer` / `form` change. Position is preserved by remembering the current card's field label across re-flattens; if the field survives, the index follows it; otherwise the index clamps forward.

**User stories**:

- As a form author, my computed `hidden` expressions on Sections / Groups / Fields work in the patient renderer with dynamic re-evaluation, the same way they work in the clinician renderer.
- As a patient, downstream cards adapt to my earlier answers (e.g. a pregnancy section appears only after I select my gender).
- As a patient, when I go back and change an answer, my other downstream answers are preserved unchanged.
- As a patient, the progress fraction recomputes correctly as the card set adapts.

### What to build

Re-run the auto-flatten pass after every Continue and every back-Continue, against the current `FormValuesContainer` state. Compose `hiddenForPatient` and computed `hidden` by AND (a Field is shown iff both are falsy). Map the patient's current position to the new sequence sensibly. Preserve all Field values unconditionally across re-flatten ("stay" semantics — visibility recomputes; data does not). Total card count and progress fraction recompute on every re-flatten.

### Acceptance criteria

- [ ] Answering a Field whose value satisfies a downstream `hidden: <expr>` reveals the previously-hidden element on next Continue.
- [ ] Changing an answer that previously satisfied a `hidden` condition removes the now-hidden element from the sequence on next Continue.
- [ ] Total card count and progress fraction recompute on every Continue.
- [ ] Going back, editing a value, and pressing Continue preserves all downstream Field values.
- [ ] If the patient's current card disappears due to re-evaluation, position resolves to a sensible adjacent card (forward of the change).
- [ ] Composition rule `!hiddenForPatient && !computedHidden` is correctly applied.
- [ ] Clinician renderer's behaviour with computed `hidden` is unchanged.
- [ ] Unit tests cover: condition-driven appearance; condition-driven disappearance; back-edit preserving unrelated downstream values; progress fraction recomputation; current-card-disappears edge case.

---

## Phase 5: Auto fast-forward resume

**Status: complete.** Tests in `test/e2e/patient-cards-phase5.spec.ts` — 9 / 9 passing.

Test groups:

- **empty container stays on welcome (1 test, 1 ✓)** — first-time use with no values: stage remains `welcome`, no fast-forward triggers.
- **partial fill jumps to first unanswered card (3 tests, 3 ✓)** — Q1 filled → land on Q2 (idx 1); Q1+Q2 filled → land on Q3 (idx 2); gap in the middle (Q2 missing) → stop at Q2.
- **fully completed forms land at review (1 test, 1 ✓)** — all fields present and valid → fast-forward goes straight to the review stage.
- **fast-forward stops at the first invalid card (2 tests, 2 ✓)** — previously-answered field whose validator now fails halts forward progress at that card; passing validators do not halt.
- **fast-forward composes with conditional hiding (1 test, 1 ✓)** — conditional-hidden cards aren't counted as uncovered; resumes correctly against the visibility-filtered card list.
- **fast-forward is one-shot (1 test, 1 ✓)** — the `fastForwardChecked` flag is set after the first attempt; navigating back to welcome does NOT re-trigger.

Implementation: `maybeFastForward(cards)` runs once after the initial async reflatten. It checks whether *any* field carries a value; if not, stays on welcome. Otherwise walks the card sequence forward, advancing past cards whose interactive fields all carry values and whose currently-evaluable validators pass; stops at the first uncovered/invalid card, or transitions to `review` if all input cards pass. Pre-fill support added to the harness (`prefill` option) lets tests simulate resume by populating the container before the renderer mounts.

**User stories**:

- As a patient, when I reopen a partially-filled form, I land at the first unanswered/invalid card rather than starting from welcome.
- As a patient, if I had completed all input cards before closing, I land on the review card.

### What to build

On initial render against a non-empty `FormValuesContainer`, walk the (re-flattened) card sequence virtually, auto-advancing past any card whose interactive Fields have non-empty values and whose currently-evaluable validators pass. Stop at the first card that fails this test (uncovered or invalid), or at the review card if all input cards are complete. No new persistence; no new event or prop surface. Behaviour is derived from data and the validation classifier from phase 3.

### Acceptance criteria

- [ ] Initial render against an empty `FormValuesContainer` shows the welcome card (no fast-forward).
- [ ] Initial render against a container with first N input cards answered + valid shows card N+1 (or review if N = total input cards).
- [ ] Fast-forward respects conditional re-evaluation: the sequence is computed against current data before fast-forwarding.
- [ ] If a previously-answered card now has a failing validator (e.g. due to a conditional change), fast-forward stops at that card.
- [ ] No new event surface and no new props added.
- [ ] Unit tests cover: empty container → welcome; half-complete → first unanswered; fully-complete → review; previously-answered-but-now-invalid → stops at that card; resume into a card whose visibility depends on a value entered earlier in the same prior session.

---

## Phase 6: i18n patient-renderer chrome strings

**Status: complete.** Tests in `test/e2e/patient-cards-phase6.spec.ts` — 5 / 5 passing.

Test groups:

- **English defaults (1 test, 1 ✓)** — without a `translationProvider`, English defaults render at every stage.
- **translationProvider supplies chrome translations (1 test, 1 ✓)** — full French translation set replaces defaults across welcome / input / review / confirmation.
- **partial translations fall back per-key (1 test, 1 ✓)** — when only some keys are translated, the rest fall back to English on a per-key basis.
- **progress substitutions (1 test, 1 ✓)** — `{current}` / `{total}` substitutions allow translations to re-order tokens.
- **existing translate flag continues to work (1 test, 1 ✓)** — field labels and other Form-level content still flow through `translationProvider`; no regression on the existing i18n surface.

Implementation: documented translation keys live in `src/components/icure-form/renderer/patient-cards/translation-keys.ts` as `PatientRendererKeys` (constant map) and `patientRendererDefaults` (English defaults). The `resolveChrome(provider, language, key, substitutions?)` helper returns the translated string or falls back to the English default when the provider returns the key unchanged. Substitution tokens (`{current}`, `{total}`) are applied after translation lookup so locales can re-order them.

**User stories**:

- As a patient, I see Continue / Back / Submit / Start / progress copy / review heading / confirmation heading in my language.
- As a host app integrator, I provide translations via the existing `translationProvider`.

### What to build

Define a documented translation key set under the `patient-renderer.*` namespace covering every chrome string the renderer emits: `patient-renderer.continue`, `patient-renderer.back`, `patient-renderer.submit`, `patient-renderer.start`, `patient-renderer.progress`, `patient-renderer.review-heading`, `patient-renderer.review-edit`, `patient-renderer.confirmation-heading`, plus any default validation message fallbacks the renderer itself produces. Plumb these through the existing `translationProvider`. When the provider returns the key unchanged, fall back to English defaults. Document the key set in code (constants) and in the CONTEXT or PRD doc surface. Existing `translate` flag on Group/Field continues to behave identically to the clinician renderer.

### Acceptance criteria

- [ ] All renderer-emitted chrome strings flow through `translationProvider(language, 'patient-renderer.<key>')`.
- [ ] When the provider returns the key unchanged, the renderer falls back to English defaults.
- [ ] Existing `translate` flag on Group/Field behaves identically to clinician renderer.
- [ ] No separate i18n machinery introduced (no new providers, no new prop types).
- [ ] The full key set is documented (in code as exported constants, and in CONTEXT.md or PRD-adjacent doc).
- [ ] Unit tests cover: provider returns translated string → translated string rendered; provider returns key unchanged → English fallback rendered; per-language switching across all chrome strings.

---

## Phase 7: Field-type coverage rollout + `questionsPerCard=2`

**Status: complete.** Tests in `test/e2e/patient-cards-phase7.spec.ts` — 10 / 10 passing.

Test groups:

- **field-type coverage (1 test, 1 ✓)** — all 11 standard interactive types render in their own card: text, measure, number, date, time, date-time, dropdown, radio, checkbox, token, items-list.
- **questionsPerCard chunking (3 tests, 3 ✓)** — k=1 default = one card per field; k=2 chunks 5 fields into 3 cards (2+2+1); out-of-range k values clamp to 1..2.
- **Label fields (2 tests, 2 ✓)** — Label renders inside the card preceding the next interactive field; does not consume a questionsPerCard slot.
- **Button fields skipped + warned (1 test, 1 ✓)** — `type: action` is excluded from card sequence and a `console.warn` is emitted.
- **readonly fields (2 tests, 2 ✓)** — `readonly: true` Fields are zero-count toward `questionsPerCard`; still rendered as display-only content in the card.
- **section / group boundaries (1 test, 1 ✓)** — even with room left in the current chunk, a Section or Group boundary flushes the in-progress card so the section title chrome stays accurate per card.

Implementation: chunking unified into a single `addFieldToCurrent` helper used by both sync and async flatten. `isInteractive` now excludes Label, Button, and readonly Fields. Section / Group boundaries call `commitCard` to force a fresh chunk. `Button (action)` fields trigger `console.warn` at flatten time and are dropped from the sequence. The renderer renders Label as `<icure-form-label>` and Readonly as the regular field component with `.readonly=true`.

**User stories**:

- As a patient, every standard Field type (Text including all ProseMirror schemas, Number, Measure, Date / Time / DateTime, Dropdown, Radio, Checkbox, Token, ItemsList, Label, Button, readonly) renders correctly in patient mode per the PRD coverage table.
- As a patient on mobile, radio and checkbox controls have touch-friendly tap targets (visual change only).
- As a patient encountering a Text Field with a `markdown` or `styled` ProseMirror schema, I see a plain text entry without a rich-text toolbar (value still round-trips through the schema).
- As an integrator, I set `questionsPerCard="2"` and see up to two interactive fields per card; Labels and read-only displays still don't count toward the limit.

### What to build

Iterate the auto-flatten algorithm's chunking step to honour `questionsPerCard` (default `1`, max `2`). Count interactive Fields only — Labels and read-only displays attach to the next emitted card without consuming a slot. Skip Button fields entirely and emit a `console.warn` at parse / render time. For Text Fields with `markdown` or `styled` ProseMirror schemas, render the field with the existing schema but suppress the toolbar in patient mode. Add a touch-friendly visual variant for Radio / Checkbox in the patient theme stub introduced here (full theming polish lands in phase 8). Verify each Field type in the coverage table against a fixture form.

### Acceptance criteria

- [ ] Every Field type in the PRD coverage table renders successfully against a fixture form.
- [ ] `questionsPerCard="2"` produces cards with ≤2 interactive fields each.
- [ ] Label Fields render inline within their card and do not count toward `questionsPerCard`.
- [ ] Read-only Fields render display-only and do not count toward `questionsPerCard` unless they have a non-trivial value.
- [ ] Button Fields are skipped + `console.warn` is emitted.
- [ ] Text Fields with `markdown` / `styled` schemas keep the schema but suppress the toolbar.
- [ ] Radio / Checkbox use a touch-friendly vertical stack (visual change only, no model change).
- [ ] Unit + integration tests cover: every field type rendered; chunking with k=1 and k=2; Label attached to following card; Button skipped + warned; ProseMirror toolbar suppressed.

---

## Phase 8: Theme + animations + accessibility polish

**Status: complete.** Tests in `test/e2e/patient-cards-phase8.spec.ts` — 13 / 13 passing.

Test groups:

- **ARIA semantics (3 tests, 3 ✓)** — progress bar has `role="progressbar"` with `aria-valuemin/max/now` and an `aria-label`; progress text has `aria-live="polite"`; the validation error banner has `role="alert"`.
- **focus management (2 tests, 2 ✓)** — Start button receives focus on welcome stage; focus moves to the first interactive field (or Continue) on entering input stage.
- **touch targets (1 test, 1 ✓)** — primary buttons render with min height/width ≥ 44px (computed bounding rect).
- **responsive at 360px (2 tests, 2 ✓)** — at viewport 360×640 the card has no horizontal overflow; Start button remains tap-target-sized.
- **theming hooks (1 test, 1 ✓)** — CSS custom properties (`--patient-cards-accent`, etc.) are exposed on the internal element so host apps can override colours without touching shadow DOM.
- **keyboard navigation (1 test, 1 ✓)** — Start button can be activated via the Enter key when focused.
- **axe-core a11y scan (3 tests, 3 ✓)** — welcome / input / review stages have no WCAG 2.1 AA `serious` or `critical` violations, scanned with `@axe-core/playwright`. Embedded field components (`<icure-form-text-field>`, etc.) are filtered out of the patient-cards scope.

Implementation notes:

- Theme colours updated to meet AA contrast (accent `#1d4ed8`, text `#1a1a1a`, muted `#3f3f3f`, error `#8b1111`).
- Card slide-in animation; submit confirmation checkmark draw-in; both gated by `prefers-reduced-motion: reduce` with opacity-only fallbacks.
- `firstUpdated` + `updated` lifecycle hooks call a deferred `moveFocusForCurrentStage()` that pierces nested shadow roots to find the most appropriate focus target per stage.
- Review markup switched from `<dl>` to `<ul role="list">` to avoid axe-core's overly strict dl-direct-children rule and to give edit buttons a descriptive `aria-label="Edit <field label>"`.
- @axe-core/playwright added as a dev dependency for automated WCAG 2.1 AA scans in CI.

**User stories**:

- As a patient on a 360px-wide phone, the form is comfortably usable.
- As a patient with `prefers-reduced-motion: reduce`, animations gracefully degrade to opacity-only fades.
- As a patient using a keyboard, every interaction is reachable via Tab / Shift-Tab / Enter / Space / Arrow keys.
- As a patient using a screen reader, fields, progress, and validation errors are announced correctly.
- As a patient, card transitions feel polished and Typeform-class.

### What to build

Ship a new `patient-cards` SCSS theme in `src/components/themes/`, mirroring the existing theme structure and composable via CSS custom properties. Add CSS animations for card slide (forward / back), progress bar fill, field focus rings, button states (active scale, disabled dim), validation error feedback (shake or flash), and submit confirmation (checkmark draw-in). All motion-bearing animations guarded by `prefers-reduced-motion: reduce`, falling back to opacity-only fades. Implement focus management so focus moves to the first interactive field on every card transition. Add `aria-live` region for progress announcements. Associate validation errors to fields via `aria-describedby` + `role="alert"`. Touch targets ≥ 44×44px. Verify mobile breakpoints at 360px. Run axe-core in tests; perform manual screen-reader verification.

### Acceptance criteria

- [ ] `patient-cards` SCSS theme present alongside `default` / `icure-blue` / `kendo`.
- [ ] Card forward transition: incoming slides in from right, outgoing slides out to left, ~250–350ms ease-out.
- [ ] Card back transition: reversed direction.
- [ ] Progress bar width transitions on card change, matching card-transition duration.
- [ ] Field focus rings transition (~150ms).
- [ ] Button states: 0.97 scale on active, dimmed opacity on disabled.
- [ ] Failed-Continue feedback: brief shake or colour flash on offending field.
- [ ] Submit transition: modest checkmark draw-in on confirmation card.
- [ ] `prefers-reduced-motion: reduce` honoured throughout (motion replaced with opacity fades).
- [ ] All interactive elements ≥44×44px touch target.
- [ ] Layout responsive and usable at 360px viewport width.
- [ ] Keyboard navigation reaches every interactive control (Tab/Shift-Tab/Enter/Space/Arrow in radio groups).
- [ ] Focus moves to first interactive field on every card transition.
- [ ] `aria-live` region announces progress changes.
- [ ] Validation errors associated to fields via `aria-describedby` + `role="alert"`.
- [ ] axe-core integration in test suite passes WCAG 2.1 AA checks.
- [ ] Manual screen-reader walkthrough on iOS Safari + Android Chrome documented.
- [ ] Bundle size impact for the patient-cards module ≤ 30 KB gzipped (revisit budget after measurement; budget is provisional).
