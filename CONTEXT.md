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

**Empty field** — A Field that holds no displayable answer. A Field is empty when it has no stored value at all, or when every stored value's most recent version has no codes and no non-blank primitive in any language. Non-blank means: a string with non-whitespace characters, a defined number, boolean or timestamp, a measure with a numeric value (a unit alone does not count), a compound with at least one non-blank member. Preserved-but-invalid date or time text is a non-blank string, so such a Field is not empty. Language is not considered: an answer written in one language keeps the Field non-empty for a viewer in another. Label and action Fields carry no answer and are outside this definition.

**Patient renderer** / **patient-cards renderer** — The renderer that presents a Form to a patient as a linear sequence of Typeform-style cards. Optimized for pre-visit intake.

**Card** (patient-cards only) — A single screen presented to the patient. Contains at most `questionsPerCard` interactive Fields (default 1). Labels and read-only display Fields can additionally appear on the card but do not count toward the limit.

**Auto-flatten** — The algorithm by which the patient renderer turns a Form's Section/Group/Subform/Field tree into a flat linear sequence of Cards. Walks the tree depth-first, skips elements hidden by `roles` or by computed `hidden`, recurses transparently into Subforms, and chunks interactive Fields into Cards of size ≤ `questionsPerCard`.

**Welcome card** — The first card the patient sees. Shows the Form title and `description`. Patient presses Start to enter the question sequence. Not counted in progress.

**Review card** — Penultimate card. Shows all answers grouped by Section, each with an edit-jump back to its source card. Surfaces any cross-card validation failures. Not counted in progress.

**Confirmation card** — Final card, shown after submit. Renders a thank-you and any host-app-provided next-step content. Not counted in progress.

**Auto fast-forward resume** — When a patient reopens a partially-filled Form, the patient renderer plays through the card sequence, auto-advancing past Cards whose Fields are all answered and validating, stopping at the first unanswered or invalid card (or at the review card if all are complete). No explicit "current card" persistence; position is derived from data.

**Stay semantics** (back-edit) — When the patient goes back, edits a value, and presses Continue, downstream Cards keep their previously-entered values. Visibility/conditional re-evaluation happens; data preservation is unconditional.

## Read-only review

**`hideEmptyFields`** — A `<icure-form>` display prop set by the host, sibling of `readonly` and `displayMetadata`. Never stored in the Form definition. Honoured only while `readonly` is `true`; ignored otherwise. When active, the `form` and `form:tab` renderers omit every Empty field and cascade upward: a Group with no surviving content is dropped together with its labels and buttons, a Subform instance with no surviving content is dropped and the Subform heading goes when no instance survives, in the plain `form` layout a Section with no surviving content is dropped. In `form:tab` every Section keeps its tab and an all-empty active tab shows an empty page, because an inactive Section is never evaluated. Surviving content is a non-empty Field or an element marked `alwaysVisible`. When nothing survives in plain `form`, the form renders nothing and emits no signal. The card renderer does not honour it.

**`alwaysVisible`** — Optional authored boolean on a Field, Group, Subform, or Section, stored in the Form definition. On Field, Group, and Subform it may also be a Computed property (`computedProperties.alwaysVisible`), evaluated at render time like `hidden`; Section is static only. The author's exception to `hideEmptyFields`: an `alwaysVisible` Empty field renders as a blank read-only box; an `alwaysVisible` container with no surviving content renders its title only. Either counts as surviving content, so its ancestors and tab stay. It does not override `roles` or computed `hidden`: an element those rules hide stays hidden. Has no effect when `hideEmptyFields` is inactive.

## Patient-facing schema

**`roles`** — Optional list of viewer roles on a Section, Group, Subform, or Field, matched against the `role` the host passes to the renderer. Omitted means visible to every role; an empty list means visible to nobody; otherwise visible only when the active role is listed. Cascades: hiding a container hides its whole subtree. Honoured by both renderers. Replaces the former `hiddenForPatient` flag, which is no longer parsed.

