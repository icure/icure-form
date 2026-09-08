# Plan: hierarchical suggestions

> Source PRD: [plans/prd-hierarchical-suggestions.md](./prd-hierarchical-suggestions.md)
>
> Governing ADR: none. No decision met the three-condition test; the one hard-to-reverse choice (the provider-owned match marker) is a product contract and lives in the PRD decision table (decision 2).
>
> Glossary: CONTEXT.md, section "Suggestions" (`Suggestion`, `Suggestion provider`, `Suggestion palette`, `Dropdown popover`, `Hierarchical suggestion`, `Match marker`, `Chevron`, `"N more" row`)

Lets host providers return trees of `Suggestion`s. `Suggestion` gains optional `children` and `matched`; the Suggestion palette and the Dropdown popover render the tree with a binary chevron, auto-expand branches that lead to a match, hide non-matching siblings behind an "N more" row, and let the clinician select any node. Flat providers are unchanged. Ships as **2.4.0** on `main` (minor: two optional properties on a public type, no breaking change) and as **3.4.0** on `cardinal`; this plan was executed on `cardinal` first and cherry-picked onto `main`.

## Task status overview

Tasks are grouped in four phases; each task is one dispatch. Status is tracked in the SDD ledger, not here.

| Task | Phase | Title | Tests |
|------|-------|-------|-------|
| 1 | 1 | `Suggestion` contract and the pure tree module | `test/utils/suggestion-tree.spec.ts` |
| 2 | 1 | Recursive sort and merge that preserve the tree | `test/utils/sort-suggestions.spec.ts` |
| 3 | 2 | Dropdown popover tree rendering, harness options fixtures, popover e2e | `test/e2e/suggestions-popover.spec.ts` |
| 4 | 3 | Suggestion palette tree rendering, tree keys, pointer, harness suggestion fixtures, palette e2e | `test/e2e/suggestions-palette.spec.ts` |
| 5 | 4 | Demo: ICD tree, `options.suggestions` wiring, sample 12 | manual |
| 6 | 4 | README and WHATSNEW | – |

Regression gate for every task: `yarn test` (jest) and `yarn test:e2e` (Playwright) green, `test/e2e/forms.spec.ts` unchanged in outcome, `npx eslint . --ext .ts` clean on touched files. The release (`form-release` skill; 2.4.0 on `main`, 3.4.0 on `cardinal`) happens after the branch is reviewed and merged; it is not a task.

## Architectural decisions

Durable across all phases. Each traces to a PRD decision number or requirement.

- **Data contract (PRD 7, R1).** `Suggestion` in `src/generic/model.ts` becomes `{ id; code?; text; terms; label; children?: Suggestion[]; matched?: boolean }`. `matched` absent reads as `true`. Provider signatures unchanged. `ownersProvider` consumers ignore both new fields.
- **One pure module, two thin renderers (PRD 12; plan Q1).** New internal `src/utils/suggestion-tree.ts`, not re-exported from `src/index.ts`. It owns every rule in PRD R2 and knows nothing about DOM or Lit:
  - `type TreePath = string` — child indices from the root list joined with `/` (`'2/0/4'`). UI state is keyed by path, never by `id`, because the same suggestion (a thesaurus term linked to two codes) legitimately appears under two parents.
  - `interface TreeUiState { expanded: Record<TreePath, boolean>; revealed: Record<TreePath, true> }`, `emptyTreeState()`. Immutable reducers `toggleExpanded(state, path, current)` and `reveal(state, path)`.
  - `type SuggestionRow = { kind: 'node'; path; suggestion; depth; hasChildren; expanded } | { kind: 'more'; path /* the parent */; depth /* of the hidden children */; count }`.
  - `visibleRows(roots, hasTerms, state): SuggestionRow[]` — display order, depth-first. A node's default expansion is `hasTerms && matchedInSubtree(anyChild)`; an entry in `state.expanded` overrides it. Inside an expanded node, when `hasTerms` and the node is not in `state.revealed`, children with `matchedInSubtree === false` are hidden and a `more` row with their count closes the group. With `hasTerms === false` markers are ignored: roots collapsed by default, nothing hidden, no `more` rows.
  - `isMatched(s)` (`s.matched !== false`), `matchedInSubtree(s)`, `nodeAtPath(roots, path)`, `parentPath(path)`, `hasHierarchy(roots)` (any node has children).
  - `replacementTerms(s, queryTerms)` — `s.terms` when non-empty, else the `terms` of the first matched descendant (depth-first) that has any, else `queryTerms`. Used by the palette for the range to replace (PRD 10).
