# CONTEXT

Glossary of domain terms used across this codebase. Definitions here are the canonical meaning; if a discussion uses a term differently, the disagreement is real and needs to be resolved against this file.

Only terms meaningful to domain experts (clinicians, form authors, integrators) appear here. Implementation-level abstractions (class names, file paths, module structure) do not.

## Form authoring

**Form** — A YAML/JSON definition of an Electronic Health Record questionnaire. Composed of Sections, Groups, Subforms, and Fields. Authored once, rendered by any of the available renderers.

**Section** — Top-level grouping within a Form. Has a title, an ordered list of children (Fields, Groups, Subforms), optional description and keywords.

**Group** — A recursive container of Fields, nested Groups, and Subforms. Has a title, layout hints (`span`, `borderless`), and optional computed properties. Groups can nest arbitrarily within a Section or within another Group.

**Subform** — A Form embedded inside another Form by reference. Allows reusing form fragments (e.g., a shared demographic block) across multiple Forms.

**Field** — A leaf question. Has a label, a type (Text, Number, Measure, Date, Time, DateTime, Dropdown, Radio, Checkbox, Token, ItemsList, Label, Button), optional validators, optional computed properties, and optional value schema (for Text fields).

**Computed property** — A sandboxed expression on a Field/Group/Section that evaluates at render time against current form values. Common uses: `hidden`, `readonly`, `span`. Re-evaluated whenever dependent values change.

**Validator** — `{ validation: string, message: string }` on a Field. The expression evaluates against form values; truthy means invalid; the message surfaces to the user. Multiple validators per Field are conjunctive.

**Cross-card validator** — In patient-cards rendering only: a validator whose expression depends on Fields that appear on a later card than the validator's own Field. Cannot be evaluated until those later cards are answered; deferred to the review card.

## Rendering

**Renderer** — A strategy for translating a Form into Lit templates. The `<icure-form>` element dispatches to one renderer per render pass, selected by its `renderer` prop. Today: `form` (clinician-dense layout) and `patient-cards` (patient-friendly card sequence).

**Patient renderer** / **patient-cards renderer** — The renderer that presents a Form to a patient as a linear sequence of Typeform-style cards. Optimized for pre-visit intake.

**Card** (patient-cards only) — A single screen presented to the patient. Contains at most `questionsPerCard` interactive Fields (default 1). Labels and read-only display Fields can additionally appear on the card but do not count toward the limit.

**Auto-flatten** — The algorithm by which the patient renderer turns a Form's Section/Group/Subform/Field tree into a flat linear sequence of Cards. Walks the tree depth-first, skips elements hidden by `hiddenForPatient` or by computed `hidden`, recurses transparently into Subforms, and chunks interactive Fields into Cards of size ≤ `questionsPerCard`.

**Welcome card** — The first card the patient sees. Shows the Form title and `description`. Patient presses Start to enter the question sequence. Not counted in progress.

**Review card** — Penultimate card. Shows all answers grouped by Section, each with an edit-jump back to its source card. Surfaces any cross-card validation failures. Not counted in progress.

**Confirmation card** — Final card, shown after submit. Renders a thank-you and any host-app-provided next-step content. Not counted in progress.

**Auto fast-forward resume** — When a patient reopens a partially-filled Form, the patient renderer plays through the card sequence, auto-advancing past Cards whose Fields are all answered and validating, stopping at the first unanswered or invalid card (or at the review card if all are complete). No explicit "current card" persistence; position is derived from data.

**Stay semantics** (back-edit) — When the patient goes back, edits a value, and presses Continue, downstream Cards keep their previously-entered values. Visibility/conditional re-evaluation happens; data preservation is unconditional.

## Patient-facing schema

**`hiddenForPatient`** — Cascading boolean flag on Section, Group, Subform, or Field. Default `false`. When `true`, the element and its entire subtree are excluded from the patient renderer. Has no effect on the clinician renderer.

**`questionsPerCard`** — A patient-cards renderer prop (not a Form-model property). Controls how many interactive Fields fit on one Card. Default `1`. `2` allowed.

## Patient intake deployment

**Pre-visit intake** — The canonical patient-cards use case: the clinician shares a link with a patient before an appointment; the patient fills out a one-shot questionnaire; the clinician reviews the submission ahead of or during the visit. Distinct from longitudinal self-monitoring, post-visit summary, and full patient-as-DataOwner editing — none of which are supported by patient-cards.

**Token-scoped bounded delegation** — The canonical (recommended but not enforced) authentication pattern for patient intake. The clinician's system generates a short-lived link containing a token; the token resolves to a `User` holding a `SecureDelegation` permitting write access to a single target `Contact` (the intake submission) for a bounded time window. Patient never authenticates beyond clicking the link; link expires after submit or after timeout. Renderer itself is agnostic to this mechanism.
