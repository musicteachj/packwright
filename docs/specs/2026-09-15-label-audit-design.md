# Label audit from a photo

Phase 7, all of it. Written 2026-09-15, against `dev` at `86abd7d`.

Three stages. This document covers the whole phase; the stage that ships first is the extraction endpoint,
with no user interface at all. `/audit`'s capture-and-confirm screen and the audit report are the two stages
after it, because both turn on questions — what a user is confirming, and what the report is entitled to
claim — that are easier to answer once there is a real `ExtractionResult` to look at.

The boundary `docs/DESIGN.md` states is the whole point of the phase, and everything below serves it:

> **The LLM reads. The rule engine judges.**

---

## What is being decided

**The first label type is GHS chemical, and it is the only one in this phase.** Its seven rules judge
*content* — signal-word precedence, Article 26 pictogram precedence, whether every pictogram on the label is
one the classification requires, what the small-container provision demands of a label that invokes it. That
is what a photograph can evidence. GS1 retail would be the wrong choice and it is worth saying why: its rules
are quiet zone, magnification and bar height, none of which survive being photographed, and the phase 6
scanner already reads a GTIN better than vision does. US food needs `container` dimensions that
`assertContainerDrawable` throws without and that no photograph shows.

`templates/ghs.ts:85-88` settles it from the other direction. `signalWords` is plural, and the reason recorded
there is this phase: *"A photograph of a real label carrying both words is precisely what the audit path has
to be able to report, and a single-valued field could only represent it by discarding half the evidence."*

**Extraction is verified against a recorded response, not a written one.** The transport is an injected port,
so no test touches the network. A `recordFixture` CLI makes one real call and commits what came back; the
suite replays it. A hand-written fixture would be the implementation restated in JSON, and `ghs/statements.ts`
records at length what verifying an extract against itself cost the last time — twelve corrupted statements,
found only because somebody decoded the PDF a second way. One live test exists, skipped unless
`ANTHROPIC_API_KEY` is set, for re-proving the prompt deliberately.

**`ANTHROPIC_API_KEY` stays an `optionalSecret`.** Making `MONGODB_URI` required in phase 6 broke every
harness that boots the server, and that was a change with a `docker compose` file behind it. This key has an
external dependency and a per-call cost behind it, so the same move would be worse. An absent key produces a
clean 503 from one endpoint, never a process that will not start.

**The model authors no prose.** Not a warning, not a note, not an explanation — values and confidences only.
Every `ExtractionWarning` in the result is produced by our own code from a deterministic check. This is
stricter than `docs/DESIGN.md` requires, and the reason is placement: warnings sit beside findings in the
user interface, and a sentence written by a language model next to a sentence carrying a CFR citation invites
exactly the confusion the boundary exists to prevent. "I could not read this" is already expressible — the
field is absent, or its confidence is low.

**The audit report judges a reconstruction, and says so.** The engine cannot judge a photograph; it judges a
label document. So the report runs the full rule set over what the user confirmed and states, in the interface
and not only here, that these findings describe a label built from what was confirmed rather than the
photograph itself.

`Finding.certifies` is the field that would let this be sharper — `'document'` versus `'artwork'` is exactly
the distinction an audit needs. It is set in two places in the entire registry today, both us-food passes
(`usFood/nutritionFormat.ts:108`, `usFood/dualColumn.ts:166`), and everything else defaults to `'artwork'`.
Filtering on it now would empty the report and be misleading in the opposite direction. Widening it across
`rules/` is real work that alters `withholdUncertifiablePasses`, so it goes to `BACKLOG.md` with a stage of
its own rather than being done in passing here.

**Corrected 2026-09-16.** Two things in the paragraph above no longer hold, and one never did. Nothing
defaults any more: `Finding` is discriminated on `severity`, so every pass states `certifies` or does not
compile. And the premise that filtering on it "would empty the report" assumed a filter this report never
had — `withholdUncertifiablePasses` is the field's only reader, and a report that separated a verdict about
the user's label from one about our reconstruction would need `certifies` on violations, which `Finding` now
forbids until that is designed. See `docs/BACKLOG.md`.

