# What's New

This file summarises the user-facing features introduced in each version of `@icure/form`, with short usage notes. The most recent version is at the top. For the full reference, see [README.md](./README.md).

---

## 3.4.0 (unreleased)

### Hide empty fields in read-only forms

Read-only forms can now hide fields, groups, subform instances and (in the `form` renderer) sections that hold no answer, so a review or summary view isn't dominated by blank boxes. Set `hideEmptyFields` on `<icure-form>` alongside `readonly`; it has no effect otherwise, and the `card` renderer ignores it.

```html
<icure-form .form="${this.form}" .readonly="${true}" .hideEmptyFields="${true}" .formValuesContainer="${this.formValuesContainer}"></icure-form>
```

A group with no surviving fields disappears together with its title; a subform with no surviving instances disappears together with its heading. In `form:tab`, every tab always stays — an inactive section is never evaluated, so an all-empty active tab simply shows an empty page. See [Read-only review: hiding empty fields](./README.md#read-only-review-hiding-empty-fields).

### `alwaysVisible` on fields, groups, subforms and sections

Form authors can exempt a specific field, group, subform or section from `hideEmptyFields` by marking it `alwaysVisible`. An exempt empty field renders as a blank read-only box; an exempt container with no surviving content renders its title only. It never overrides `roles` or computed `hidden`.

```yaml
- field: allergies
  type: token-field
  alwaysVisible: true
```

On `Field`, `Group` and `Subform`, `alwaysVisible` can also be computed, just like `hidden`:

```yaml
computedProperties:
  alwaysVisible: "return self['flagged-for-review']?.some((item) => item?.codes.some(code => code.id === 'yes'))"
```

---

## 3.3.0 (2026-07-23)

### Invalid date, time and date-time values are flagged and blocked

Typing an unparseable value into a `date`, `time`, or `date-time` field no longer throws `RangeError: Invalid time value`. Instead the field keeps the text you typed, shows an inline warning, and — in the card renderer — disables **Continue** (and the Enter key) until the value is corrected or cleared. Empty fields still pass; only non-empty, unparseable input blocks.

### Dropdowns no longer add scrollbars in the card renderer

The dropdown options menu is now promoted to the browser top layer, so opening a long or wide dropdown inside a card no longer grows a horizontal or vertical scrollbar on the card. This matches the behaviour the date picker already had.

### `<icure-form>` is sizable and renderers fill its height

The host `<icure-form>` element now lays out as a block and its renderers stretch to the height you give it (e.g. via `min-height`), so the card renderer fills the available space instead of collapsing to its content.

---

## 2.2.6 (2026-07-16)

### `readOnlyEvent`: clicks on readonly fields notify the host

Text and token fields can now opt into click notifications while readonly: set the new `readOnlyEvent` property and clicking the readonly field fires the host `actionListener` with that name, letting the host open a viewer for values that cannot be edited in place. The mousedown of an opted-in field is swallowed, mirroring delegated edition, so it never gains focus or a selection. Readonly fields without `readOnlyEvent` keep the previous inert behavior (text remains selectable).

The payload follows the delegated-edition convention: a click on an existing token passes `{ valueId, content }`, a click anywhere else passes `undefined`.

A `delegatedEdition` token field that is also readonly fires `readOnlyEvent` instead of `event` (or nothing when `readOnlyEvent` is unset) — the host can distinguish "edit this value" from "just show it":

```yaml
- field: allergies
  type: token-field
  delegatedEdition: true
  event: edit-allergies         # fired while the field is editable
  readOnlyEvent: view-allergies # fired while the field is readonly
```

See [Read-only fields and `readOnlyEvent`](./README.md#read-only-fields-and-readonlyevent) in the README.

---

## 2.2.2 (2026-06-15)

### `computedProperties` and `readonly` on action buttons

Action buttons (`type: action`) now honour `computedProperties` and `readonly`, just like regular fields. Previously these were dropped when the form was parsed.

- `computedProperties.hidden` can show/hide a button reactively from a formula.
- `readonly: true` (or `computedProperties.readonly`) renders the button **disabled**: it is greyed out and clicking it no longer fires the host `actionListener`.

```yaml
- field: Pay
  type: action
  event: pay
  computedProperties:
    hidden: |
      const a = parseContent(amount[0]?.content)
      return a == null || a <= 0   # hidden until Amount is positive

- field: Check
  type: action
  event: check
  computedProperties:
    readonly: |
      const a = parseContent(amount[0]?.content)
      return a == null || a < 100  # disabled until Amount reaches 100

- field: Disabled
  type: action
  event: noop
  readonly: true                   # rendered disabled (non-clickable)
```

The formula returns `true` when the property should apply (truthy ⇒ hidden / readonly).

See the live `01-components-gallery` (disabled button) and `02-formulas` (hidable + conditionally-disabled buttons) samples in the demo app (`yarn start`).

### Fixed: `computedProperties.readonly` now actually applies

`computedProperties.readonly` was silently ignored on **every** field — the renderer negated the `compute()` result wrapper (always truthy) instead of its `.value`, so the formula never took effect. It now unwraps `.value`, so a formula returning `true` correctly makes the field (or button) readonly.

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

The delete cross is hidden when the field is `readonly`, so tokens cannot be removed in read-only forms. (It still shows under `delegatedEdition`, which keeps the inner editor read-only by design.)

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
