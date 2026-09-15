# Backlog

Things found and deliberately **not** done, with the reason. Mostly review findings that were real but
outside the stage that surfaced them.

This file exists because the alternative was worse. Reviews on this project have been scoped to the whole
branch, and each one found three to five genuine defects in already-committed territory; fixing all of them
immediately turned four planned items into three unplanned commits and left phase 5 stage 6 no further
forward. A finding worth keeping is not automatically a finding worth doing next.

---

## Rules that do not exist yet

**Nothing checks the Nutrition Facts footnote.** 21 CFR 101.9(d)(9) sets the footnote verbatim and
`NUTRITION_FOOTNOTE` carries all three permitted variants, but no rule compares what a panel prints against
them. Found while fixing the tabular display, which had been printing (j)(13)(i)'s abbreviated statement on
every tabular display including the ones not entitled to it — a defect that lasted precisely because no rule
looks here.

**101.3(b) and (d) are unchecked, and two of the three clauses should stay that way.** (b)'s "common or usual
name" is a question about 21 CFR part 102 and about usage rather than about a label. (d)'s "size reasonably
related to the most prominent printed matter" states no measurable standard, the same shape as
(d)(13)(ii)'s "to the maximum extent possible". (d)'s **bold** requirement is checkable in principle but
satisfied by construction today, so a rule for it could not fail — it becomes worth writing only if the
engine ever draws the statement at a caller's chosen weight.

**§101.12(b)'s reference amounts are not modelled.** The RACC table is roughly 140 food categories.
Consequences carried today: `us-food/serving-size` checks that a serving size is declared and not that it
follows (b)(7), and the mandatory dual-column rules take the reference amount as a declared field rather than
deriving it. Both say so in their passing findings. Modelling the table is a phase of its own, and every row
needs verifying against the source.

## Latent, not yet biting

**Type size and typeface are read from different primitives.** `containsStatementType`'s `smallestOf` pairs
the minimum `fontSizeMm` across an element's lines with `lines[0]`'s `fontFamily`, and
`informationPanelTypeSize`'s `byElement` does the same. Harmless while every block is set in one face — which
is true today, since `US_FOOD_TYPE_DEFAULT` gives the whole label one family — and it is precisely the
conflation those rules exist to remove, since a glyph height is meaningless without the face it was measured
in. Worth fixing before any label draws two faces in one element.

## The editor

**The rail's required numeric fields clear the label, not just corrupt it.** `v-model.number` hands back the
string when `parseFloat` gives NaN, so clearing a box writes `''` into the document. The two *optional*
numbers were fixed — blank means unset, which is a thing the regulation permits. The container and stock
dimensions are required, so a blank has no defined meaning, and the fix is a design question rather than a
guard: retaining the last value snaps the digits back mid-edit, which is worse than the bug for anyone
clearing a field to retype it. Sites: `UsFoodFormRail.vue` container width/height/circumference/surface area
and stock width/height/margin.

**The entry that stood here claimed a false clearance, and there was none.** It said `'' * 240` is `0` rather
than `NaN`, so a cleared "Panel width" made the panel area a valid zero, `isNetQuantityZoneRequired(0)`
returned false, and every 101.7 rule cleared a label whose dimensions were empty. Every step of that
arithmetic is correct. The path is not: `assertContainerDrawable` reaches the container before any rule runs,
and `Number.isFinite('')` is `false` because it does not coerce — so the label never resolved, no rule ever
ran, and the editor showed "Container panel width must be a positive finite number". Running it says so:
layout `null`, zero findings.

It was written from reading the predicate rather than from running the path, and the entry said so
approvingly — "verified by reading the predicate, not inferred". That is the sentence to distrust. Reading a
predicate tells you what it returns for an input; it tells you nothing about whether that input arrives.

**What was real is smaller and is fixed** (phase 6 stage 4): `v-model.number` wrote the empty string into a
field the type declares as `number`. The container dimensions now go through a `requiredNumber` guard that
writes `NaN`, so the document holds a number that is not a measurement and the engine declines for a reason
that reads properly. Worth having for the type. Worth none of the urgency it was given.

The stock dimensions still use the raw binding. Same type lie, same absence of a false clearance —
`panelFor(stock)` is reached by the same guard — so they are a tidiness item rather than a scheduled one.