- **Surfaces consume `SuggestionRow[]` and hold a `TreeUiState` (PRD R3, R4).** The popover keeps state in a Lit `@state` and resets it to `emptyTreeState()` whenever `textInputValue` changes; `hasTerms = !!textInputValue?.trim()`. The palette keeps state in the class and resets it whenever its search fingerprint changes; `hasTerms` is always `true` there because the palette only opens on typed words.
- **Popover markup (PRD R3, R5).** A row whose node has no children and sits at depth 0 renders exactly today's `<button class="option">`, so a flat result produces today's DOM. A node with children, or any row at depth > 0, renders `<div class="option-row" style="--depth: N">` containing a `<button class="chevron" aria-expanded>` (only when it has children; an inert spacer otherwise) and the `<button class="option">` label. A `more` row renders `<button class="option option--more">… N more</button>`. Selection resolves the clicked node through `nodeAtPath`, then runs the unchanged `handleValueChanged` path with `codes: [node]`.
- **Palette markup (PRD R4, R5).** `SuggestionPalette` stops building an innerHTML string and builds one `<li>` per `SuggestionRow` (nodes and `more` rows alike) into a single flat `<ul>`, so `focusItem`/`arrowUp`/`arrowDown` keep indexing `<li>`s and the index equals the row index. A flat result produces the same elements and classes as today (`id`, `data-code`, text, the tab/return icon container); tree results add `data-path`, a `depth-N` class with `padding-left`, and a leading `<span class="chevron">` on nodes with children. `more` rows carry class `more`.
- **Palette keys and pointer (PRD 5, R4).** New `arrowLeft()` / `arrowRight()` on the palette, both returning `false` when the palette has no focus so the editor keeps its own arrow handling; the keymap in `src/components/icure-text-field/index.ts` binds `ArrowLeft`/`ArrowRight` next to the existing `ArrowUp`/`ArrowDown`. `Enter` on a `more` row reveals instead of inserting. Pointer handling is a single delegated `mousedown` listener on the `<ul>` that calls `preventDefault()` (the editor keeps focus and selection, so `update()` does not hide the palette) and dispatches on the target: chevron → toggle, `more` → reveal, otherwise → insert that row. To insert from a pointer event the palette needs the transaction provider at construction time: the constructor gains `insertHandler: (from, to, sug) => Promise<Transaction | undefined>`; the keymap's `insert(view, provider)` keeps its signature and delegates to the same code.
- **Replacement range (PRD 10; folded decision).** `insert` computes the range from `replacementTerms(row.suggestion, lastQueryTerms)` instead of `sug.terms` directly. For every suggestion that has `terms`, behaviour is identical to today; unmatched parents need no `terms`.
- **Sort and merge (PRD 6, 9).** `sortSuggestions` (`src/utils/code-utils.ts`) sorts each sibling group with the same comparator and rebuilds entries preserving `code`, `terms`, `matched` and the recursively sorted `children`. `composedOptionsProvider` (`form.ts`) keeps appending the form's inline codifications as flat roots without `matched`.
- **Types (PRD R3).** `FieldWithOptionsMixin` becomes generic in its option type with `Code` as default; `IcureDropdownField` instantiates it with `Suggestion`, so `displayedOptions: Suggestion[]` and the tree is typed end to end. Radio and checkbox keep `Code`.
- **Zero regression by construction (PRD R5, criterion 1).** Every new branch is entered only when `hasHierarchy(roots)` or a row has children / depth > 0. With flat input, `visibleRows` returns one depth-0 leaf row per suggestion and both surfaces emit today's elements and classes.
- **Test strategy (criterion 2, 3; plan Q3).** Jest for the pure module, the recursive sort and `replacementTerms`. Playwright through the harness, which gains `optionsFixture?: string` and `suggestionsFixture?: string` naming deterministic trees defined in `test/e2e/test-page/suggestion-fixtures.ts`. The fixture provider marks a node `matched` iff a query term is a case-insensitive substring of its `text` — a fixture convenience only; the library never matches. The harness attaches the suggestion fixture as `options.suggestionProvider` / `options.linksProvider` to every parsed field whose `options.suggestions` is set, the same marker the demo uses. The demo is for manual checking; `app/e2e` is not extended.
- **Accessibility.** Chevron buttons (popover) and chevron spans (palette) carry `aria-expanded`; rows carry `aria-level` (depth + 1). Nothing else changes.
- **Release.** Via the `form-release` skill after phase 4: 2.4.0 on `main`, 3.4.0 on `cardinal`. WHATSNEW entry under that version.

