# Label Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photographed GHS chemical label produces an `ExtractionResult<GhsLabelData>` with per-field
confidence; nothing enters label data without explicit confirmation; a refusal returns a clean error; and every
finding in the audit report still comes from `rules/`.

**Architecture:** Claude vision runs in `apps/api` behind an injected port, so no test touches the network.
The response is re-validated with our own Zod schema — which is what makes the structured-output guarantee
real — mapped to the `ExtractionResult` contract phase 1 defined, and handed to a confirm screen that is the
only way a value becomes label data. The engine then judges the confirmed document, unchanged.

**Tech Stack:** Express 5, Zod 4, `@anthropic-ai/sdk` 0.116, Vue 3, Vitest, supertest, Playwright.

**Source spec:** `docs/specs/2026-09-15-label-audit-design.md`

---

## Three PRs, one per stage

| Stage | Scope | Review |
|---|---|---|
| 1 | The extraction port and the endpoint. `apps/api` only, no UI. | `/code-review medium`, no target, before each commit |
| 2 | `/audit` — capture and confirm. `apps/web`, plus one pure file in `label-core`. | same |
| 3 | The report, the hand-off, the browser test. | same |

No stage touches `rules/`, `fda/` or `layout/`, so no `max` pass and no `high` on a PR. If that changes —
if a stage ends up editing a rule — the ladder changes with it.

Stop at each stage boundary and wait.

## File structure

| file | responsibility |
|---|---|
| `apps/api/src/audit/extractionSchema.ts` | the GHS projection, confidence-wrapped; the prompt's contract |
| `apps/api/src/audit/extract.ts` | build the request, guard the refusal, validate, classify, map |
| `apps/api/src/audit/routes.ts` | `POST /api/audit/ghs` |
| `apps/api/src/audit/fixtures/` | one recorded response, three hand-written protocol responses |
| `apps/api/src/audit/recordFixture.cli.ts` | one real call, by hand |
| `packages/label-core/src/extraction/confirm.ts` | pure merge — stage 2 |
| `apps/web/src/audit/useLabelPhoto.ts` | capture and normalise — stage 2 |
| `apps/web/src/api/audit.ts` | the client — stage 2 |
| `apps/web/src/views/AuditView.vue` | capture, confirm, report — stages 2 and 3 |

### Five facts that constrain the design

1. **`zodOutputFormat` demotes enums and patterns to prose.** The SDK's `transformJSONSchema` keeps `type`,
   `description`, `title`, `format`, `items`, `required` and a forced `additionalProperties: false`, and
   appends the rest to the description. Our own `safeParse` on receipt is the only real constraint.
2. **`US_OSHA_HAZARD_STATEMENTS` is `{}`.** Verified: `ghs/statements.ts:290`. Statement codes are extracted
   as free strings and classified by us, never constrained to a set.
3. **An oversized body currently answers `500 Internal server error`.** Verified by running an 11 MB POST
   against `createApp`: body-parser throws with `status: 413, type: 'entity.too.large'` and `app.ts:204-209`
   flattens it. A phone photograph is the first request that will hit this in normal use.
4. **Which block `content[0]` is varies between identical calls.** Two live calls with the same parameters:
   `[thinking, text]` against a blank image (109 thinking tokens), `[text]` against the sample label (zero).
   Adaptive thinking decides per request, so a positional read is intermittently wrong rather than reliably
   wrong. The text block is found by type. Both calls confirmed `stop_details` is `null` on `end_turn`, that
   the all-optional root schema is accepted (`required` absent), and that an image with no label comes back
   as `{}` rather than as invention.
5. **`createApp` takes no environment.** `server.ts` is the only caller of `loadEnv`, which is why every route
   test boots without one. The extractor is injected the way `webRoot` and `databaseStatus` are.

---

## Task 1: The extraction schema

**File:** `apps/api/src/audit/extractionSchema.ts`

- [ ] `GhsExtraction`: a Zod object with one optional confidence-wrapped entry per extractable field —
      `productIdentifier`, `signalWords`, `pictograms`, `hazardStatementCodes`,
      `precautionaryStatementCodes`, `supplier`, `outerPackageStatement`.
- [ ] A local `observed(schema)` helper producing `z.object({ value: schema, confidence: z.number().min(0).max(1) })`.
- [ ] `signalWords` and `pictograms` reuse `GHS_SIGNAL_WORDS` and `GHS_PICTOGRAM_CODES` from `label-core`, as
      `GhsRequest` already does — one source for the closed sets, not two.
- [ ] Statement codes are `z.array(z.string().min(1))`. **Not an enum.** The module note records why.
- [ ] A module note listing every excluded field with its reason, and stating that the model authors no prose.

**Tests** — `extractionSchema.test.ts`:

