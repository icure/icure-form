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
npx ts-node tools/convert-legacy/port-formulas.ts            # writes into app/samples/curated
npx ts-node tools/convert-legacy/port-formulas.ts --dry-run   # counts only
```

It is idempotent — rerunning it reproduces exactly the same bodies — and it
regenerates `FORMULA-PORTS.md`, which lists every ported field and, just as
importantly, every formula it left behind and why. A second, much shorter table,
`FORMULA_REPAIRS`, covers fields whose legacy formula is broken beyond porting —
it reads a field its own form never had — but where the intent is unambiguous and
the curated form carries the operands under other names. Repairs are applied last,
never over a ported field, and reported apart from the ports. Roughly two thirds of the
legacy formulas have nowhere to go: their form has no curated descendant, or they
read patient demographics, services from other contacts, or a care path, none of
which the `computedProperties` sandbox can reach.

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
cross-checked against it in the test. Its `percentile` is not reproduced: every
formula that uses it also needs the gestational age, which the legacy code reads
from services on the patient's other contacts.
