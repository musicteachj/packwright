# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This is a development log first and a release log second — entries accumulate under Unreleased and are cut
into a version only when there is a reason to.

## [Unreleased]

### Added

- npm workspace scaffold: `@packwright/label-core`, `@packwright/web`, `@packwright/api`
- Toolchain — TypeScript 6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4 with
  v8 coverage, ESLint 9 flat config, Prettier with the Tailwind class-sorting plugin, EditorConfig
- ESLint rule enforcing that `label-core` imports no framework — verified to fire, not just configured
- `Finding`, `Citation`, `Measurement` and `Severity` contracts, with severity mapped to the ANSI Z535.1 scale
- `ExtractionResult<T>` contract, defined ahead of any extraction producer so that the photo-audit path, a
  future SDS path, and an eval harness are all additive rather than refactors
- GS1 check digits — `calculateCheckDigit`, `appendCheckDigit`, `isValidCheckDigit`, `normaliseToGtin14`,
  covering GTIN-8/12/13/14 and SSCC-18
- GS1 Application Identifier table with charset, length and predefined-length rules, plus `validateAiValue`
- Element strings — `encodeElementString` (FNC1 separation, brackets never encoded), `formatHumanReadable`,
  `parseHumanReadable`
- GS1 Digital Link URI builder — canonical and convenience-alpha forms, automatic GTIN-14 widening, normative
  qualifier ordering, attributes in the query string
- Geometry — unit conversion, PDP area for rectangular/cylindrical/other containers, FDA net-quantity minimum
  type size by panel area, X-dimension ↔ magnification, quiet zones
- Symbology constraints ported from `barcode-crud` — payload lengths, numeric-only flags, check-digit
  behaviour and pharmacode value bounds, with `validatePayload`
- `apps/api` — Express 5 app with a `/health` endpoint shaped for the ALB target group, JSON 404 and error
  handlers, and startup-time environment validation via Zod
- `apps/web` — Vue 3 + Vite 8 + Pinia + Tailwind 4 skeleton with the route inventory stubbed out
- GitHub Actions CI running lint, format check, `vue-tsc` typecheck, tests and build
- 97 tests; full CI sequence green locally

### Changed

- Retargeted from Node 22 to **Node 24** (Active LTS; 22 is in maintenance)
- Prettier now owns formatting outright — added `eslint-config-prettier` after
  `eslint-plugin-vue`'s stylistic rules started arguing with it over the same lines
- CI actions bumped to `actions/checkout@v5` and `actions/setup-node@v5`. The v4 pair targets
  Node.js 20, which GitHub has deprecated on its runners and was force-running on Node 24.

### Fixed

- Digital Link qualifier validation ran inside the `sort` comparator, which JavaScript never invokes for a
  zero- or one-element array — a single invalid qualifier passed through silently and was only rejected once a
  second one appeared. Validation now runs in its own pass.
- An environment variable that is **declared but blank** crashed startup. `.optional()` means absent, and `''`
  is present, so `ANTHROPIC_API_KEY=""` failed the non-empty check and took the process down. An ECS task
  definition with an empty value produces exactly this, so the container would have crash-looped on a config
  that looks correct in the console. Blank now reads as absent.
- Removed `baseUrl` from the web tsconfig — deprecated in TypeScript 6 and an error under `vue-tsc`.

### Notes

- Requires npm ≥ 11. npm 10.9.2 fails to resolve this dependency graph, crashing in arborist with
  `Cannot read properties of null (reading 'edgesOut')` while walking Vitest 4's peer set.
- Three constants carry `TODO(verify)` markers pending confirmation against the GS1 General Specifications
  itself rather than secondary documentation: the EAN/UPC nominal X-dimension, the Digital Link qualifier
  sequence, and the provenance of two check-digit vectors. Quiet zones for EAN-13, EAN-8, ITF-14 and GS1-128
  are deliberately **not** encoded yet — they fall back to the documented general 7X minimum rather than
  shipping an unverified figure that would produce a confident pass on a label that will not scan.