**`questionsPerCard`** — A patient-cards renderer prop (not a Form-model property). Controls how many interactive Fields fit on one Card. Default `1`. `2` allowed.

## Patient intake deployment

**Pre-visit intake** — The canonical patient-cards use case: the clinician shares a link with a patient before an appointment; the patient fills out a one-shot questionnaire; the clinician reviews the submission ahead of or during the visit. Distinct from longitudinal self-monitoring, post-visit summary, and full patient-as-DataOwner editing — none of which are supported by patient-cards.

**Token-scoped bounded delegation** — The canonical (recommended but not enforced) authentication pattern for patient intake. The clinician's system generates a short-lived link containing a token; the token resolves to a `User` holding a `SecureDelegation` permitting write access to a single target `Contact` (the intake submission) for a bounded time window. Patient never authenticates beyond clicking the link; link expires after submit or after timeout. Renderer itself is agnostic to this mechanism.

## Suggestions

**Suggestion** — An item proposed to the clinician in response to a search: typically a code from a codification (ICD-10, ICPC-2, a custom entity list), carrying a display text, per-language labels, and the search terms it answers. Suggestions are produced by a Suggestion provider and consumed by a suggestion surface.

**Suggestion provider** — A host-application-supplied asynchronous function that answers a search with Suggestions. The host owns the search semantics (accent folding, prefix matching, synonyms, code-number lookup); the library never re-implements matching. Three providers exist: the text suggestion provider (feeds the Suggestion palette), the options provider (feeds the Dropdown popover), and the owners provider (feeds the owner picker). All three are set once on the form element; the text suggestion provider (and its companion links provider) only reaches the fields that opt in — a field declaring codifications, or flagged `suggestions: true` / `links: true` by the form author.

**Suggestion palette** — The floating autocomplete list that appears under a Text or Token field while the clinician types. The search is the last few words typed in the field itself; there is no separate search box. Keyboard-first: Tab focuses the list, ↑/↓ move through the visible rows, →/← expand/collapse a hierarchical suggestion (← on a child returns to its parent), Enter selects. Rows, chevrons and "N more" rows are also clickable. Selecting a Suggestion — at any depth — replaces the typed words with the Suggestion's text, linked to its code.

**Dropdown popover** — The options menu of a Dropdown field. Contains a search box that filters the options as the clinician types. Selecting an option sets the field's value and code.

**Hierarchical suggestion** — A Suggestion that carries child Suggestions, to arbitrary depth (children may themselves have children, mirroring codifications such as ICD-10 chapter → block → category → subcategory). The whole subtree is returned by the provider together with the root (no lazy loading of children). Any node — root, intermediate, or leaf — can be selected. Supported on the Suggestion palette and the Dropdown popover; not on the owner picker. Only host Suggestion providers produce hierarchies; the inline `codifications` a form author declares in the form YAML remain flat.

**Match marker** — A flag set by the Suggestion provider on each Suggestion it returns, stating whether that Suggestion *itself* matched the search — as opposed to being present only because a descendant matched. The marker is the sole source of truth for the auto-expand and hide-siblings behaviour of hierarchical suggestions. Rules are recursive: a node is shown expanded iff some node in its subtree carries the marker; inside an expanded node, a child is hidden iff neither it nor any of its descendants carries the marker; a marked node with no marked descendant is shown collapsed.

**Chevron** — The binary expand/collapse control shown in front of a hierarchical suggestion that has children. Its two states are *expanded* and *collapsed*; whether an expanded node's children are filtered is derived from the Match markers, never from the chevron.

**"N more" row** — The trailing row of an expanded hierarchical suggestion when some of its children are hidden by the Match marker filter. Shows the count of hidden children; activating it reveals them for that node until the search changes. It is the only way to reach non-matching siblings without changing the search.
