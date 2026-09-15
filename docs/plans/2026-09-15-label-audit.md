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

## Stage 2 — capture and confirm

Written against `dev` at `f6d39fe`, with stage 1 merged in #23.

**What this stage ends at.** A photograph, a screen of readings each of which the user has accepted, edited
or discarded, and a `GhsLabelData` built from what was accepted — shown as a plain summary. The engine does
not run yet; the findings and the hand-off into the editor are stage 3. The point of stopping there is that
the confirm gate is the thing worth reviewing on its own, and burying it under a findings rail is how it
stops being looked at.

### The decision this stage turns on

**An unrecognised statement code is shown and cannot be confirmed.** A photograph can carry a code this build
has no verified text for; extraction reports it with a warning rather than dropping it, because the user
should see what was on their label. But `GhsRequest` admits only codes with verified text, so confirming one
produces a label the save and export routes refuse with a 400 naming a field the user cannot edit their way
out of.

Of the three ways out — refuse the code, drop it with the user's agreement, or loosen `GhsRequest` — this
stage takes the first. It keeps the change inside the audit screen; "this build has no text for H999" is both
true and useful to show someone; and loosening the schema is really the same job as transcribing OSHA
Appendix C.4, which `docs/BACKLOG.md` already holds.

So a code carrying an `EXTRACTION_FIELD_DISCARDED`-style warning is rendered as read-but-not-usable, with no
accept control, and the field it belongs to confirms with the remaining codes.

### Tasks

**1. `ExtractionResult` stops admitting a field with no value.** `fields` is
`{ [K in keyof T]?: ExtractedField<T[K]> }`, and for an optional key of `GhsLabelData` that `T[K]` still
includes `undefined` — so `fields.supplier.value` is `GhsSupplier | undefined` and every consumer needs a
second optional chain for a state that means nothing. `ExtractedField<NonNullable<T[K]>>` says what was
meant. `docs/BACKLOG.md` says this wants to land with the consumer that feels it, which is this stage.
A change to a phase 1 type, so the existing `extract.ts` mapping and its tests move with it.

**2. `packages/label-core/src/extraction/confirm.ts`.** Pure and framework-free:

```ts
confirmed<T>(result: ExtractionResult<T>, accepted: ReadonlySet<keyof T>): Partial<T>
```

Takes only the keys named, ignores the rest, and reads nothing from anywhere else — so the only way a value
becomes label data is that the set says so. Add to `src/index.ts` **and to the hand-written module list in
`barrelExports.test.ts`**, which does not sweep a new file on its own.

**3. `apps/web/src/audit/useLabelPhoto.ts`.** Two ways in.

- **A file input**, `accept="image/*" capture="environment"` — the primary. On a phone it opens the native
  camera and returns a full-resolution photograph; on a desktop it picks a file.
- **An in-page camera still**, importing `CAMERA` and `ScannerState` from the scanner rather than restating
  them. The scanner's lifecycle — the generation guard, the wording that separates a declined permission from
  an absent API, the explicit track release — is copied rather than shared, and that is a debt this stage
  records rather than pays: extracting one camera composable from two is a refactor of tested code and wants
  its own change.

Normalisation, in both paths: orient from EXIF, cap the long edge at **2576 px**, encode JPEG. Claude reads no
image metadata, so a phone photograph carrying orientation 6 is read on its side; and 2576 is the
high-resolution tier's own limit, so capping there loses nothing the model would have used.

**4. `apps/web/src/api/audit.ts`.** Mirrors `api/savedLabels.ts` — the same `request` helper shape, the same
guarded parse of an error body, its own error class carrying `status` and `detail`.

**5. `apps/web/src/views/AuditView.vue`.** Mobile-first, **not** `panes.ts`. Three sections:

- **Read from the photograph** — one row per field: the value, its confidence, and accept / edit / discard.
  **Nothing is pre-accepted.** A code with no verified text renders without an accept control and says why.
- **Not from the photograph** — `regime`, `capacityL`, and the **measured** label width and height, entered by
  the user and labelled as such. **None is defaulted**, because `DEFAULT_GHS_STOCK` is the CLP minimum for its
  band and defaulting it would hand `ghs/label-dimensions` a guaranteed pass on a label nobody measured.
  `hazards` is offered and optional; left blank, the pictogram-set and precedence rules correctly decline.
- **The document so far** — what has actually been confirmed, as plain text.

**6. Router, `SiteHeader.vue`'s `Section` union, `editorTestRouter.ts`.**

### The tests that have to fail first

- `confirmed()` ignores a key not in the accepted set — asserted as a **negative**, with the field present in
  the result and absent from the output.
- A field the user never touched does not reach the document. The premise is asserted first, the way
  `certification.test.ts` does, so it cannot pass because nothing was extracted at all.
- Editing a value confirms the edited one, not the read one.
- An unrecognised code renders with no accept control, and confirming its field yields only the codes that
  resolve.
- A declined camera permission is worded as a decision, not a fault — and the file input still works.
- An image is normalised to 2576 px on the long edge and re-encoded, with EXIF orientation applied.
- The API client surfaces each of the endpoint's statuses as something a person can read.

### Done when