---

## Four things established by running the code

Each of these changes the design, and none of them is visible from reading the documentation. The fourth cost
about a penny to establish: one real call, with the schema this phase actually sends.

**1. Structured outputs constrain types and keys — not enums, and not patterns.** `zodOutputFormat` converts
`UpcARequest`, `GhsRequest` and `UsFoodRequest` without complaint. But the SDK's `transformJSONSchema` keeps
only `type`, `description`, `title`, `format`, `items`, `required` and a forced `additionalProperties: false`;
everything else is appended to the description as prose. `gtin`'s twelve-digit pattern arrives as
`description: "{pattern: \"^[0-9]{12}$\"}"`, and an enum arrives the same way — even though the API itself
supports `enum`.

So `docs/DESIGN.md`'s claim that "extraction cannot return a shape the wizard can't consume" is true only
because we re-validate the response with the real Zod schema on receipt. That re-validation is the guarantee,
and a schema violation is therefore a second clean-error path alongside refusal, not an edge case.

**2. A closed set on the statement codes would force the model to lie.** `GhsRequest:162-167` keys
`hazardStatementCodes` to `knownHazardStatementCodes('eu-clp')` whatever the regime says, and
`US_OSHA_HAZARD_STATEMENTS` is `{}` (`ghs/statements.ts:290`). A regime-correct enum on a US label would have
no members at all; the eu-clp list on a US label is a foreign set the model would be pushed to pick from.

Codes are therefore extracted as **free strings** and classified by us, through `hazardStatementText(regime,
code)` and its `own()` guard. A code with no verified text becomes an `ExtractionWarning` and is still
reported to the user. This mirrors what the layout engine already does with the same input: a code it cannot
supply text for is recorded as an omission rather than rendered from another regime's wording.

**3. Which block `content[0]` is varies between identical calls.** `docs/DESIGN.md:363-365` frames the refusal
check as what stops `content[0]` from breaking. That is true, and it understates the problem in the more
awkward direction. Two live calls to `claude-opus-5` with the same parameters returned different block
layouts: the first, against a blank image, came back `[thinking, text]` with 109 thinking tokens; the
recording run, against the sample label, came back `[text]` with **zero**. Adaptive thinking decides per
request, so a positional read is not reliably wrong — it is *intermittently* wrong, which is the harder kind
to find and the kind that survives a green suite. The code finds the text block by type. Both calls confirmed
`stop_details` is `null` on `end_turn`, which is why that field is guarded before it is read.

**4. Claude receives no image metadata.** The vision documentation says so outright, so a phone photograph
carrying EXIF orientation 6 is seen on its side. The client normalises before upload: orient from EXIF, cap
the long edge at **2576 px**, encode JPEG. That figure is the high-resolution tier's own limit on Opus 5 —
the API downsamples to it anyway — so nothing is lost, and `docs/DESIGN.md`'s "don't downsample before
upload" is honoured rather than contradicted. Both documents need the nuance, because the naive reading sends
a 12-megapixel photograph the API immediately throws most of away.

### Decided at the stage 2 boundary

**An unrecognised statement code is shown and cannot be confirmed.** Stage 1 chose to report a code this build
has no verified text for rather than drop it, because the user should see what was on their label. That left a
question it could not answer on its own: `GhsRequest` admits only codes with verified text, so confirming one
produces a label the save and export routes refuse with a 400, naming a field the user cannot edit their way
out of.

Three ways out. Refuse the code; drop it with the user's agreement; or loosen `GhsRequest` so the layout
engine records the omission it already knows how to record. This takes the first. It keeps the change inside
the audit screen, "this build has no text for H999" is both true and worth showing, and the third is really
the same job as transcribing OSHA Appendix C.4 — which is in `docs/BACKLOG.md` and is a reference-table task
with its own provenance requirements, not a schema tweak.