- [ ] `zodOutputFormat(GhsExtraction)` produces a schema without throwing, and every top-level property is
      absent from `required` (all optional).
- [ ] A payload with `confidence: 1.4` fails; `confidence: 0` and `1` pass.
- [ ] A payload carrying an unknown key is stripped, not rejected — matching the read-path behaviour
      `labelDocumentRoutes.ts:88-95` depends on.

## Task 2: The producer

**File:** `apps/api/src/audit/extract.ts`

- [ ] `export type SendMessage = (params) => Promise<Anthropic.Message>` — the port.
- [ ] `ExtractionDeclined` and `ExtractionUnreadable` error classes, each carrying `detail`, so `routes.ts`
      maps outcomes rather than inspecting strings.
- [ ] `extractGhsLabel(send, image, regime): Promise<ExtractionResult<GhsLabelData>>`, in this order:
  - [ ] build the request — `model: 'claude-opus-5'`, `max_tokens: 16000`, `thinking: { type: 'adaptive' }`,
        the **image block before the text block**, `output_config.format: zodOutputFormat(GhsExtraction)`
  - [ ] **`if (response.stop_reason === 'refusal') throw new ExtractionDeclined(...)` — before
        `response.content` is read at all**, carrying `stop_details.category` when present and guarding that
        it is `null` on every other stop reason
  - [ ] find the text block **by type, not by position** — `content[0]` is the thinking block on the success
        path, so a positional read is wrong before any refusal is involved; its absence is
        `ExtractionUnreadable`
  - [ ] `JSON.parse` inside a `try` → `ExtractionUnreadable`
  - [ ] `GhsExtraction.safeParse` → `ExtractionUnreadable` with the offending paths
  - [ ] classify each statement code through `hazardStatementText` / `precautionaryStatementText`
  - [ ] map to `ExtractionResult<GhsLabelData>`
- [ ] The prompt: a system prompt stating that it reads and does not judge, that a field it cannot see must be
      omitted rather than guessed, that statement codes are transcribed as printed and never corrected, and
      that no compliance opinion is wanted. It names no regulation and asks for no verdict.

**Tests** — `extract.test.ts`, against a fake `send`:

- [ ] `stop_reason: 'refusal'` with `content: []` → `ExtractionDeclined`, **and the test asserts no
      `TypeError` was thrown** — the failure mode is indexing `content[0]`, so a test that only checks the
      class would pass against code that threw the wrong error first
- [ ] `stop_reason: 'refusal'` with `stop_details: null` → still `ExtractionDeclined`, no crash
- [ ] a response whose `content` is `[thinking, text]` → the text block is read, not the thinking block
- [ ] a text block that is not JSON → `ExtractionUnreadable`
- [ ] a JSON body violating the schema → `ExtractionUnreadable`, naming the path
- [ ] the recorded response → an `ExtractionResult` whose confidences are the fixture's own
- [ ] `hazardStatementCodes: ['H225', 'H999']` under `eu-clp` → both codes present in `fields`, one
      `ExtractionWarning` naming `H999`. **The rest of the extraction is intact** — asserted explicitly.
- [ ] `hazardStatementCodes: ['constructor']` → a warning, not a 500. `own()` already guards it; this pins
      that the audit path goes through `own()` rather than around it.
- [ ] every code under `us-osha` warns, because that table is empty — and the warning says so rather than
      implying the label is wrong

## Task 3: The route

**File:** `apps/api/src/audit/routes.ts`

- [ ] `createAuditRouter(options: { extract?: ExtractLabel })`.
- [ ] `POST /ghs` — `AuditRequest` Zod schema: `regime` from `GHS_REGIMES`, `image.mediaType` from the four
      formats Claude accepts, `image.data` a non-empty base64 string.
- [ ] `extract` absent → `503 { error: 'Vision extraction is not configured' }`, before the body is parsed.
- [ ] `ExtractionDeclined` / `ExtractionUnreadable` → 422; an `Anthropic.APIError` → 502; anything else
      rethrown, so `app.ts` owns it.

**Tests** — `routes.test.ts`, supertest, no database:

- [ ] each status in the table, including 503 with no extractor
- [ ] a `mediaType` of `image/heic` → 400 naming the field
- [ ] the 200 body is `{ extraction, model }` and `extraction.fields` is keyed by `GhsLabelData` keys

## Task 4: Wiring, and the 413

**Files:** `apps/api/src/app.ts`, `apps/api/src/server.ts`

- [ ] `AppOptions` gains `extract?: ExtractLabel | undefined`, documented like its two neighbours.
- [ ] `app.use('/api/audit', createAuditRouter({ extract }))`.
- [ ] The error handler honours a numeric `err.status` / `err.statusCode` between 400 and 499 and answers with
      a plain message; everything else stays a 500 with the detail going to the log. The docblock records that
      an 11 MB body answered 500 before this, and that it was found by posting one.