## Global Constraints

Binding for every task. Reviewers check against these verbatim.

1. **The library never matches labels against search terms.** Expansion, hiding and "N more" counts derive only from `matched` (absent = matched) and from the two override maps. A component-side `includes()` on labels is a defect. (PRD 2)
2. **Tree logic lives in `src/utils/suggestion-tree.ts` only.** Surfaces render `SuggestionRow[]`; they do not walk `children` themselves except through `nodeAtPath`. Not re-exported from `src/index.ts`.
3. **UI state is keyed by `TreePath`, never by `id`.** Duplicate ids across a tree are legal.
4. **State resets when the search changes**: palette fingerprint change, popover `textInputValue` change. Nothing else resets it.
5. **Zero regression for flat results.** With no `children` anywhere, both surfaces emit today's elements and classes (attribute additions allowed); ↑/↓/Tab/Enter behave as today; `insert` replaces the same range as today for any suggestion with non-empty `terms`. Existing jest and Playwright suites pass unchanged.
6. **Palette pointer interaction never blurs the editor.** `mousedown` + `preventDefault()`; no `click` handlers on rows. The palette must remain visible after a chevron toggle or a "N more" reveal (the e2e proves it).
7. **Selecting any node does what a flat selection does today** — popover: `content` + `codes: [node]`; palette: replace range with `text` carrying the `linksProvider` link. No ancestor path is stored or displayed. (PRD 10)
8. **`ownersProvider`, radio and checkbox ignore `children` and `matched`.**
9. **Inline codifications stay flat** and are appended as roots after the host's results. (PRD 6)
10. **Sorting is per sibling group with the field's `sortOptions`**; `children`, `matched`, `code`, `terms` survive `sortSuggestions`. (PRD 9)
11. **Code style:** no semicolons, single quotes, trailing commas, `printWidth` 200, eslint clean.
12. **Tests:** jest (node) for pure logic; Playwright through `test/e2e/test-page/harness.ts` with named fixtures for rendering and interaction. Each task lists its own tests; run them plus the regression gate.

## Risks and hazards

- **Palette focus.** `SuggestionPalette.update()` hides the palette on any editor update where the document text is unchanged. A pointer event that blurs the editor or moves its selection closes the palette before the action lands. `mousedown` + `preventDefault()` is the mitigation; task 4's e2e asserts the palette stays open through a chevron toggle. If a browser still blurs, fall back to re-focusing `view.dom` in the handler — do not remove the hide rule, which protects every other interaction.
- **Palette plugin is always installed.** `text-field.ts` passes `?suggestions=${!!this.suggestionProvider}` and the default provider is a function, so the palette exists on every text field and returns `[]`. Not changed here; flat regression tests cover it implicitly.
- **`replacementTerms` fallback.** A flat provider that returns empty `terms` today gets a degenerate range (`length = -1`); with the fallback it replaces the query terms. Strictly an improvement, but a behaviour change to mention in WHATSNEW.
- **Two release lines.** `main` (2.x, `@icure/api`, no card renderer) and `cardinal` (3.x, `@icure/cardinal-sdk`) both receive this feature; the dropdown port keeps each line's own menu behaviour (no popover-API code on `main`) and the WHATSNEW heading follows each line's next minor.
- **Generic mixin ripple.** Making `FieldWithOptionsMixin` generic touches radio and checkbox typings; keep `Code` as the default so their code does not change.
- **ProseMirror under Playwright.** Typing must go through `page.keyboard` after focusing the `.ProseMirror` element inside two shadow roots (`icure-form` → `icure-form-text-field` → `icure-text-field`); use `page.evaluate` to focus and a helper to reach the palette `<ul>`. Budget time for this helper in task 4.
- **Fixture marker semantics.** The fixture's substring matching must live in `suggestion-fixtures.ts` only. A reviewer finding `toLowerCase().includes` in `src/` for suggestions should fail the task (constraint 1).

## Tasks

Everything below a `Task N` heading up to the next one is that task's brief. Paths are repo-relative. "Regression gate" means `yarn test` and `yarn test:e2e` green with `test/e2e/forms.spec.ts` unchanged in outcome, plus `npx eslint . --ext .ts` clean on touched files.

