# convert-legacy

Standalone conversion tool that turns a legacy iCure `FormLayout` (the old
absolute-positioned form design format, `left`/`top`/`width`/`height` pixel
coordinates per field) into the `@icure/form` JSON `Form` model (24-column
grid, `Section`/`Field`/`Subform`).

This code used to live in `src/conversion/` and depended on the `@icure/api`
package for the `FormLayout`/`FormLayoutData` types. It was removed from the
library (`src/conversion/icure-convert.ts`, commit `6763bef`) once the project
moved to `@icure/cardinal-sdk`, which does not expose the legacy types. It has
been restored here, isolated from `src/`, so it stays out of the published
library while remaining available for one-off migrations of old form
definitions.

## Layout

- `legacy/` — local re-implementation of the `@icure/api` DTOs needed to
  describe a legacy `FormLayout` (restored from the same history).
- `ckmeans.ts` / `ckmeans-grouping.ts` — clustering helpers used to infer rows
  and columns from the absolute pixel positions.
- `icure-convert.ts` — `convertLegacy(form, formsLibrary)`, the actual
  conversion entry point.
- `samples/` — real `FormLayout` JSON fixtures used by the test.
- `icure-convert.spec.ts` — regression test exercising the conversion against
  the `obstetrics` sample form (and its subforms).

## Usage

```ts
import { convertLegacy } from './icure-convert'
import { FormLayout } from './legacy/FormLayout'

const converted = convertLegacy(legacyFormLayoutJson as FormLayout, subformsLibrary as FormLayout[])
```

`convertLegacy` recursively resolves subforms referenced by `guid` against
`formsLibrary`, so pass every `FormLayout` that might be referenced as a
subform alongside the top-level form.

Run the regression test with:

```sh
npx jest tools/convert-legacy
```

## Porting the legacy formulas

`convertLegacy` only converts the layout: it never looked at the `formulas`
attached to legacy fields, so the curated specialty forms in
`app/samples/curated` were published without a single computed field.

`port-formulas.ts` fills that gap. It reads the legacy sources, translates the
formulas it can through the hand-written table in `formula-ports.ts`, and writes
them onto the matching curated forms as `computedProperties.value`:

```sh
# The repo compiles to ESM, which ts-node then hands to node as ESM; these scripts
# are CommonJS, so the module override is needed. The legacy sources are not
# committed, so --legacy points at wherever they are checked out.
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
npx ts-node tools/convert-legacy/port-formulas.ts --legacy path/to/legacy             # writes into app/samples/curated
npx ts-node tools/convert-legacy/port-formulas.ts --legacy path/to/legacy --dry-run   # counts only, no report
```

It is idempotent — rerunning it reproduces exactly the same bodies — and it
regenerates `FORMULA-PORTS.md`, which lists every ported field and, just as
importantly, every formula it left behind and why. A second, much shorter table,
`FORMULA_REPAIRS`, covers fields whose legacy formula is broken beyond porting —
it reads a field its own form never had — but where the intent is unambiguous and
the curated form carries the operands under other names. Repairs are applied last,
never over a ported field, and reported apart from the ports. A third table,
`DECLINED_PORTS`, is for formulas whose legacy behaviour cannot be reconstructed
at all, so that the report says why rather than listing them as merely
untranslated. Roughly two thirds of the legacy formulas still have nowhere to go:
their form has no curated descendant, or they read data through a legacy XPath
expression or a care path, neither of which anything here can reach.

### The ported formulas that need a host

Twenty-one of the translations — the obstetric percentile family, the gestational
ages, the projected birth weights and the antenatal screening checkboxes — reach
outside their own form, for the patient's earlier services and for the date of
the consultation. They read them through two names the form itself does not
provide, `services(filter)` and `consultDate`, which reach the sandbox through
`<icure-form>`'s `interpreterContext`.

**Only the demo app provides them.** `app/formula-host.ts` answers them out of
the in-memory contacts in `app/decorated-form.ts`; there is no implementation in
the library and no typed contract exported from it. In a host that does not
supply them the sandbox resolves `services` to `[]` — an unknown name resolves to
an empty array, which is truthy — and calling it throws. The field then renders
blank, indistinguishable from one whose inputs are empty. That is the failure
mode to expect wherever these forms are used before a real host implements the
two names.

That it blanks rather than hangs is not free, and is worth knowing before writing
another async formula by hand. The interpreter catches a throw from a synchronous
body and returns `undefined`, but these bodies return a promise, and a throw
inside an async executor rejects only the executor's own invisible promise: the
promise the body returned never settles, and whatever awaited the computed value
waits for ever. Every generated body therefore wraps its executor in a
`try`/`catch` that resolves `undefined`, which is what turns a hung computation
into an empty field.

Why a table of hand-written translations instead of a transpiler: the legacy
corpus mixes three unrelated dialects, and only 29 distinct formulas survive into
the curated forms. See the header of `formula-ports.ts` for the sandbox contract
the translations rely on, and `test/ported-formulas.spec.ts`, which runs every
ported body against a synthetic sandbox — the interpreter swallows errors, so a
broken formula is otherwise indistinguishable from one whose inputs are empty.

Two of the translations reproduce host helpers the legacy formulas called into,
`interpolate` and `obsWeights`, both transcribed from
`org.taktik.icure.utils.Math` in kraken-cloud
(`kraken-common/domain/src/main/java/org/taktik/icure/utils/Math.kt`) and
cross-checked against it in the test, as is a third, `percentile`, which reads a
measurement off a chart of one interpolable curve per centile.

The transcription of `percentile` diverges from the Kotlin in one place, and
deliberately. Both split a chart's rows on `;` and drop trailing empty segments,
but one chart in the corpus — the 97th centile row of the head circumference
chart — carries a stray separator at the *front* (`97>;16,136.11;…`). The Kotlin
throws on it, and only once a measurement exceeds the 90th centile, so the legacy
field silently blanked for exactly the large heads it mattered for. The ported
`interpolate` skips empty segments wherever they fall and reads the row as the
curve it plainly is.
