# PRD: Hierarchical suggestions

> Status: draft, grilled 2026-09-08; amended the same day during plan grilling (R6 reworded to the demo's real data; a deferred non-goal added for first-class suggestion props). Vocabulary recorded in [CONTEXT.md](../CONTEXT.md) under "Suggestions".
> Companion: [plans/hierarchical-suggestions.md](./hierarchical-suggestions.md) (implementation plan).

## Summary

Let a host application's suggestion providers return trees instead of flat lists. A `Suggestion` gains a `children` list, returned synchronously with its parent to arbitrary depth, and a match marker that says whether the node itself matched the search. The two suggestion surfaces that select codes — the Suggestion palette under Text and Token fields, and the Dropdown popover — render the tree with a binary chevron per parent, auto-expand the branches that lead to a match, hide the siblings that did not match behind an "N more" row, and let the clinician select any node, parent or child. Providers that keep returning flat lists see no change.

## Problem

Clinical codifications are trees. ICD-10 goes chapter → block → category → subcategory; ICPC-2 goes chapter → component → rubric; a practice's own entity lists have families and members. Today every suggestion surface is a flat list, so a host has to choose between returning only leaves (the clinician loses the context that tells *J45.0* from *J45.1* apart and cannot pick the broader *J45* when the detail is unknown) or returning every level as unrelated rows (the list is long and the relationship is invisible). The library's providers, its `Suggestion` type and both surfaces know nothing about parents, so the host cannot fix this on its side.

## Personas

- **Primary: a clinician recording a code.** A healthcare party `DataOwner` editing a Contact in the host application, typing free text in a Text or Token field and taking a suggestion from the palette, or searching the Dropdown popover of a coded field. They want to reach the exact code fast and see where it sits.
- **Integrator.** Writes the host's `suggestionProvider` and `optionsProvider`. Owns the search index and therefore owns what "matches". Wants to return a tree without the library second-guessing the match.
- **Not targeted this iteration:** the form author. Inline `codifications` declared in the form YAML stay flat; the owner picker is untouched.

## Goals

1. A provider can return hierarchical suggestions, to any depth, and both selecting surfaces render them as a tree the clinician can expand, collapse and pick from at any level.
2. The tree opens itself to what the clinician searched for: branches with a matching descendant are expanded and pruned to the matches; branches that matched only by their own title stay collapsed.
3. A provider that returns flat lists renders and behaves exactly as today.

## Decisions

Each decision was taken during the grilling; the alternative rejected is named so it is not re-litigated.

| # | Decision | Rejected |
|---|---|---|
| 1 | Hierarchy applies to the Suggestion palette (Text and Token fields) and the Dropdown popover. The owner picker stays flat. | Palette only; popover only; all three. The owner picker selects people, not codes, and has no tree to show. |
| 2 | The provider is the source of truth for "matches". Every returned `Suggestion` carries an explicit match marker; the library never re-implements matching. | Component-side re-match by normalized substring on the label. Hosts use accent folding, prefix search, synonyms and code-number lookup; a substring re-match would disagree with the provider and hide or collapse the wrong nodes. |
| 3 | Arbitrary depth. The visibility rules are recursive over the subtree. | One level (parent → children). Real codifications are three to four levels deep; a cap only forces hosts to flatten before returning. |
| 4 | The chevron is binary (expanded / collapsed). Hidden non-matching children are reachable through a trailing "N more" row that reveals them for that node until the search changes. | Three-state chevron (filtered → collapsed → all); no way to reveal hidden siblings. |
| 5 | The palette gets tree keys (→ expand, ← collapse or go to parent, ↑/↓ over visible rows) and becomes pointer-operable: chevrons, "N more" rows and the rows themselves are clickable. | Keyboard-only palette with a purely indicative chevron. A clickable chevron next to a non-clickable row reads as broken. |
| 6 | Only host providers produce hierarchies. Inline `codifications` in the form YAML remain flat. | `children` on inline codes. The motivating data is far too large to inline and always comes from a host index; the form model, parser and authoring docs stay untouched. |
| 7 | Names: `children` for the subtree and `matched` for the match marker. `matched` absent means matched. | `match`, `isMatch`, `hit`; absent meaning unmatched (would break every existing flat provider). |
| 8 | With no search terms (popover opened without text) markers are ignored and every root is shown collapsed. | Honouring markers on an empty search (a provider returning its whole tree "matched" would open everything). |
| 9 | A Dropdown field's `sortOptions` apply within each sibling group at every level. The merge and sort step preserves `children` and `matched`. | Sorting roots only; flattening before sort. |
| 10 | Selecting any node, parent or child, does exactly what selecting a flat suggestion does today: the popover sets the field value and code; the palette replaces the typed words that triggered the search with the node's text linked to its code. The stored value carries no parent path. | Storing or displaying the ancestor path; a parent selection meaning "all its children". |
| 11 | No PHI or audit change. The same search terms already flow to the same host providers. | — |
| 12 | Success is zero regression for flat providers, a unit-tested pure tree-to-rows function, and an end-to-end demo with an ICD-10 tree in both providers. | Adoption or latency targets. |

## Functional requirements

### R1. Data contract

`Suggestion` (`src/generic/model.ts`) gains two optional properties, both public API for integrators:

- `children?: Suggestion[]` — the node's direct children, in the order the provider wants them shown (subject to R3 sorting on the popover). Present on every level that has children; the whole subtree is returned with the root, never fetched later.
- `matched?: boolean` — `true` when the node itself matched the search, `false` when it is present only because a descendant matched. Absent is read as `true`, so every existing provider is unaffected.

The three provider signatures are unchanged. `suggestionProvider` and `optionsProvider` may return trees; `ownersProvider` results are read as flat (children ignored).

A provider must not return a **root** whose subtree contains no matched node (with markers present); the library does not defend against it beyond rendering it collapsed. Unmatched children of a returned node are expected — they are what the "N more" row hides — and a returned node carries its full child list, not only the matching children.

### R2. Visibility rules

Defined once, recursively, and shared by both surfaces. For a node `n` in a result with search terms:

- `matchedInSubtree(n)` is true when `n.matched` is true (or absent) or any child has `matchedInSubtree`.
- `n` is **expanded** when some descendant has `matchedInSubtree`; **collapsed** otherwise. The clinician can override either state with the chevron; overrides live until the search terms change.
- Inside an expanded node, a child `c` is **hidden** when `matchedInSubtree(c)` is false, unless the clinician revealed that node's hidden children through its "N more" row.
- When an expanded node has hidden children, a trailing **"N more" row** shows their count and reveals them for that node until the search terms change. Revealed children follow the same rules recursively (they are unmatched, so they render collapsed).
- A node with children shows a chevron; a leaf shows none but keeps the indentation of its level.
- With **no search terms**: markers are ignored, every root is collapsed, nothing is hidden, no "N more" row exists. Manual expansion shows the full child list.

Consequences the tests must pin down: root matched only (collapsed, expand shows all children); child matched only (root expanded, siblings hidden, "N more" with the right count); grandchild matched only (root and intermediate expanded, each pruned); root and grandchild both matched (expanded, pruned); every node matched (fully expanded, nothing hidden); manual collapse of an auto-expanded node and re-expand (filter reapplied, still pruned); reveal via "N more" then collapse and re-expand (reveal remembered until the search changes); search change resets overrides and reveals; empty search.

### R3. Dropdown popover

- Each visible row renders the node's label in the current language with indentation per depth, a chevron when it has children, and the "N more" row where R2 requires it.
- Clicking a chevron toggles that node; clicking "N more" reveals; clicking a row's text selects the node at any depth. Selection sets the field's content and `codes: [node]` exactly as for a flat option and closes the popover.
- The search box drives the provider as today. The result is the tree returned by the merged options provider; the form's inline codifications are appended as flat roots (decision 6). The library's sort step applies the field's `sortOptions` within every sibling group and preserves `children` and `matched`.
- Opening the popover with an empty search box shows every root collapsed (R2, no terms).

### R4. Suggestion palette

- Rows are the visible rows of R2 in display order, at any depth, plus "N more" rows; indentation per depth; chevron on nodes with children.
- Keyboard, only while the palette has focus (after Tab), so the editor keeps its own arrow behaviour otherwise: ↑/↓ move across visible rows; → expands a collapsed focused node; ← collapses an expanded focused node, or moves focus to the parent when the node is collapsed or a leaf; Enter selects the focused node or, on an "N more" row, reveals; Tab keeps its current meaning (focus the list, or insert the focused row when already focused).
- Pointer: clicking a chevron toggles, clicking "N more" reveals, clicking a row's text selects. Pointer interaction must not move focus or selection out of the ProseMirror editor: the palette hides itself on any update where the document text did not change, so a click that blurs the editor would close it before acting.
- Selecting any node replaces the words that triggered the search with the node's text carrying the link produced by `linksProvider`, exactly as a flat suggestion does today; a parent that did not itself match replaces the same range as its matched descendant would have.
- The palette keeps its current trigger conditions (words longer than two characters, stop words, no link mark under the cursor) and its debounce.

### R5. Backward compatibility

- A provider returning suggestions without `children` renders in both surfaces with identical DOM and identical keyboard behaviour to today: no chevrons, no indentation, no "N more" rows, ↑/↓/Tab/Enter unchanged.
- The owner picker ignores `children` and `matched`.
- Radio and checkbox button groups keep rendering the flat list they receive.

### R6. Demo application

The demo (`app/`) exposes its existing data as an ICD-10 chapter → ICD code → BE-THESAURUS term tree through both `suggestionProvider` and `optionsProvider`, with markers set from its search index (terms via the existing MiniSearch index, codes by prefix on the code number, chapters never), so the feature can be exercised by hand in both surfaces. The tree is built once at startup by inverting the thesaurus terms' `links`; the demo holds no labelled ICD categories, so codes are labelled by their number. A new sample declares a `text-field` with the demo-only marker `options: { suggestions: ICD }` and a `dropdown` with `codifications: [ICD]`; after parsing, the demo attaches its `suggestionProvider` and `linksProvider` to fields carrying the marker (today no demo field reaches the palette at all, because providers can only be attached as functions on a Field's `options`).