### Task 1 (Phase 1): `Suggestion` contract and the pure tree module

**Files.** `src/generic/model.ts` (type only); new `src/utils/suggestion-tree.ts`; new `test/utils/suggestion-tree.spec.ts`.

**Contract.** Add `children?: Suggestion[]` and `matched?: boolean` to `Suggestion` with a doc comment stating: children are returned with the parent to arbitrary depth; `matched` absent means matched; a node whose subtree has no matched node should not be returned when markers are used.

**Module exports** (all pure, no DOM): `TreePath`, `TreeUiState`, `emptyTreeState`, `toggleExpanded`, `reveal`, `SuggestionRow`, `visibleRows`, `isMatched`, `matchedInSubtree`, `nodeAtPath`, `parentPath`, `hasHierarchy`, `replacementTerms`, exactly as specified under Architectural decisions.

**Tests** (one fixture tree: two roots, three levels, ids deliberately duplicated across two parents):
- flat input → one depth-0 leaf row per suggestion, in input order, no `more` rows; `hasHierarchy` false
- root matched only → root collapsed; after `toggleExpanded` all children visible, no `more` row
- child matched only → root expanded, non-matching siblings hidden, `more` row with the right count and depth
- grandchild matched only → root and intermediate expanded, each pruned, `more` rows at both levels
- root and grandchild matched → same as above (a marked ancestor does not suppress pruning)
- everything matched → fully expanded, no hidden rows
- `matched: false` root with no matched descendant → present, collapsed
- manual collapse of an auto-expanded node then re-expand → pruning reapplied
- `reveal` → hidden children appear, collapsed themselves; collapse and re-expand keeps them revealed; `emptyTreeState()` forgets them
- `hasTerms === false` → markers ignored, roots collapsed, no `more` rows; toggling shows every child
- `nodeAtPath`/`parentPath` round trip on the duplicated-id branch resolves the right instance
- `replacementTerms`: own terms win; unmatched parent takes first matched descendant's terms; empty subtree falls back to the query terms

**Acceptance.** Jest green; no file outside the three listed touched; module not exported from `src/index.ts`.

### Task 2 (Phase 1): Recursive sort and merge that preserve the tree

**Files.** `src/utils/code-utils.ts` (`sortSuggestions`); `src/components/icure-form/renderer/form/form.ts` (`composedOptionsProvider`, no behaviour change beyond preservation); new `test/utils/sort-suggestions.spec.ts`.

**Behaviour.** `sortSuggestions` sorts the given list with the existing comparator/promoter selection, maps each entry to a `Suggestion` that keeps `id`, `label` (defaulting to `{ [language]: id }`), `text` (defaulting to `label[language] ?? id`), `code`, `terms` (defaulting to `[]` only when absent), `matched` when present, and `children` recursively sorted with the same options. Inline codification codes appended in `form.ts` remain flat roots (no `children`, no `matched`).

**Tests.** natural / asc / desc / promotions applied at root and at child level independently; `children` present after sorting at every level; `matched` and `code` preserved; flat input yields exactly today's output shape; a promoted id inside a child group is promoted only within its siblings.

**Acceptance.** Jest green; regression gate.

### Task 3 (Phase 2): Dropdown popover tree rendering, harness options fixtures, popover e2e

**Files.** `src/components/common/field-with-options.ts` (generic option type); `src/components/icure-dropdown-field/index.ts`; `src/components/common/styles/style.scss` (`.option-row`, `.chevron`, `.option--more`, depth indentation via `--depth`); `test/e2e/test-page/harness.ts` (`optionsFixture`); new `test/e2e/test-page/suggestion-fixtures.ts`; new `test/e2e/suggestions-popover.spec.ts`; a small fixture form `test/e2e/fixtures/suggestions.yaml` with a dropdown on `codifications: [FIXTURE]` and a text field with `options: { suggestions: FIXTURE }` (the text field is used by task 4).