---

## Module layout

```
apps/api/src/
  audit/
    extractionSchema.ts     the GHS projection, confidence-wrapped
    extract.ts              the producer, behind an injected port
    routes.ts               POST /api/audit/ghs
    recordFixture.cli.ts    one real call, by hand, writes the fixture
    fixtures/               the recorded response, and the protocol fixtures

packages/label-core/src/
  extraction/confirm.ts     pure: ExtractionResult<T> + accepted keys -> Partial<T>

apps/web/src/
  audit/useLabelPhoto.ts    file input and camera still, normalised
  api/audit.ts              the client, shaped like api/savedLabels.ts
  views/AuditView.vue       capture, confirm, report
```

`label-core` gets exactly one file, and only because the merge is pure and a Safety Data Sheet path would
reuse it unchanged. Everything touching the Anthropic SDK lives in `apps/api`, which `eslint.config.js`
enforces anyway.

---

## What is extracted, and what is not

The extraction schema is a **projection** of `GhsLabelData`, not the form schema. Handing the model the form
schema would hand it `pictogramSideMm`, `stock` and the type defaults, and invite it to invent layout it
cannot see.

Extracted, each as `{ value, confidence }` and every one optional — absent means *not visible in the
photograph*:

| Field | |
|---|---|
| `productIdentifier` | CLP Article 18 |
| `signalWords` | plural, so a label carrying both is representable |
| `pictograms` | Annex V codes |
| `hazardStatementCodes` | free strings, classified by us |
| `precautionaryStatementCodes` | free strings, classified by us |
| `supplier` | name, address, telephone |
| `outerPackageStatement` | free text; the regulation describes it and does not codify it |

Not extracted, each for a stated reason:

- **`regime`** — a market decision, not a property of the artwork. `templates/ghs.ts:60-67`: defaulting it
  means "a label silently judged against the wrong regulator".
- **`capacityL`** — a property of the package. `templates/ghs.ts:16-20`: "a 100 ml bottle and a 2 litre drum
  sit in different bands however large a label is wrapped around either".
- **`hazards`** — the classification behind the pictograms, which is not printed. Article 26 precedence turns
  on *why* a pictogram is present, so inferring the classification would make the precedence rule judge the
  model's guess rather than the label. The user may supply it; left blank, those rules correctly decline.
- **`smallContainerLabelling`** — a feasibility determination under 1910.1200(f)(12)(i), which nothing in a
  photograph can make.
- **Every geometry field** — `pictogramSideMm`, `stock`, the type sizes.

The user supplies `regime`, `capacityL` and the **measured** label width and height in the confirm step,
labelled as not coming from the photograph. **None of them is defaulted.** `DEFAULT_GHS_STOCK` is 74 × 105 mm,
which is the CLP minimum for the 3-to-50-litre band — so defaulting the stock would hand
`ghs/label-dimensions` a guaranteed pass on a label nobody measured. `assertContainerDrawable`'s reasoning
applies word for word: *"Defaulting it would fabricate a requirement."* `marginMm` may default, because it is
a drawing choice rather than a measured figure.

---

## API surface

```
POST /api/audit/ghs
  { regime, image: { mediaType, data } }
```

One image per request, base64 in JSON. `express.json({ limit: '10mb' })` is already sized for it, and its
comment at `app.ts:126` has said "Generous, because a label audit posts a photograph" since phase 6.
`mediaType` is limited to the four formats Claude accepts.

| Status | Body | When |
|---|---|---|
| 200 | `{ extraction, model }` | |
| 400 | `{ error: 'Invalid audit request', detail: [{ path, message }] }` | bad body, unsupported media type |
| 413 | `{ error: 'The image is too large', detail }` | body over the limit |
| 422 | `{ error: 'The image could not be read as a label', detail }` | refusal, non-JSON content, schema violation |
| 502 | `{ error: 'The extraction service could not be reached' }` | the upstream call failed |
| 503 | `{ error: 'Vision extraction is not configured' }` | no key |

