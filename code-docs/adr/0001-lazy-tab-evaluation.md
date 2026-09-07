# ADR 0001: Inactive tab sections are never evaluated; visibility is decided by render-and-observe

- Status: accepted
- Date: 2026-09-07
- Related: [PR #11: Hide empty fields in read-only rendering](https://github.com/icure/icure-form/pull/11)

## Context

The `form:tab` layout renders one Section per tab and displays only the active Section: its section wrapper returns `nothing` for every other tab. Before this decision the laziness was only partial: the renderer built every Section's templates (evaluating their computed properties) and the wrapper merely discarded the inactive ones, so inactive Sections cost formula evaluation on every pass even though no field component was instantiated for them. Full laziness (no value reads, no formula evaluation, no field components for inactive Sections) is a product constraint, not an optimisation: forms in this library can carry hundreds of fields and many sandboxed formulas per Section, and the tab layout exists precisely so that only the visited Section pays that cost.

The `hideEmptyFields` feature hides fields with no displayable answer and cascades upward through groups, subform instances and sections. Cascading to a Section's tab requires knowing whether anything in that Section survives, which for an inactive tab can only be known by reading its values and evaluating its `hidden` and `alwaysVisible` formulas.

## Decision

1. An inactive Section in `form:tab` is never evaluated. No value is read and no formula is computed for it, by any feature, for any reason. The renderer is changed so that a Section's children are rendered inside the wrapper's thunk, which only the active tab invokes.
2. Consequently the tab bar is never derived from survival. Every Section keeps its tab. An active Section whose content is entirely hidden renders an empty page.
3. Visibility decisions that depend on data (emptiness, `alwaysVisible`) are made by render-and-observe inside the render pass: a dropped node renders `nothing`, and a container decides after its children have rendered, as Group collapse already does. No pre-pass over the definition and container tree computes survival ahead of rendering.
4. Section-level cascade therefore exists only in the plain `form` layout, where all Sections render anyway.

## Alternatives considered

- **Resolution pre-pass.** An async walk over the whole definition and container tree computing a survival set consumed by both the render pass and the tab bar. Preserves lazy DOM instantiation but evaluates every Section's formulas and values on each render. Rejected: it violates point 1.
- **Render every Section, display only the active one.** Same evaluation cost as the pre-pass plus template construction for inactive tabs. Rejected for the same reason.

## Consequences

- Hosts using `hideEmptyFields` with `form:tab` will see tabs for Sections that contain nothing; this is accepted behaviour and [README.md](../../README.md#read-only-review-hiding-empty-fields) states it.
- `alwaysVisible` on a Section is meaningful only in plain `form`.
- Any future feature that needs cross-Section knowledge in `form:tab` (a completion indicator per tab, a "jump to first empty" control, tab-level validation badges) must either work from data already held by the host or be scoped to the active Section. It must not introduce evaluation of inactive Sections.
- The form renderer's internal functions return a template plus a content flag so containers can observe their children; the public `Renderer` contract (a bare template) is unchanged.