**Popover.** `@state() treeState = emptyTreeState()`; reset in `textInputChanged` and in `handleOptionButtonClicked`'s post-selection `triggerSearch(undefined, 0)`. Render `visibleRows(displayedOptions, !!textInputValue?.trim(), treeState)` with the markup fixed under Architectural decisions. Chevron click → `toggleExpanded`; `more` click → `reveal`; label click → select `nodeAtPath`. All popover clicks keep `event.stopPropagation()` as today so the menu does not close on toggle. **Stored code:** today `handleOptionButtonClicked` stores the whole option object as `codes[0]`; for a tree node that would persist the entire subtree. Store a copy with `children` and `matched` removed, so the stored code has exactly the shape a flat provider produces (PRD 10, constraint 7). Selected-state class (`selected`) keeps comparing the node's label with the current value.

**Fixtures.** `suggestion-fixtures.ts` exports named trees (`'icd-mini'`: 2 chapters → 3 codes → 2–4 terms, ids duplicated on one term; `'flat'`: today's shape) and a `fixtureProvider(name)` that, given terms, deep-copies the tree, sets `matched` by case-insensitive substring on `text`, and prunes subtrees with no match. With no terms it returns the tree unmarked. `initForm` gains `optionsFixture?: string`; when set, `icureFormEl.optionsProvider` answers every codification with that fixture.

**e2e.**
- flat fixture: popover DOM is exactly today's (`button.option` children only, no `.option-row`, no `.chevron`) and selecting stores the code
- empty search: roots only, collapsed; chevron expands; children listed; no `more` row
- query matching a grandchild only: chapter and code expanded, siblings hidden, `more` rows with the right counts; clicking `more` reveals; clicking a chapter (unmatched parent) stores the chapter's code; clicking the grandchild stores its code and closes the menu
- query matching a code's own label only: code shown collapsed under its expanded chapter
- changing the query resets manual toggles and reveals
- clicking a chevron does not close the popover

**Acceptance.** e2e green; regression gate; `grep -rn "toLowerCase().includes" src/components/icure-dropdown-field src/utils/suggestion-tree.ts` returns nothing new.

### Task 4 (Phase 3): Suggestion palette tree rendering, tree keys, pointer, harness suggestion fixtures, palette e2e

**Files.** `src/components/icure-text-field/suggestion-palette.ts`; `src/components/icure-text-field/index.ts` (constructor call, keymap); `src/components/common/styles/style.scss` (`.suggestion-palette li.depth-N`, `.chevron`, `li.more`); `test/e2e/test-page/harness.ts` (`suggestionsFixture`, post-parse attachment on `options.suggestions`); new `test/e2e/suggestions-palette.spec.ts`.

**Palette.** Keep the public surface (`focusItem`, `focus`, `focusOrInsert`, `insert`, `arrowUp`, `arrowDown`, `update`, `destroy`) and add `arrowLeft`, `arrowRight`. Internals: `rows: SuggestionRow[]`, `roots: Suggestion[]`, `treeState`, `lastQueryTerms`. `update()` computes `lastTerms` as today; on a new fingerprint it resets `treeState`, awaits the provider, stores `roots`, and calls a private `render()` that rebuilds the `<ul>` from `visibleRows(roots, true, treeState)` and re-applies the current focus index (clamped). `insert` on a `node` row uses `replacementTerms(row.suggestion, lastQueryTerms)` in place of `sug.terms`, otherwise unchanged; on a `more` row it reveals and re-renders instead. `arrowRight`: focused collapsed node with children → `toggleExpanded`, re-render, keep focus on it. `arrowLeft`: focused expanded node → collapse; otherwise move focus to `parentPath`'s row if any. Delegated `mousedown` on the `<ul>` with `preventDefault()` dispatching chevron/more/row as fixed under Architectural decisions; row selection calls the same insertion code path via the constructor-supplied `insertHandler`. Remove the two `console.log`s in `update()` while there (`'lwd'`, `'Skip suggestion'`).

**Text field.** Construct the palette with `replaceRangeWithSuggestion` as `insertHandler`; add `ArrowLeft`/`ArrowRight` to the suggestions keymap, returning the palette's boolean so the editor handles them when the palette is unfocused.

**Harness.** `initForm` gains `suggestionsFixture?: string`. After `Form.parse`, walk every field (recursing groups); for each with `options?.suggestions` set, assign `options.suggestionProvider = fixtureProvider(name)` and `options.linksProvider = async (sug) => ({ href: 'c-FIXTURE://' + sug.id, title: sug.text })`. Expose `window.__palette = () => …` helper returning the palette's visible row texts and focus index by reading the shadow DOM, for assertions.

**e2e** (each test types into the ProseMirror editor via a focus helper and `page.keyboard`):
- flat fixture: `<li>` markup as today (no `.chevron`, no `depth-` class), Tab/↓/Enter inserts a link, palette hides after insert
- grandchild-only match: rows are chapter (expanded), code (expanded), matched terms, `more` rows; Tab focuses row 0; ↓ walks visible rows including `more`; Enter on `more` reveals and keeps the palette open; ← on a term moves focus to its code; ← on the expanded code collapses it; → re-expands with pruning
- selecting the unmatched chapter via Enter replaces the same typed range as the term would and links the chapter's id
- selecting a term via Enter stores the term's id; the inserted text equals the term's `text`
- pointer: `mousedown` on the chevron toggles and the palette is still visible afterwards; `mousedown` on a row inserts
- typing more characters (new fingerprint) resets a manual collapse

**Acceptance.** e2e green; regression gate; `test/icure-form/prosemirror.spec.ts` (if present) unchanged in outcome.

### Task 5 (Phase 4): Demo — ICD tree, `options.suggestions` wiring, sample 12

**Files.** new `app/icd-tree.ts`; `app/decorated-form.ts`; `app/demo-app.ts`; new `app/samples/12-hierarchical-suggestions.yaml`.

**Tree.** `buildIcdTree(codes, icd10)` inverts every thesaurus term's `links` of type `ICD`: chapter (id `ICD-CHAPTER|IX|1`, label `Chapitre IX` / `Hoofdstuk IX`) → ICD code (id `ICD|I10|10`, label = the code) → thesaurus terms (existing ids and labels). Built once in `firstUpdated`. `markIcdTree(tree, terms, hits)` deep-copies and sets `matched`: term matched iff its id is in the MiniSearch hit set for the query; code matched iff a query term (normalized) is a prefix of its code; chapter never; prunes subtrees without a match. Both providers return `markIcdTree(...)` — `suggestionProvider(terms)` using the existing MiniSearch calls for the hit set (keeping today's fallback of dropping leading terms), `optionsProvider(language, codifications, terms)` when `codifications` includes `ICD` (unmarked full tree when `terms` is empty). `linksProvider` keeps working for terms (they have `links`) and returns a bare `c-ICD://<code>` for chapters and codes.

