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
- `Finding`, `Citation`, `Measurement` and `Severity` contracts, with severity mapped to the ANSI Z535.4 signal-word scale
- `ExtractionResult<T>` contract, defined ahead of any extraction producer so that the photo-audit path, a
  future SDS path, and an eval harness are all additive rather than refactors
- GS1 check digits — `calculateCheckDigit`, `appendCheckDigit`, `isValidCheckDigit`, `normaliseToGtin14`,
  covering GTIN-8/12/13/14 and SSCC-18
- GS1 Application Identifier table with charset, length and predefined-length rules, plus `validateAiValue`
- Element strings — `encodeElementString` (FNC1 separation, brackets never encoded), `formatHumanReadable`,
  `parseHumanReadable`
- GS1 Digital Link URI builder — numeric-AI paths, automatic GTIN-14 widening, normative qualifier ordering,
  attributes in the query string
- Geometry — unit conversion, PDP area for rectangular/cylindrical/other containers, FDA net-quantity minimum
  type size by panel area, X-dimension ↔ magnification, quiet zones
- Symbology constraints ported from `barcode-crud` — payload lengths, numeric-only flags, check-digit
  behaviour and pharmacode value bounds, with `validatePayload`
- `apps/api` — Express 5 app with a `/health` endpoint shaped for the ALB target group, JSON 404 and error
  handlers, and startup-time environment validation via Zod
- `apps/web` — Vue 3 + Vite 8 + Pinia + Tailwind 4 skeleton with the route inventory stubbed out
- GitHub Actions CI running lint, format check, `vue-tsc` typecheck, tests and build
- 146 tests; full CI sequence green locally
- `README.md` and `docs/DESIGN.md` — the design document now lives in the repo rather than outside it,
  so it is version-controlled alongside the code it describes and discoverable without a path

### Changed

- Retargeted from Node 22 to **Node 24** (Active LTS; 22 is in maintenance)
- Prettier now owns formatting outright — added `eslint-config-prettier` after
  `eslint-plugin-vue`'s stylistic rules started arguing with it over the same lines
- CI actions bumped to `actions/checkout@v5` and `actions/setup-node@v5`. The v4 pair targets
  Node.js 20, which GitHub has deprecated on its runners and was force-running on Node 24.
- CI now runs on pushes to `dev` as well as `main`. `dev` is the integration branch — everything is cut from
  it and merged back to it — but the push trigger still named only `main`, so the branch carrying all the work
  was the one branch CI never watched. Pull requests were always covered; direct pushes were not.

### Fixed

Findings from the phase 1 review, each confirmed against a primary source rather than inferred.

- **AIs 410 and 414 were marked variable-length, corrupting every element string containing a GLN.** The
  predefined-length table is keyed on the AI's first two digits and the `41` prefix is in it, so a GLN takes no
  separator. `encodeElementString` was emitting `4109506000134352<GS>…`; a conformant decoder has already
  consumed exactly 13 digits by then and reads the FNC1 as the start of the next AI. Source: the `*` flag
  ("pre-defined length AI not requiring FNC1 separator") on both AIs in the GS1 Barcode Syntax Dictionary.
- **The quiet-zone fallback understated three of the four GS1 symbologies that relied on it.** EAN-13 requires
  11X on the left, ITF-14 and GS1-128 10X on both sides; all three were getting the general 7X floor. Because
  the fallback was *less* strict than the real requirement, it produced a confident pass on a label that will
  not scan — the exact failure the fallback was reasoned to prevent. All four are now recorded with citations
  (GenSpec 25.0 figure 5.2.3.4-1, §5.3.2.2, §5.4.6.3), and the floor is documented as a floor.
- **Digital Link URIs were built with convenience alphas by default, which are no longer part of the
  standard.** They were deprecated in Digital Link URI Syntax 1.2.0 and removed in 1.3.0 — `gtin` cannot be
  used in place of `01`. Numeric AIs are now the default; the alphas remain behind an opt-in flag, marked
  deprecated, for reading URIs generated before the removal.
- **A Digital Link would accept a GTIN of any length.** Left-padding with zeros cannot change a check digit,
  since the 3/1 weighting is anchored to the right and a leading zero contributes nothing at either weight — so
  a five-digit key widened into a well-formed GTIN-14 and the check-digit guard had nothing to catch.
  `{ai: '01', value: '12348'}` resolved to `/01/00000000012348`. Length is now checked against the key as
  printed, before widening, and non-GTIN primary keys are validated against their AI spec.
