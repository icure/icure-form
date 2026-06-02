# Token identity in delegated-edition actionListener payload

**Date:** 2026-06-02
**Branch:** `feature/configurable-edit-by-actions`

## Problem

In `delegatedEdition` mode, `token-field` wraps its readonly inner editor in a `pointer-events: none` div and fires `actionListener(event, undefined, domEvent)` on any click. The payload is always `undefined`, so the host cannot tell whether the user clicked an existing token (edit intent) or empty space (add intent), nor which token was clicked.

The data already exists: token ProseMirror nodes carry the `VersionedData` key as their `id` attr (`pms.node('token', { id, renderHash }, ...)`), and in the iCure bridge that key is the service id. The pointer-blocking wrapper just fires before anything can resolve which token was hit.

## Decision

Move delegated-edition click handling into `icure-text-field`'s existing ProseMirror `handleDOMEvents`, which already resolves clicked tokens via `posAtCoords` for `tokenDeleteButton` and the `onEditRequest` hook. Drop the pointer-blocking wrapper in `token-field.ts`.

### Payload contract

```ts
// click on an existing token "Peanuts" (service 12345678-…)
actionListener('edit-allergies', { valueId: '12345678-…', content: 'Peanuts' }, domEvent)

// click on an empty area of the field
actionListener('edit-allergies', undefined, domEvent)
```

- `valueId` — the `VersionedData` key for the clicked token (= service id in the iCure bridge)
- `content` — the token's text content
- `undefined` payload — click did not land on a token pill; host treats it as add-new (today's behavior, unchanged)

## Design

### 1. Property flow

- `icure-text-field` gains `@property({ type: Boolean }) delegatedEdition = false` and `@property() event?: string` (it already has `actionListener`).
- `token-field.ts` removes the `delegated-edition` wrapper div and instead forwards `.delegatedEdition`, `.event`, `.actionListener` to the inner `<icure-text-field>`.
- Inner editor stays readonly in delegated mode (`readonly || delegatedEdition`, unchanged); `tokenDeleteButton` stays forced off in delegated mode (unchanged).
- `cursor: pointer` styling moves onto the editor container when delegated.

### 2. Click handling in `icure-text-field` (`handleDOMEvents`, ~line 530)

- **`mousedown`**: when `delegatedEdition && actionListener`, `preventDefault()` and return `true` — the readonly editor never receives focus or selection, preserving the "inert field" feel.
- **`click`**: when `delegatedEdition && actionListener` — checked **before** the `tokenDeleteButton` and `onEditRequest` branches, then return:
  - Target inside a token pill (`el.closest('.token')`): resolve the token node via `posAtCoords` → `doc.resolve(pos.pos)` → `rp.node(1)` (top-level `token` child of `doc`), fire `actionListener(this.event ?? 'edit', { valueId: node.attrs.id, content: node.textContent }, event)`.
  - Otherwise: fire `actionListener(this.event ?? 'edit', undefined, event)`.

**Latent bug fix in passing:** the existing `onEditRequest` token-click path uses `doc.nodeAt(pos.pos)`, which returns the **text node** (no `attrs`) for positions inside the token's text, so `tokenId` resolves to `undefined`. Switch it to the same `resolve(pos).node(1)` resolution.

### 3. Comments & model

Update the `delegatedEdition` doc comments in `src/components/model/index.ts` (~line 152) and `token-field.ts` to document the payload contract above.

### 4. Demo + e2e

- `app/decorated-form.ts` `edit-allergies` handler: when `payload?.valueId` is present, edit in place via `setValue('allergies', 'en', { content: { en: { type: 'string', value: 'Edited <old content>' } }, codes: [] }, payload.valueId)`; otherwise append as today.
- `app/samples/11-delegated-edition.yaml`: update the explainer label to describe edit-vs-add.
- `app/e2e/sample-11.spec.ts`: new test — add a token, click it, assert the text changed in place and the token count did **not** increase; clicking empty space still appends.

## Error handling

No throw paths: if `posAtCoords` returns nothing or the resolved node lacks an `id`, fall back to the `undefined` payload — degrades to add-new instead of swallowing the click.

## Out of scope

- No changes to `items-list` or other multivalue schemas.
- No change to the `onEditRequest` API shape (only the node-resolution fix).
- No new YAML model properties — `delegatedEdition` and `event` already exist on the field model.