**Wiring.** After the sample's `Form.parse` (in `decorated-form.ts` where the form is received, or in `demo-app.ts` for that sample), walk fields recursively and, for each with `options?.suggestions === 'ICD'`, set `options.suggestionProvider = this.suggestionProvider.bind(this)` and `options.linksProvider = this.linksProvider.bind(this)`.

**Sample 12.** Title "12 — Hierarchical suggestions"; one section with a `text-field` (`schema: styled-text-with-codes`, `options: { suggestions: ICD }`, multiline, rowSpan 4) and a `dropdown` (`codifications: [ICD]`), plus a label field explaining: type a French symptom word (e.g. "épilep") in the text field, Tab into the palette, →/←/↑/↓, Enter; open the dropdown and search a code prefix (e.g. "G40"). Register in `demo-app.ts` after sample 11.

**Acceptance.** Manual: in the demo, both surfaces show the three-level tree, pruning and "N more"; keyboard-only selection of a term in the palette inserts a linked term; dropdown click on a term stores its code; flat samples (01, 10) unchanged. `yarn build` and `yarn start` clean.

### Task 6 (Phase 4): README and WHATSNEW

**Files.** `README.md`, `WHATSNEW.md`.

**README.** In the `<icure-form>` props list, extend the `optionsProvider` entry and add a note under `ownersProvider` that owners are read flat. New section "Hierarchical suggestions" after the providers list: the `Suggestion` shape with `children` and `matched` (absent = matched; a node's presence must be justified by a match in its subtree), the visibility rules in the PRD's words (auto-expand, pruning, "N more", collapsed when only the title matched, empty search shows roots collapsed), the palette keys (Tab, ↑/↓, →/←, Enter) and that rows are clickable, the popover behaviour, sorting per sibling group, and a JSON example of a two-level provider result for the query "allergic". State that inline `codifications` remain flat and that the stored value is the selected node's code alone.

**WHATSNEW.** New `## 2.4.0 (date)` entry (3.4.0 on `cardinal`) "Hierarchical suggestions" summarising the above with the provider example and the palette keys; one line noting the `replacementTerms` fallback for suggestions returned without `terms`.

**Acceptance.** Links resolve; examples match the shipped type; regression gate (no code touched).