## Security, PHI, audit, jurisdiction

- The same search terms already flow from the same fields to the same host providers; no new data leaves the form and nothing new is fetched or decrypted by the library.
- The selected node is stored exactly as a flat selection is today, so nothing changes in what a Contact records, who is a `DataOwner` of it, its `SecureDelegation` graph, or `AccessLog` behaviour (the renderer writes none).
- No jurisdiction-specific behaviour: presenting a code with its ancestors visible does not alter what is recorded, retained or consented.

## Success criteria

1. **Zero regression for flat providers.** A provider that returns no `children` and no `matched` renders and behaves identically to today in both surfaces; the existing test suite passes unchanged.
2. **Deterministic tree to rows.** The set and order of visible rows — nodes with depth and chevron state, "N more" rows with their counts — is a pure function of (tree, search terms, overrides, reveals), covered by unit tests in `test/` for every case listed under R2.
3. **Reachable end-to-end.** In the demo app, the chapter → ICD code → thesaurus term tree is returned by both providers; a thesaurus term (grandchild) can be selected in the palette with keyboard alone (type, Tab, ↓/→ as needed, Enter) without the palette closing, and with the mouse in the popover; the value stored on the field is the term's code, identical to what a flat provider would store.

## Non-goals

### Deferred (likely to return, one-line rationale each)