- **`parseHumanReadable` accepted anything before the first AI.** The pattern is unanchored and only trailing
  data was checked, so `junk(01)09506000134352` consumed to the end of the input and returned a clean
  single-element list. Each match must now begin where the previous one ended.
- **Alphanumeric AI values were never checked against a character set.** Only the numeric branch validated
  characters, so a lot number could carry a space, `#`, `$`, `@`, or — the dangerous case — a literal
  separator, which encoded without complaint and truncated the field at the decoder. GS1 character set 82 is
  now enforced, transcribed from GenSpec 25.0 figure 7.11-1.
- **Digital Link qualifiers and attributes bypassed validation entirely.** An empty lot produced a dangling
  `/10/` segment, `17=not-a-date` reached the query string, and a repeated AI produced `/10/A/10/B` — which
  names two lots at once and resolves by sort stability. All three are rejected; the same values were already
  rejected on the element-string path.
- **`PORT` and `NODE_ENV` still crashed on a declared-but-blank value.** The blank-as-absent preprocessing was
  applied to the two secrets but not to these, so `PORT=""` coerced to 0 and failed `.positive()` — the same
  ECS crash-loop, in the same file that documents it. `PORT` also gained an upper bound: `PORT=80800` used to
  pass validation and fail later inside `listen`, where the error no longer names the config that caused it.
- **`dotenv` was a declared dependency that nothing imported**, so a local `.env` was silently ignored and
  every optional secret read as absent. Now loaded in `server.ts` before anything reads `process.env`.
- `exports` omitted `./symbology`, making `@packwright/label-core/symbology` a hard resolution error while
  every sibling subpath resolved.
- The net-quantity placement helper cited nothing, and sat under a file header citing 21 CFR 101.1 next to a
  function citing 101.7(i). The rule is 21 CFR 101.7(**f**). Its exemption for panels of 5 square inches or
  less is now modelled as `isNetQuantityZoneRequired` — without it a rule reports a violation against a small
  package that is fully compliant.
- `pdpAreaSqMm` applied the 40 percent rule to every otherwise-shaped container, dropping 21 CFR 101.1(c)'s
  exception: where the container presents an obvious principal display panel — the regulation's example is the
  top of a circular package of cheese — the area is the entire top surface. Understating the panel understates
  every type-size minimum keyed off it.
- Severity was cited to ANSI Z535.1 in both `types/index.ts` and `CLAUDE.md`. Z535.1 is the safety *colour*
  standard; the signal words that make up the scale are defined in **Z535.4**. Both now name the right one.
- `CLAUDE.md` still required Node ≥ 22 after the project retargeted to 24.
- Phase 1's "no UI exists yet" gate in `docs/DESIGN.md` was unsatisfiable as written — a workspace scaffold
  needs a bootable app to prove it boots. Reworded to what was actually meant: no *product* UI, with the one
  scaffold screen scoped to proving the wiring.
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
- The phase 1 review resolved most of the outstanding `TODO(verify)` markers against General Specifications
  25.0. Confirmed correct as written and now cited in place: the EAN/UPC nominal X-dimension (§5.2.3.1,
  0.330 mm), the 0.8–2.0 magnification bounds (figure 5.12.3.1-1, X from 0.264 to 0.660 mm), the UPC-A and
  UPC-E quiet zones, the GTIN qualifier sequence `22,10,21`, the Pharmacode range 3–131070, and all three
  check-digit vectors — each recomputed by hand from §7.9.1 rather than by running the implementation.
- Quiet zones for CODE128, CODE39, MSI and PHARMACODE remain unencoded. They are not GS1-governed, their
  requirements come from their own ISO/IEC symbology specifications, and none has been confirmed against a
  source document — so they fall back to the general floor and report `hasVerifiedQuietZone === false`. Any
  rule that reports a pass/fail must gate on that flag rather than consuming the floor blind.
- Every finding from the phase 1 review is now closed. One piece of residual risk is worth naming: GLN check
  digits are still not verified. AIs 410 and 414 are flagged `csum` in the GS1 syntax dictionary, but
  `validateAiValue` checks length and charset only, so a GLN with a bad final digit is accepted. `label-core`
  already has `isValidCheckDigit`; wiring it in is a small change deferred only because it widens
  `validateAiValue`'s contract beyond format into content.