`{ error, detail }` throughout, matching `labels/routes.ts:54-61` and `labelDocumentRoutes.ts:21-28`. The
existing API has exactly one error contract and this does not add a second.

The 413 needs a change to reach the client at all. `express.json` throws a `PayloadTooLargeError` carrying
`status: 413`, and the handler at `app.ts:204-209` answers every error with `500 Internal server error`. No
route has posted anything large enough to hit it before; this one will, routinely, from a phone.

---

## Validation

Two paths, in this order, and the order is the requirement:

1. **`stop_reason === 'refusal'` is checked before `response.content` is touched.** A declined request returns
   HTTP 200 with empty or partial content, and a throw here reaches the 500 handler and reports an internal
   error for something that is not one. `stop_details.category` is carried into the detail when present, and
   guarded — a live call confirmed it is `null` on `end_turn`.
2. **The text block is found by type, never by position.** See finding 3 above: with thinking on, a successful
   response's `content[0]` is a `thinking` block.
3. **The response body is re-validated with the extraction schema.** `safeParse`, not `parse`: a violation is
   a 422 with the offending paths, not an exception. `zodOutputFormat`'s own `parse` throws, which is why the
   request goes through `messages.create` and the parsing is ours.

Then the codes are classified, and unknown ones become warnings rather than a rejected payload. Losing an
entire extraction because one statement code was misread would be the wrong trade for a screen whose whole
purpose is to show a user what was read.

---

## Startup and configuration

`server.ts` builds the Anthropic client when `env.ANTHROPIC_API_KEY` is present and passes the extractor into
`createApp`; when it is absent it passes nothing, and the route answers 503. This is the injection pattern
`AppOptions` already uses for `webRoot` and `databaseStatus`, and its docblock states the reason:
`createApp()` builds the same application every time it is called, so route tests depend on nothing outside
their own arguments.

---

## Testing

Server-side tests run under supertest with a fake port. No key, no network, no cost.

- refusal → a clean 422, and not a throw
- content that is not JSON → 422
- a body that violates the schema → 422, naming the paths
- no extractor configured → 503
- a body over the limit → 413, not 500
- the recorded response → an `ExtractionResult<GhsLabelData>` whose confidences are the ones in the fixture
- an unknown H-code → a warning, **and the rest of the extraction intact**
- a code that reaches `own()`'s prototype-pollution guard (`statements.ts:304-306`) → a warning, not a 500

The refusal, malformed-content and schema-violation fixtures are hand-written, and that is legitimate: their
shape comes from the API specification rather than from our implementation. The extraction fixture does not
get that licence, and is recorded.

The browser test stubs at the page boundary with `page.route('/api/audit/**')`, fulfilled from the same
recorded fixture — deterministic, free, and with no test-only branch inside production code. The server side
is covered by supertest; the client path is what the browser is there to exercise.

---

## Not in this stage

- **Any new compliance rule, and therefore any new citation.** The seven GHS rules shipped in phase 4, each
  with a known-bad fixture. Nothing here needs a source document verified.
- **`sourceRegion`.** `BoundingBox` is millimetres on a stock; a vision region is pixels on a photograph, and
  the vision documentation calls its localisation approximate. Writing pixels into a field named `xMm` would
  be the first breach of the units-in-the-field-name convention.
- **Rate limiting.** Already recorded in `BACKLOG.md` under the pre-stage-2 security pass, homed at phase 8
  where an ALB and a WAF rule are the natural place for it. That entry named this endpoint in advance as the
  one that would need it most.
- **GS1 retail and US food extraction.** And a warning for whoever writes them: if the extractor repairs a
  GTIN's check digit, or writes printed figures into `amounts` rather than `declaredAmounts`, the
  corresponding rule becomes a tautology and the audit certifies a label it never examined. Take what is
  printed, verbatim, wrong digits and all.