- A photograph produces rows with confidences, and nothing enters the document without an explicit act.
- `npm test`, `typecheck`, `lint`, `format:check`, `build`, `verify:build` and the browser suite all pass.
- Mutation tests, each confirmed to have applied: remove the accepted-set check in `confirmed()`; pre-accept a
  field in the view; default the stock; drop the EXIF orientation.

## Stage 3 — the report and the hand-off

Written against `dev` at `415b324`, with stages 1 and 2 merged in #23 and #24.

The last stage of the phase, and the first time the engine judges anything. Everything so far has been
reading and confirming.

### What the report is allowed to claim

Three things will be true of every audit this build produces, and each is a way a report could mislead if it
were left to sit in a findings list looking like a finding.

**1. The engine judges a reconstruction.** It takes a label document and draws it, so what it reports is about
*our* drawing of what was confirmed. For the content rules — signal-word precedence, Article 26, the required
element set — that barely matters, because they read the document. For anything dimensional it matters
entirely, which is why the confirm screen refuses to default the measurements.

**2. A rule that passed because a field was not confirmed has not passed.** Decline to confirm the signal
words and `ghs/signal-word-precedence` clears, because there is nothing to conflict. That is a false
clearance produced by the interface rather than by a rule, and it is the exact shape this project keeps
finding. **The report names every field that was read and not confirmed**, and says what that means.

**3. Half of what this build cannot do looks like a defect on the label.** Every GHS pictogram glyph is a
layout omission — the Annex V artwork was never verified — so the "cannot be checked" block is populated on
every audit. Under `us-osha` every statement code has no verified text, so an OSHA audit draws no statements
at all. Both must read as facts about this application.

So the report has its own section, above the findings, headed by what was *not* judged. The findings rail
follows it.

### Tasks

**1. `apps/web/src/audit/report.ts`.** Pure, and out of the view for the reason `readingRows.ts` is:

```ts
auditReport(data: GhsLabelData, stock: LabelStock, read: ReadonlySet<ReadingKey>,
            confirmed: ReadonlySet<ReadingKey>): AuditReport | AuditRefusal
```

- `layOutGhsLabel` then `runRules`, grouped and split exactly as the editor store does.
- `uncertifiable` is the layout's omissions alone. A GHS layout returns `symbols: []`, so the overprint and
  overflow halves of the store's version have nothing to say here — and restating them would be code that
  cannot run.
- `unconfirmed` = read minus confirmed, as field labels.
- A `LayoutError` is a refusal with its message, not a throw. The engine declines input that describes no
  drawing, and a missing capacity or a zero stock is exactly that.

**2. The report in `AuditView.vue`.** Shown once the document is complete — a regime, a product identifier, a
capacity and a measured stock. `FindingsRail` reused via its five props.

**3. `FindingsRail` gains two optional props.** `headingId` and `owns-live-region`, both defaulting to what it
does now, so the editor is untouched. Its `id="findings-heading"` is hardcoded and it owns the app's only
`aria-live` region; `EditorView.vue:430-439` documents the care that took, and a second live region on the
audit page would undo it.

**4. The hand-off.** `Open in the editor` puts the confirmed document into the store as an unsaved label and
navigates to `/labels/new`. Saving stays the editor's act — this screen does not gain a second way to write a
record.

**5. `e2e/the-label-audit.spec.ts`.** `page.route('/api/audit/**')` fulfilled from the recorded fixture, so it
is deterministic and free. It drives the whole path and asserts the one thing the phase exists to show: a
photograph carrying DANGER and WARNING produces `GHS_SIGNAL_WORD_CONFLICT`, cited to CLP Article 20(3), from
the deterministic engine.

### The tests that have to fail first

- A confirmed document carrying both signal words produces `GHS_SIGNAL_WORD_CONFLICT` with its real citation.
- **A field read and not confirmed is named as not judged** — asserted with the premise first, so it cannot
  pass because nothing was read.
- A rule that cleared only because its field was unconfirmed is not presented as a pass without that notice.
- A `LayoutError` is a refusal that says what was wrong, not a blank screen.
- The report does not appear while the document is incomplete.
- Two `aria-live` regions never exist on the page at once.
- The hand-off puts the document in the store unsaved, and saves nothing.

### Done when

- The sample label's audit reports the Article 20(3) violation, from `rules/`, with its citation.
- Every finding in the report comes from the engine; nothing on the screen is authored by the model.
- `npm test`, `typecheck`, `lint`, `format:check`, `build`, `verify:build` and the browser suite pass.
- Mutation tests, each confirmed applied: drop the unconfirmed-fields notice; default the stock; let
  `FindingsRail` own a second live region; return findings from anywhere but `runRules`.

## Documents

- `CHANGELOG.md` — in the same edit as each change.
- `docs/DESIGN.md` — the two corrections this plan's spec establishes (structured outputs do not enforce
  enums or patterns through `zodOutputFormat`; "don't downsample" needs the 2576 px nuance), and the phase
  table moved to 6 complete / 7 in progress.
- `docs/BACKLOG.md` — widening `Finding.certifies`; `sourceRegion` in pixels versus millimetres;
  `GhsRequest`'s eu-clp-hardcoded code enum on a `us-osha` label; deriving `hazards` from H-codes; and a note
  on the existing rate-limit entry that this endpoint is the one it was written for.
