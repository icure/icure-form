# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@icure/form` is a Web Components library (Lit + ProseMirror) for rendering EHR (Electronic Health Record) forms. It has a three-layer architecture:

1. **Generic layer** (`src/generic/`, `src/components/model/`) — Framework-agnostic data model and `FormValuesContainer<V,M>` interface. Mutations are immutable (return new instances + notify listeners).
2. **Component layer** (`src/components/`) — LitElement web components: `<icure-form>` top-level element, field components (text, measure, date, dropdown, etc.), ProseMirror-based rich text editing, and theming.
3. **iCure bridge** (`src/icure/`) — `BridgedFormValuesContainer` and `ContactFormValuesContainer` that map iCure Cardinal SDK's `DecryptedContact`/`DecryptedService` to the generic interface. Only this layer depends on `@icure/cardinal-sdk` (peer dependency).

## Commands

| Task | Command |
|---|---|
| Dev server | `yarn start` |
| Build library | `yarn build` (SCSS injection → tmp/, then tsc → lib/) |
| Run all tests | `yarn test` |
| Run single test | `npx jest test/icure-form/test.spec.ts` |
| Lint | `eslint . --ext .ts` |

## Build Pipeline

The build is a two-step process:
1. `lit-inject-scss.js` preprocesses `.ts` files, inlining SCSS imports as Lit `css` tagged templates, outputting to `tmp/`
2. `tsc -p tsconfig.tmp.json` compiles `tmp/` to `lib/`

The dev server uses Webpack with `lit-scss-loader` + `sass-loader` for the same SCSS-to-Lit transformation.

## Code Style

- **No semicolons** (`semi: ["error", "never"]`)
- Single quotes, trailing commas, `printWidth: 200`
- `strict: false` but `strictNullChecks: true`, `noImplicitAny: true`
- `@typescript-eslint/no-explicit-any: off` — `any` is used freely
- Experimental decorators enabled (Lit `@property`, `@customElement`, etc.)

## Key Architectural Details

- **Form definitions** are YAML/JSON parsed via `Form.parse()` / `Field.parse()` static methods with bidirectional `toJson()` serialization. See `src/components/model/index.ts`.
- **FormValuesContainer** (`src/generic/model.ts`) is the central abstraction. It stores versioned data (`VersionedData<T> = { [id: string]: Version<T>[] }`) with versions ordered **most recent first**. Supports formula computation via a sandboxed evaluator (`src/utils/interpreter.ts`), and propagates changes through registered listeners.
- **Rendering** uses a 24-column CSS grid. The renderer function in `src/components/icure-form/renderer/form/form.ts` dispatches on field type to emit Lit templates. Supports computed properties (`hidden`, `span`, `readonly`) evaluated per-field at render time.
- **ProseMirror schemas** in `src/components/icure-text-field/schema/` define content types: markdown/styled, tokens, items-list, date-time, decimal, measure. Each has custom plugins in `plugin/`.
- **Themes** (`src/components/themes/`) are SCSS-based: `default`, `icure-blue`, `kendo`.

## Directory Layout

- `src/` — Library source (published to npm as `lib/`)
- `app/` — Demo application (not published), uses Cardinal SDK with `.env` credentials
- `test/` — Jest tests (ts-jest, node environment)
- `tmp/` — Intermediate build output (generated, gitignored)
- `lib/` — Final build output (generated, gitignored)