**The default document reads `almonds (almonds)`.** A review flagged it; `EditorUsFoodView.test.ts` asserts it
on purpose, as "belt and braces — the parenthetical in the list and the statement after it". Both are right:
carrying both declarations is realistic, and demonstrating it on an ingredient already named for its own food
source is degenerate. An ingredient whose name does not reveal the allergen — the classic being
`marzipan (almonds)` — would show the feature earning its place. A content decision about the seeded
document, not a correctness fix.

## Saved labels

**~~A saved label's `data` cannot be posted to the export route as it stands.~~ Closed** by the saved-labels
user interface, which is the stage this entry said would make it reachable. Opening `/labels/:id` restores the
stock a label was saved at as well as its data, and `e2e/the-saved-label-round-trip.spec.ts` carries the round
trip: save at 90 mm, open, export, assert the PDF's MediaBox. Reverting the fix makes it report `[0 0 170.07874
113.385827]` — 60 mm, the default — which is the silent wrong size this entry described.

The helper it also asked for was not written. Nothing outside the editor builds an export request, so a shared
one would have a single caller and would be a guess at what a second one wants.

**The label list is unbounded.** `GET /api/labels` returns every document, newest first. The sort is indexed
now, so the 32 MB in-memory sort ceiling is no longer the limit, but the response still grows without one.
Pagination is an API shape decision — cursor or offset, and what the client does with it — and it belongs
with the list view that will consume it rather than ahead of it.

## The API's tests

**`loadEnv` is tested twice, in two files.** `apps/api/src/env.test.ts` and a `describe('loadEnv')` block
inside `apps/api/src/app.test.ts` cover overlapping ground — defaults, port coercion, a rejected `NODE_ENV`,
a declared-but-blank secret. Both needed the same repair when `MONGODB_URI` became required, which is how the
duplication surfaced: a change to one schema field meant editing the same assertions in two places, and the
second copy is the one that would be forgotten.

Not merged here because deleting tests is a change that should be made deliberately rather than while passing
through. The `app.test.ts` copy is the older one and its cases are a subset, so the merge is a deletion rather
than a consolidation — but it wants someone to confirm that reading rather than a patch that assumes it.

The cost has since been paid twice more. Repairing both copies meant pasting the same `REQUIRED`/`load` helper
into each, and two review passes flagged the duplication independently. The reading has now been done and the
subset relationship holds, so what remains is the deletion itself — which is a commit of its own, not a line
in one that was making the schema stricter.

## The scanner

**The fallback swaps on a timer, and it could swap on evidence.** `NATIVE_TRIAL_TICKS` gives the browser's
own detector sixty-four barren frames — eight seconds — and then hands the camera to zxing unconditionally.
The sharper shape is to offer zxing the very frame native has just failed on and swap only if zxing reads it,
which separates "this detector is broken" from "nothing is in shot yet" instead of guessing at it with a
clock. The timer gets both ends wrong: someone who takes nine seconds to line a pack up loses a working
platform decoder, and someone pointing a Firefox at a blank wall waits eight seconds to be told nothing.

It was tried during stage 5b and abandoned because `detect` hung there every time with no error. **That cause
is now established and fixed** — one version's `zxing-wasm` binary running under another version's Emscripten
glue, nothing to do with the comparison — so the blocker is gone and what remains is a small change to
`fallBackToZxing`. It is not done here because stage 5b's scope was reading a barcode at all, the timer
version is written and green, and the comparison needs a test for the case the timer never had to handle:
zxing reading nothing either. Swapping on a frame *neither* engine can read would downgrade the platform
detector on precisely the evidence that says nothing is wrong with it.

## Deferred from phase 5 stage 6

Moved to a follow-up so phase 5 can reach `dev`. Between them these carry three mechanically checkable
requirements, on label types that are rare, against a branch that has been unmerged for the whole phase.

- **Aggregate display — 101.9(d)(13).** A permission, extending the same `columns` axis dual-column
  introduces. Two hard `shall`s: the identity of each food immediately right of the heading, and both the
  weight and the percent Daily Value in separate columns under each food's name. Its "comply with the format
  requirements of paragraph (d) **to the maximum extent possible**" must not become a rule — no measurable
  standard.
- **Bilingual display — 101.9(d)(14) with §101.15(c)(2).** One enforceable requirement: "All required
  information must be included in both languages." The choice between a separate label per language and one
  label with the second following the English is a permission, and "numeric characters that are identical in
  both languages need not be repeated" is an explicit dispensation — a completeness rule that missed either
  would report every compliant bilingual label.
- **Permitted abbreviations — 101.9(j)(13)(ii)(B).** Fifteen entries, not the eight this was scoped as. Four
  carry a second sentence granting scope beyond ≤40 in²: `Total carb` and `Incl` on dual-column displays,
  `Vit` and `Potas` on the standard vertical side-by-side. The violation cites **(c)** — "nutrient
  information shall be presented using the nutrient names specified" — with (j)(13)(ii)(B) as the permission
  a label failed to qualify for. Re-fetch the paragraph and diff it against `/tmp/s101.9.txt` before
  transcribing; the local extract must not be its own verification.

---

## From the phase 6 opening review

A `/code-review medium` run before phase 6's first commit ignored its target — a 26-line `CLAUDE.md` diff —
and audited the engine and editor instead. It returned 23 findings, none of them in the pending diff and all
of them in committed phase 5 code. One is fixed (rules now read `layout.omissions`; see `CHANGELOG.md`). The
rest are here.

**Verified and unverified are kept apart on purpose.** One reviewer reported that 21 CFR 101.9(d)(9)'s
footnote was paraphrased — that `NUTRITION_FOOTNOTE` was missing a "(DV)" parenthetical and every label this
project ships therefore carried generated regulatory text. Fetching the paragraph from the eCFR settled it:
the shipped string is exact, and the claim was wrong. The reviewer had flagged that it had not fetched the
source. Nothing below moves without the same check.

### Verified, deferred with a stage

**A dual column is certified by one figure out of fifteen.** `nutritionPanel.ts` emits the
`food-nutrition-second-column` band as soon as *any* nutrient carries a second value, and both
`us-food/dual-column-required` and `us-food/dual-column-form` test only that the band exists. Reproduced: a
panel with `secondAmounts: { 'total-fat': 6 }` and nothing else prints one figure in the second column and
returns `FDA_DUAL_COLUMN_FORM_MET/pass`. (b)(12)(i)'s mandate reported satisfied by a fifteenth of a column.
**Phase 6 stage 2**, with the rest of the dual-column work.

**The dual-column branch discards `declaredPercentDv`.** The single-column path goes through `percentOf()`,
which honours a declared percentage; the dual path calls `printedPercentDailyValue(id, value)` directly. So
on a dual-column panel the renderer silently prints the *correct* percentage while
`us-food/nutrition-percent-dv` reads the document and reports the wrong one — the artefact and the finding
contradicting each other, and the mis-declared-percentage defect made undrawable. **Phase 6 stage 2.**

### Verified, no stage yet

**101.7(f)'s exemption is conditional and is applied unconditionally.** The proviso reads that the
bottom-30 percent requirement "shall not apply … **when the declaration of net quantity of contents meets the
other requirements of this part**", and `netQuantityPlacement.ts` quotes that clause in its own doc block and
then keys the exemption on package area alone. Reproduced on a 0.9 in² panel with undersized type:
`FDA_NET_QUANTITY_TYPE_TOO_SMALL/violation` and `FDA_NET_QUANTITY_ZONE_NOT_REQUIRED/pass` on the same
declaration, the second predicated on a condition the first has just reported unmet. Lower severity than the
others here — the type-size violation is still reported, so nothing is wholly cleared — but it is a pass
issued on an unsatisfied condition, and the fix is a conditional the rule already has the inputs for.

**A "Contains" statement can vanish unannounced.** `usFoodEngine.ts` records an omission for an allergen no
ingredient carries, but not for the case where every bearing ingredient yields no food-source name — which is
what `tree nuts`, `fish` and `crustacean shellfish` do without an `allergenSpecificType`. Reproduced:
`containsStatement: ['tree-nuts']` with `{ name: 'praline', allergen: 'tree-nuts' }` draws no Contains
element and records `omissions: []`. Not a false clearance — `FDA_ALLERGEN_SOURCE_NOT_SPECIFIC` still fires —
but a declared element leaves the artefact with nothing saying so, which is the one thing `LayoutOmission`
exists to prevent.

**Two of the three footnote variants are unreachable.** `NUTRITION_FOOTNOTE.childrenOneToThree` and
`.firstSentenceOnly` have no consumer; `layout/nutritionPanel.ts` hardcodes `.standard` at both sites. The
eCFR text fetched this session confirms both variants are real requirements — a food "represented or
purported to be for children 1 through 3 years of age" **shall** substitute "1,000 calories" — so a
children's food is drawn with the 2,000-calorie wording and no rule looks at the footnote at all (see
"Nothing checks the Nutrition Facts footnote", above). There is also no field on `UsFoodNutritionFacts` to
declare the food as being for that age group, so the substitution is currently unreachable from the app as
well as undrawn. Needs a selector before it needs a rule.

### Reported, not yet verified

Recorded as reviewer claims rather than as facts. Each is checked before it is picked up.

- ~~**Bold text is measured with Regular metrics.**~~ **Verified, and narrower than reported.** The
  mechanism is real: `measureTextMm` and `glyphHeightMm` take only `fontFamily`, while `TextPrimitive`
  carries `fontWeight` and `renderPdf` resolves `>= 600` to a separate face. Both faces' figures were checked
  against the TTFs with fontkit rather than against the table that quotes them — Regular `o` 0.5400 and
  "Nutrition Facts" 6.6420 em, SemiBold 0.5460 and 6.9090 em, matching `measureTextMm` exactly. Bold strings
  measure **3.2–5.5% narrow**.

  **It corrupts no verdict**, which is what the original entry implied and is worth correcting. Two
  independent reasons: every rule that calls `glyphHeightMm` measures the net quantity, the Contains statement
  or an information-panel block, and all of them are drawn with `fontWeight: undefined`; and
  `regulatedGlyphBasis` returns `cap-height` for all-caps text, which is **identical** across the two faces at
  0.698 — so even a bold `NET WT 12 OZ` would measure correctly.

  Where it does land is geometry. The statement of identity is wrapped with `type.fontFamily` and drawn with
  `type.emphasisFontWeight`, so the engine computes 88.68 mm for a line that prints 91.79 mm; any string
  between `width / 1.035` and `width` wraps one line short of what prints, and that element's box height now
  feeds a bounds check. The tabular and linear displays size their columns from
  `Math.max(...rows.map(measureTextMm))` over rows that include bold text. A search for an actual divergence
  in a sample of realistic statements found none, so this is arithmetic rather than an observed failure.

  The fix threads a weight — or a resolved face, mirroring `embeddedFontFor` — through `measureTextMm`,
  `glyphHeightMm` and `wrapTextMm`, and touches every text call site in `label-core`. That is a change to the
  layer everything else sits on, for a defect that changes no verdict, so it wants its own stage rather than
  a detour inside someone else's.
- **The Calories word and numeral sit on different baselines on the vertical display.** Claimed: `text()`
  derives the baseline from each run's own size, so a 16 pt word and a 22 pt figure sharing a `yMm` are
  ~2.1 mm apart. The tabular branch already takes the max of the pair; the vertical branch is said not to.
- **The (c)(8) thick bar can be drawn above the first nutrient row.** If `facts.order` begins with a vitamin,
  `vitaminsStart` is 0 and the bar is drawn with no rows above it. The adjacent hairline has a `drawnRows > 0`
  guard for exactly this reason and the thick bar does not. Spot-read and looks right; reachable only on a
  deliberately mis-ordered panel, which is a panel `us-food/nutrition-order` exists to report.
- **A finding can carry an element id nothing resolves.** `listedIds` returns `facts.order` verbatim while the
  rounding and %DV rules iterate all of `NUTRIENTS`, so a nutrient absent from `order` gets a finding
  pointing at a row that was never emitted — the dangling-selection failure `nutritionPanel.ts` records
  learning once already.
- **A tabular nutrient column wider than its panel is drawn outside it** and is only reported when it also
  leaves the stock, so a column overflowing the panel box but landing inside the margin prints through the
  border unremarked.
- **Editor rail, five items.** The type-size override input unmounts itself mid-edit when the box is emptied
  (its `v-if` reads the same key its setter deletes), so the only route to an undersized declaration is
  overtyping without ever clearing; a blank ingredient percent is written as `0` rather than unset, so
  predominance order is judged against a figure the user never stated; `min`/`max` on that percent are not
  enforced on typed input, so out-of-range values reach the API as a raw 400; `setAllergen` re-asserts
  `declareInline: true` on every allergen change, silently restoring a parenthetical the user turned off; and
  toggling the second-column checkbox off `delete`s `facts.columns`, discarding every figure typed into it.
- **`generate-font-metrics.mjs`'s missing-glyph guards are dead.** fontkit returns `.notdef` rather than
  `undefined`, so a face lacking a character would record `.notdef`'s advance as that character's real width.
  Tooling rather than shipped code, but it is the generator the measurement tables come from.

---

## Serving the client

**Nothing is compressed.** The API serves `apps/web`'s build uncompressed, and the largest chunk is
`LabelCanvas-*.js` at roughly 1.07 MB — bwip-js, which the canvas needs and which nothing currently splits
out of the first load. Vite's dev server gzips; this one does not, and an ALB does not compress on a task's
behalf either, so the deployed app would ship the full megabyte on every cold visit.

Not fixed in phase 6 stage 1 because it needs a dependency (`compression`, or a reverse proxy doing it) and
the stage's done-when is that the build collapses to one artifact, which it now does. It is a real
user-facing cost rather than a tidiness point, and it belongs either with phase 8's deployment — where
CloudFront in front of the ALB would settle it without a dependency at all — or with a decision to code-split
bwip-js out of the initial chunk, which is the better fix and the larger one. Found by the stage 1 review.

---

## From the pre-stage-2 security pass

The pass itself came back clean on the thing it was run for: no secret has ever been committed, the browser
bundle carries none, and stage 1's static handler cannot be walked out of. Two findings were fixed at the
time — the wildcard CORS header and the two production advisories, both in `CHANGELOG.md`. These are the rest.

**Nothing rate-limits the export endpoint.** `POST /api/labels/*/export` is unauthenticated, renders a PDF per
call, and sits behind `express.json({ limit: '10mb' })`. That combination is a cheap way to spend a task's CPU
from the outside. It mattered less while the wildcard CORS header made the API openly callable anyway and the
app was not deployed; it matters more once it is. The right home is **phase 8**, where an ALB and a WAF rule
are the natural places to put it rather than middleware in this process — and where the vision endpoint,
which spends money per call, will need the same protection more urgently.

**That endpoint now exists.** `POST /api/audit/ghs` is unauthenticated and costs roughly two US cents a call
at the sample label's token count, which makes it the most expensive thing on this server to abuse and the
reason this entry stops being theoretical. Nothing about the fix changes — it still belongs at the edge rather
than in this process — but the order of the two endpoints does: the audit route is now the one to cover
first.

**~~There is no `.env.example`.~~ Written in phase 6 stage 6**, the stage that made `MONGODB_URI`
load-bearing, as this entry asked. It lives at `apps/api/.env.example` rather than the repository root:
`dotenv` resolves `.env` against the working directory and npm runs a workspace script from that workspace, so
a root `.env` is read by nothing. That was latent for as long as every variable was optional, and became a
failure to start the moment one was not.

**Three dev-only advisories remain.** `vitest` and `@vitest/mocker` (a path traversal in the mocker's redirect
handling) and `esbuild` (arbitrary file read via the dev server, on Windows). None ships: `esbuild` is only
reachable from production dependencies via `vue-router` → `vite`, which no runtime path touches. `npm audit
fix` will not resolve them without a major bump of the test runner, and taking a vitest major inside a
security change is how an unrelated breakage gets attributed to the wrong commit. Worth doing deliberately,
on its own, when there is a reason to touch the tooling.

**When stage 5 widens the CSP for the scanner, it must add `'wasm-unsafe-eval'` and not `'unsafe-eval'`.**
Helmet's default `script-src 'self'` blocks `WebAssembly.instantiate`, so zxing cannot decode anything in the
single artifact until the policy admits it. The two directives look interchangeable and are not: the second
re-enables `eval` and `new Function` for the whole application, which is the larger grant by far and the easy
mistake to make in a hurry.

---

## Seen in a browser for the first time

Phase 6 stage 2a put the app in front of a real browser. What that found — a panel drawing two column headings
over one column of figures — was **fixed in stage 2b** and is recorded in `CHANGELOG.md`.

**The entry that stood here got the reason wrong, which is worth keeping rather than quietly deleting.** It
said the state arose because "the rail has no field for the second column's amounts". The rail has had a box
per nutrient since the displays were made reachable from the editor; ticking the checkbox reveals fourteen of
them and they are simply empty until typed in. The claim was inherited from a comment in `nutritionPanel.ts`
that said the same thing, repeated without checking, and then written into three more places. The defect was
real and the diagnosis was not — and a wrong reason recorded confidently is worse than no reason, because it
is the sentence a later reader trusts instead of looking. All five sites are corrected.

**Where the "% Daily Value*" label sits on a dual-column panel is unresolved.** On the two-column panel the
engine now draws, that label is right-aligned over the second column alone, while both columns carry a weight
and a percentage. Whether that matches the display in 101.9(e)(6)(i) has **not** been checked against the
illustration, and the illustration is guidance rather than the regulation — so this is an observation from
looking at a screenshot, not a finding. It needs the source read before anyone changes anything, and it must
not become a rule on the strength of an illustration.

---

## From phase 7, stage 1

The extraction endpoint, and what writing it turned up.

**`Finding.certifies` is the right idea and is set in two places.** `'document'` versus `'artwork'` is exactly
the distinction an audit report needs: the engine judges a label rebuilt from what a user confirmed, so a
verdict resting on the document describes their label and a verdict resting on the artwork describes our
reconstruction. Today `passedOnDocument` is called at `usFood/nutritionFormat.ts:108` and
`usFood/dualColumn.ts:166` and nowhere else, so everything else defaults to `'artwork'` — and filtering an
audit report on it would empty the report, which is misleading in the opposite direction to not filtering at
all. Widening it means reading every rule and deciding what it actually judges, and it alters
`withholdUncertifiablePasses`, the guard standing between this project and a pass issued on ink that was never
laid down. Its own stage, and a `max` review.

**~~`ExtractionResult` admits a field that is present with no value.~~ Fixed in stage 2**, the stage this
entry said should carry it. `fields` is now `{ [K in keyof T]?: ExtractedField<NonNullable<T[K]>> }`, so
`fields.supplier.value` is a `GhsSupplier` rather than a `GhsSupplier | undefined` and the second optional
chain every consumer needed is gone. Absence was already sayable — the field itself is optional, and leaving
it out is how a producer says it could not read one. Nothing else in the repository needed changing, which is
what "land it with its first consumer" was worth waiting for.

**`sourceRegion` is millimetres on a stock, and a vision region is pixels on a photograph.** `BoundingBox`
names all four members `xMm`, `yMm`, `widthMm`, `heightMm`, and the same type is what `ResolvedElement.box`
uses. Filling it from a model would either put pixels in fields named for millimetres — the first breach of
the units-in-the-field-name convention this project has — or need a scale nobody has measured. It is not
requested at all in stage 1. Highlighting the part of a photograph a value came from would be genuinely good
on the confirm screen, and the vision documentation calls its localisation approximate, so it needs a
deliberate decision about what an approximate region may be used for before it needs a type.

**`GhsRequest` validates a `us-osha` label's statement codes against the EU table.** `schemas.ts:162-167` keys
both code arrays to `knownHazardStatementCodes('eu-clp')` regardless of the `regime` field beside them. In
practice the EU list is a superset for the codes that matter, since H- and P-numbers are UN GHS codes both
regimes adopt — so this is latent rather than biting, and *why* it is latent is the point:
`US_OSHA_HAZARD_STATEMENTS` is empty, so a regime-correct enum would reject every code on every US label. The
two are one problem, it stops being latent the day Appendix C.4 is transcribed, and the fix is the same fix.

**It is no longer only latent, and stage 2 has to handle it.** A photograph can carry a code this build has
no text for — `H999`, or any real code the tables happen to miss — and extraction reports it with a warning
rather than dropping it, which is right. But `GhsRequest` then refuses the *whole* label, so confirming that
reading makes the label unsavable and unexportable with a 400 naming a field the user cannot edit their way
out of. The confirm step therefore cannot simply hand everything it was given to the save route: it has to
either refuse to confirm an unrecognised code, or drop it with the user's agreement. That is a decision about
the confirm screen and belongs with it, not here — but it is a constraint on stage 2 rather than a wish.

**Nothing derives a hazard classification from the statement codes.** `GhsLabelData.hazards` carries
`ANNEX_V_ENTRIES` ids, and CLP Article 26 precedence turns on them — `ghs/pictogram-set` and
`ghs/pictogram-precedence` both decline without them. A label prints H-codes and pictograms, not class ids, so
an audit either asks the user to classify by hand or leaves the two most interesting GHS rules unable to run.
A deterministic H-code to hazard-class mapping would close that, and it is a reference table with its own
provenance requirements rather than a function — Annex VI, read and verified, not inferred. Emphatically not a
job for the model: a classification it guessed would make the precedence rule judge the guess.

**A combination code carrying an optional member cannot be matched.**
`EU_CLP_PRECAUTIONARY_STATEMENTS` keys one entry `'P370 + P380 + P375 [+ P378]'`, where the bracketed member
is the regulation's own optional part. Extraction now matches a code regardless of the whitespace around its
plus signs, which closes the common case, and does nothing for this one: a label printing
`P370 + P380 + P375` — entirely correctly, having not used P378 — resolves to nothing and is warned as
unrecognised. The fix is a lookup that understands the bracket rather than more string tidying, and it wants
someone to read how many entries carry one and whether the bracketed member is ever printed. Not urgent: the
warning is honest about what happened, and the code is still shown to the user.

**Nothing compares the statement text a label prints against the text the table holds.** Extraction takes
codes only where the code itself is printed, and never derives one from wording, because deriving one is how a
label printing "Highly flammable liquid" — missing "and vapour" — gets laundered into a correct H225 and its
defect disappears. The consequence is that a label printing wording without codes yields no codes at all.
Nothing is falsely cleared by that, since no rule currently judges whether a statement is present. The sharper
version extracts the printed wording alongside the code and compares it against
`hazardStatementText(regime, code)`, which would catch the paraphrase the current design merely refuses to
launder. It needs a field `GhsLabelData` does not have, and a decision about whether a mismatch is a finding
or a warning — a finding would be the first rule in this project to judge text rather than geometry.

---

## From phase 7, stage 2

**The camera lifecycle exists twice.** `scanner/useBarcodeScanner.ts` and `audit/useLabelPhoto.ts` each carry
the generation guard, the wording that separates a declined permission from an absent camera API, and the
explicit track release — and every one of those parts exists because of something that went wrong in the
scanner. The audit composable copied them rather than sharing them, which is a debt taken knowingly: one
camera composable extracted from two is a refactor of shipped, tested code, and doing it as a passenger on a
feature is how an unrelated breakage gets attributed to the wrong commit.

The shapes are close but not identical — the scanner runs a decode loop and swaps engines, the audit path
takes one frame and stops — so the extraction is a `useCameraStream` holding start, stop, the guard and the
error wording, with each caller keeping what it does with the frames. Worth doing before a third caller
appears, and the two differ enough that it is not mechanical.

**`api/savedLabels.ts` and `api/audit.ts` have near-duplicate `request` helpers.** The guarded parse of an
error body — keep the server's sentence, fall back to a status-only message, never let a failed parse of an
error page replace the real failure — is the subtle part and it is now written twice. The BACKLOG's own rule
for the export helper was that a shared thing with one caller is a guess at what a second one wants; there
are two callers now, so that objection is gone. What remains is that merging them means editing a shipped and
tested module in the middle of a feature, which this project's habit says is done deliberately rather than
while passing through. They differ in two ways worth keeping: saved labels handle a 204, and each carries its
own error class.

---

## From phase 7, stage 3

**Whether `detach()` could lose work at `/labels/new` without an audit is unchecked.** The rebase it used to
do unconditionally was found on the audit hand-off — a document arrives dirty, the editor mounts, its route
watcher calls `detach()`, the baseline is rebased and both leave guards go quiet. That is reproduced and
fixed. The larger question is whether the same path was reachable before: edit at `/labels/new`, navigate to
`/labels`, come back, and the watcher fires again on mount.

**It is recorded as a question rather than a defect because the reproduction did not hold.** A probe that
mounted the editor, wrote to `store.data.gtin` and remounted reported the document as clean *before* the
remount — so its premise failed and it proved nothing in either direction. Either the edit did not dirty the
document in that harness, or something else rebased first. Worth ten minutes with the real application rather
than another jsdom probe; the fix is already in place either way, so nothing is at risk while it waits.

