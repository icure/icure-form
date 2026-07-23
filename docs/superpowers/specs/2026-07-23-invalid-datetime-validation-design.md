# Invalid date/time value validation

## Problem

Typing an unparseable value into a `date`, `time`, or `date-time` field used to
throw `RangeError: Invalid time value` (date-fns `format` on an Invalid Date).
That crash is now fixed: the primitive extractors guard with `isValid` and
return `undefined` for unparseable input.

The side effect is that invalid input is silently discarded — the extractor
returns `undefined`, so nothing is stored and the value is cleared. The
`FormValuesContainer` therefore cannot distinguish "invalid" from "empty", and
the user gets no feedback that what they typed was rejected.

We want the form to:

1. **Warn** the user, inline under the field, when a `date`/`time`/`date-time`
   field holds a value that cannot be parsed.
2. **Prevent Continue** in the card renderer while any field on the current card
   holds an invalid value.

## Key constraint

The signal has to originate in the field. The container never receives the
invalid value, but the field's live ProseMirror doc still holds the raw typed
text. So invalidity is a purely field-local predicate:

> A field is *invalid-format* when its schema is `date`/`time`/`date-time`
> **AND** its doc text contains at least one entered digit (not just the empty
> mask `--/--/----` / `--:--:--`) **AND** the primitive extractor returns
> `undefined`.

The digit check is what separates "empty" (all-placeholder mask, passes) from
"invalid" (something was typed but it doesn't parse, blocks).

## Decisions (confirmed with the user)

- **Warning scope:** everywhere `icure-text-field` renders a date/time field
  (all renderers/themes, including the icure-blue free-text date that originally
  crashed), because detection lives in the shared component. The *block-Continue*
  gate is inherently card-only (only the card has a navigation gate).
- **Warning placement:** inline under the field, reusing the existing `.error`
  slot pattern. No card-level banner.
- **Empty vs. invalid:** an empty optional field still passes. Only a non-empty
  field whose text cannot be parsed triggers the warning and blocks.
  Required-ness stays orthogonal (existing author-defined validators).
- **Partial `date-time`:** a field with some digits that does not parse to a
  complete valid datetime (e.g. date filled, time left as `--:--:--`) counts as
  invalid. Deliberate — it is not "empty".

## Components

### 1. Pure classification helpers — `src/components/icure-text-field/primitive-extractors.ts`

Add alongside the existing extractors:

- `isDateTimeSchemaName(schema: string): schema is 'date' | 'time' | 'date-time'`
- a digit-presence check used to tell an entered value from the empty mask.

These stay pure and are unit-tested with the existing extractor tests.

### 2. Field-local invalid state — `src/components/icure-text-field/index.ts`

- New reactive state `invalidValue: boolean` and a public getter
  `hasInvalidValue`.
- In `updateValue` (single-value branch, where the extractor is already called
  on blur / 10s debounce), compute the predicate and update `invalidValue`.
  These are the same commit points that produced the original crash, so timing
  matches user expectation (warn on leave/pause, not per keystroke).
- On a change of `invalidValue`, dispatch
  `new CustomEvent('field-validity-changed', { bubbles: true, composed: true, detail: { label, invalid } })`.
- In `renderSync`, when `invalidValue` is true, render a localized message in the
  `.error` slot (`translationProvider(lang, msg) ?? msg`), messages keyed by
  schema: "Invalid date" / "Invalid time" / "Invalid date and time".

### 3. Block Continue — `src/components/icure-form/renderer/card/internal.ts`

- New reactive state `hasInvalidFormat: boolean`, tracked **separately** from the
  async `compute`-driven `blockingFailures` (different lifecycle: synchronous /
  event-driven vs. async with the `validationVersion` guard).
- A `computeInvalidFormat()` method: when `stage === 'input'`, query the current
  card's `.card__field` hosts (piercing shadow DOM with the existing `queryDeep`)
  for any `icure-text-field` whose `hasInvalidValue` is true. Authoritative and
  scoped to the currently-mounted card, so navigation leaves no stale entries.
  Any other stage sets it false.
- Listen for `field-validity-changed` on the card element (the composed event
  bubbles up through the field wrappers) and recompute on each one. Also
  recompute in the existing watched `updated()` block (stage / card / container
  changes).
- Fold into the block predicate everywhere it is used:
  `blocked = evaluating || blockingFailures.length > 0 || hasInvalidFormat`.
  - `renderInput` `?disabled` on Continue.
  - `advanceForCurrentStage` `input` case (Enter key).
  - Guard the click handlers (`onContinue`, `onContinueToReview`,
    `onContinueReturnToReview`) so a click landing in the same tick as the
    blur-commit cannot slip through before the re-render disables the button.

Block-Continue is input-stage only. Invalid-format state is transient (tied to
the live editor doc; navigating away rebuilds the field from stored values,
which never contain the invalid text), so the review/submit stage does not need
an invalid-format check — unstored invalid values simply show empty there and
are handled by any existing author `required` validators.

## Data flow

```
user types garbage in time/date-time field
  -> (blur / 10s debounce) updateValue -> extractor returns undefined
  -> invalidValue = true
       -> inline .error warning renders in the field
       -> field-validity-changed event bubbles (composed) to the card
            -> card.computeInvalidFormat() queries current card fields
                 -> hasInvalidFormat = true
                      -> Continue disabled + Enter blocked + click guarded
user fixes the value
  -> updateValue -> extractor returns a value -> invalidValue = false
       -> warning clears, event fires, hasInvalidFormat recomputes to false
       -> Continue re-enabled
```

## Interlock with the prior fix

Making a previously-valid field invalid clears its stored value (extractor
returns `undefined`), the garbage text stays visible in the editor, and — in the
card — Continue blocks with the inline warning. The two features compose
coherently.

## Testing

- **Unit** (`test/icure-form/primitive-extractors.spec.ts`): extend for the new
  classification helpers — schema recognition and the entered-digit vs.
  empty-mask distinction across date/time/date-time, valid and invalid.
- **e2e** (Playwright, card renderer): type an unparseable time/date-time,
  assert the inline warning appears and Continue is disabled and Enter does not
  advance; fix the value and assert the warning clears and Continue re-enables.

## Out of scope

- The card `date` field (calendar popup, cannot be typed invalid).
- Card-level warning banner.
- Turning empty optional fields into blocking errors (required-ness stays with
  existing author validators).
- Persisting or recovering the raw invalid text across navigation.
