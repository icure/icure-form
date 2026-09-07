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