- **Hierarchy in inline `codifications`.** Declined so the form model, parser and authoring docs stay untouched; additive later if a form author needs a small tree without a host index.
- **Ancestor path in the displayed or stored value** (breadcrumb, "J45 › J45.0"). Declined to keep the stored value identical to a flat selection; revisit with a design for the read-only rendering.
- **Lazy loading of children.** Declined: the subtree arrives with the root, which keeps the palette's debounce path synchronous; revisit if a host has trees too large to return at once.
- **Owner picker hierarchy** (for instance by speciality or organisation). Declined because it selects people, not codes; revisit if a host asks.
- **First-class `suggestionProvider` / `linksProvider` props on `<icure-form>`**, dispatched to fields by a declarative `options.suggestions` key, instead of functions stashed on a Field's `options` after parsing. Surfaced while wiring the demo; declined here because the PRD keeps provider plumbing unchanged, but it is the natural follow-up.

### Out of scope

- Radio and checkbox button groups.
- Multi-select, or selecting a parent to mean all its children.
- A third chevron state or any filter toggle other than "N more".
- Any component-side matching of labels against search terms.
- A latency gate (a constraint, not a criterion: a several-hundred-node result should render within a frame since nothing new is asynchronous).
- Changes to the three provider signatures.

## Documentation impact

- README: document `children` and `matched` on `Suggestion` next to the `optionsProvider` and `ownersProvider` entries in the renderer-props list; a short "Hierarchical suggestions" section describing the tree behaviour, the "N more" row and the palette keys, with an example provider result.
- WHATSNEW: entry for the release that ships it.
- CONTEXT.md: already updated with `Suggestion`, `Suggestion provider`, `Suggestion palette`, `Dropdown popover`, `Hierarchical suggestion`, `Match marker`, `Chevron` and `"N more" row`.

## Known implementation constraints (for the plan, not decisions)

- `sortSuggestions` (`src/utils/code-utils.ts`) rebuilds every entry as `{ id, label, text, terms: [] }`, which drops `children` and `matched` and wipes `terms`; the merge in `form.ts` (`composedOptionsProvider`) runs every popover result through it. Both must preserve the tree and sort each sibling group.
- `FieldWithOptionsMixin` types `optionsProvider` as returning `Code[]` while the dropdown actually receives `Suggestion[]`; `handleOptionButtonClicked` finds the clicked option with a flat `find` on `displayedOptions` and must search the tree.
- The palette renders rows as an innerHTML string and tracks focus by `<li>` index (`focusItem`, `arrowUp`, `arrowDown`, `insert`); with nesting, focus must follow the flattened visible-rows list, not DOM nesting, and rows need real event listeners.
- The palette's `insert` derives the range to replace from `sug.terms`; a parent that did not match needs the same range as its matched descendant, so either the provider sets `terms` on every node or the palette uses the query terms it already holds.
- The palette hides on any editor update where the document text is unchanged; pointer handling must use `mousedown` with `preventDefault` (or equivalent) so the editor keeps focus and selection.
