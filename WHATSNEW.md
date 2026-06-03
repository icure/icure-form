# What's New

This file summarises the user-facing features introduced in each version of `@icure/form`, with short usage notes. The most recent version is at the top. For the full reference, see [README.md](./README.md).

---

## 2.2.0 (2026-06-03)

This release makes form editing *configurable*: token fields can delegate their edition to the host, individual tokens can be deleted, and the originating DOM event is forwarded to handlers. Under the hood, each text schema now owns a self-contained `SchemaSpec`.

### Delegated edition for token fields

A token field can now hand its edition over to the host instead of editing inline. Set `delegatedEdition: true` and give the field an `event`; clicks then fire the host `actionListener` rather than opening the inline editor.

The payload identifies what was clicked:

- an **existing token** → `{ valueId, content }` (`valueId` is the value's id — the service id in the iCure bridge), so you can edit that exact value in place;
- an **empty area** → `undefined`, i.e. "add a new token".

```yaml
- field: allergies
  type: token-field
  multiline: true
  delegatedEdition: true
  event: edit-allergies
```

```typescript
const actionListener = (event: string, payload: unknown) => {
  if (event !== 'edit-allergies') return
  const clicked = payload as { valueId?: string; content?: string } | undefined
  if (clicked?.valueId) {
    // edit the clicked token in place — pass its existing value id
    fvc.setValue('allergies', language, { content: { [language]: { type: 'string', value: edit(clicked.content) } }, codes: [] }, clicked.valueId)
  } else {
    // empty-area click — append a new token (id omitted ⇒ new value)
    fvc.setValue('allergies', language, { content: { [language]: { type: 'string', value: next() } }, codes: [] })
  }
}
```

> Always write the token content under the language the form is rendered in — writing it under another language stores text the editor never displays and the token renders empty.

See the live `11-delegated-edition` sample in the demo app (`yarn start`).

### Deletable tokens (`tokenDeleteButton`)

Tokens in a `tokens-list` field can now show an individual delete cross. Set `tokenDeleteButton: true`; clicking a token's cross removes just that token.

```yaml
- field: allergies
  type: token-field
  multiline: true
  tokenDeleteButton: true
```

This combines with `delegatedEdition`: the delete cross removes its token directly, while clicking the token body still delegates the edition to the host.

### Originating DOM event forwarded to `actionListener`

The `actionListener` signature gained an optional third argument:

```typescript
(event: string, payload: unknown, domEvent?: Event) => void
```

`domEvent` is the DOM event that triggered the action (usually the click's `MouseEvent`), letting handlers read modifier keys / cursor position or call `preventDefault()`. Existing two-argument handlers keep working unchanged.

### `text-field` schema override

A `text-field` can now declare any text schema directly via its `schema` property (e.g. `schema: items-list`), instead of relying solely on the `multiline` → `text-document` / single-line → `styled-text-with-codes` fallback. This lets a plain `text-field` reach multivalue schemas without switching its `type`.

```yaml
- field: notes
  type: text-field
  schema: items-list
```

### Programmatic edit-request hook (`onEditRequest`)

For fully custom editors, each schema's `SchemaSpec` exposes an optional `onEditRequest(ctx) => Promise<boolean>` hook. It fires on a token click or when a field gains edit focus, receiving an `EditRequestContext` (trigger, token id/content, label, language, schema, the `actionListener`, and the originating `domEvent`). Resolve `true` to signal the host handled the edition (the inline editor is suppressed), `false` to fall through to default inline editing. `delegatedEdition` is the declarative shortcut for the common token-field case; `onEditRequest` is the lower-level escape hatch. See [README ▸ Custom field editors](./README.md#custom-field-editors-the-edit-request-hook).

### Tooling: reorganised demo app & e2e suite

The demo application (`app/`) was reorganised into numbered, feature-focused samples (`app/samples/NN-*.yaml`) and gained a Playwright end-to-end suite (`app/e2e/`), runnable with `yarn test:e2e:app`. Several form rendering bugs surfaced by the suite were fixed along the way.