- [ ] `server.ts` constructs `new Anthropic({ apiKey })` only when the key is present.

**Tests** — extend `app.test.ts`:

- [ ] an oversized body → 413 with a JSON body, not 500
- [ ] an error with no `status` → still 500, and the message is not leaked
- [ ] `createApp()` with no options still builds, and `/api/audit/ghs` answers 503

## Task 5: The fixtures and the recorder

**Files:** `apps/api/src/audit/fixtures/`, `apps/api/src/audit/recordFixture.cli.ts`

- [ ] A sample GHS label photograph committed under `fixtures/`. **Not a photograph of a label this app
      drew** — a rendering of our own output would test the model against our own renderer and tell us
      nothing about a real one.
- [ ] `recordFixture.cli.ts` — reads the key from the environment, makes one call, writes
      `fixtures/recorded.json` with the raw `Message`. Shaped like `printTestSheet.cli.ts`. Never run by CI.
- [ ] `fixtures/refused.json`, `fixtures/notJson.json`, `fixtures/wrongShape.json` — hand-written, with a
      note in each saying their shape comes from the API specification and that the recorded one does not get
      that licence.
- [ ] `extract.live.test.ts` — `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`, one test, asserting only
      that a real call returns a parseable `ExtractionResult`. It asserts nothing about accuracy; that is a
      different question and needs a labelled dataset.

## Done when — stage 1

- [ ] `npm test` green with `ANTHROPIC_API_KEY` unset. **Check `Test Files`, not just `Tests`.**
- [ ] `npm run typecheck`, `npm run lint` clean.
- [ ] The recorded fixture replays into a typed `ExtractionResult<GhsLabelData>`.
- [ ] The four clean-error paths are asserted, and the refusal one asserts the absence of a throw.
- [ ] `CHANGELOG.md` updated **in the same edit** as the change.
- [ ] Mutation tests run, each confirmed to have actually applied:
  - [ ] delete the `stop_reason` guard → a named test fails on a `TypeError`
  - [ ] change `safeParse` to `parse` → the schema-violation test fails with a throw, not a 422
  - [ ] remove the `err.status` branch → the 413 test reports 500

---

## Stage 2 — capture and confirm (outline; expanded at the boundary)

- `label-core/src/extraction/confirm.ts` — `confirmed(result, accepted)`. Add to `src/index.ts` **and to the
  hand-written module list in `barrelExports.test.ts`**, which does not sweep a new file on its own.
- `useLabelPhoto` — file input first (`accept="image/*" capture="environment"`), camera still second, reusing
  `useBarcodeScanner`'s `CAMERA` constraints, generation guard and `ScannerState` union. Normalise: orient
  from EXIF, cap the long edge at 2576 px, encode JPEG.
- `AuditView.vue` — mobile-first, not `panes.ts`. Two sections: **read from the photograph** (accept / edit /
  discard per field, nothing pre-accepted) and **not from the photograph** (`regime`, `capacityL`, measured
  label width and height, `hazards` optional). None of the second group is defaulted.
- Router, `SiteHeader.vue`'s `Section` union, and `editorTestRouter.ts`.
- The test that matters: **a field left unconfirmed never reaches the document**, asserted as a negative.

## Stage 3 — the report and the hand-off (outline)

- `layOutGhsLabel` then `runRules` on the confirmed document; `FindingsRail` reused via its five props.
  Its `id="findings-heading"` is hardcoded and it owns the app's only `aria-live` region — both need handling.
- The honest claim, in the interface: these findings describe a label built from what you confirmed, not the
  photograph.
- Every GHS pictogram glyph is a layout omission today (`ghsEngine.ts:16-21`), so the "Cannot be checked"
  block will be populated on every audit and must read as a fact about this build rather than a defect on the
  user's label.
- **Open in the editor** → loads the store and navigates. Saving stays the editor's act.
- `e2e/the-label-audit.spec.ts` — `page.route('/api/audit/**')` fulfilled from the recorded fixture.

## Documents

- `CHANGELOG.md` — in the same edit as each change.
- `docs/DESIGN.md` — the two corrections this plan's spec establishes (structured outputs do not enforce
  enums or patterns through `zodOutputFormat`; "don't downsample" needs the 2576 px nuance), and the phase
  table moved to 6 complete / 7 in progress.
- `docs/BACKLOG.md` — widening `Finding.certifies`; `sourceRegion` in pixels versus millimetres;
  `GhsRequest`'s eu-clp-hardcoded code enum on a `us-osha` label; deriving `hazards` from H-codes; and a note
  on the existing rate-limit entry that this endpoint is the one it was written for.
