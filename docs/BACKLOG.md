# Backlog

Things found and deliberately **not** done, with the reason. Mostly review findings that were real but
outside the stage that surfaced them.

This file exists because the alternative was worse. Reviews on this project have been scoped to the whole
branch, and each one found three to five genuine defects in already-committed territory; fixing all of them
immediately turned four planned items into three unplanned commits and left phase 5 stage 6 no further
forward. A finding worth keeping is not automatically a finding worth doing next.

---

## How to read this file, as of 2026-10-09

**This is a record of findings deliberately not acted on, not a to-do list.** Agreed with James on 2026-10-08:
working through it is not the goal. The few entries worth doing before deployment are pinned in the next
section and ordered in `docs/plans/2026-10-08-road-to-deployment.md`. Everything else stays here by decision,
with its reasoning, so nobody has to rediscover it.

**Entries that were done have been removed.** On 2026-10-09 every struck-through entry was taken out after
checking that its history is in `CHANGELOG.md`; git keeps the rest. Where a struck entry still carried an open
piece, that piece stayed, as an entry of its own. What remains is open.

The entries fall into four kinds:

**Must fix before this ships.** A rule that can clear a label on something never printed, or a finding citing a
provision that does not say what the finding claims. **None outstanding.** The last, `ghs/pictogram-set`
citing CLP Annex V on US OSHA labels, was closed on 2026-10-09 by standing it down on US labels.

**Requirements nothing checks, and the findings say so.** Real regulatory ground the engine does not cover,
where every pass it issues admits the gap in its own message. Schedulable, and safe to leave: the reference
amounts of §101.12(b), the aggregate and bilingual displays, (j)(13)(ii)(B)'s permitted abbreviations, an egg
carton's declared second column, a percentage stated for a nutrient with no Daily Value, the two spellings of
a bracketed GHS combination code, the printed text of a GHS statement, (j)(15)'s conditions on the outer
package, the US OSHA statement texts, and which pictograms a US classification requires.

**What this engine does not check, by decision.** Not work, and not going to become work without a change of
scope: the Nutrition Facts footnote, which no document can make wrong; 101.3(b) and (d); the single-typeface
assumption behind every type-size measurement; nutrition claims, whose condition reaches "labeling or
advertising" beyond any label; the allergen advisory's deliberate over-strictness; a hazard classification
derived from statement codes; the calorie-free footnote variant; and where the "% Daily Value*" heading sits on
a dual-column panel. All of them are in front of a user in `docs/WHAT-IS-NOT-CHECKED.md`, with the quiet-zone
fallback. They stay listed here because this is where the reasoning lives.

**Notes and chores.** The rest: decision records, reviewer claims since disproved and kept for the lesson, and
editor, API, scanner, security and test-hygiene work with no compliance meaning. One chore is worth doing before
anything else that reads a nutrition panel's columns: **a primitive does not say which column it belongs to**,
which cost four review rounds on one pull request.

---

## Worth doing before deployment

**All done, as of 2026-10-09.** The five pinned on 2026-10-08 were fixed in PRs #71 to #73: `ghs/pictogram-set`
citing the EU on US labels, the assortment order check, the hand-set type size, the "exempt" status beside a
printed panel, and statement codes kept through a change of market. Their history is in `CHANGELOG.md`.

The deployment checklist (unknown routes answered 200, pre-#65 seeded zeros, the first schema change needing a
migration, per-process quotas, edge-level limits) is in `docs/DESIGN.md` § Phase 8.

---

## From the MCP "without" experiment, 2026-10-09

Found because a model, asked about labels this engine passes, raised requirements the engine does not check.
Each was verified against the primary source on 2026-10-09; the experiment is
`docs/experiments/2026-10-09-mcp-without/`.

**The linear display prints Added Sugars as an item of its own.** The engine's run reads "…, Total Sugars 1g,
Includes 0g Added Sugars 0%, …". The regulation's own linear sample, at (j)(13)(ii)(A)(2), nests it after Total
Sugars: "Total Sugars 2g (Incl. 2g Added Sugars, 4% DV)". The text of (c)(6)(iii) asks for the preface and an
indent under Total Sugars, and a linear run cannot indent, so the sample is the only statement of what that
looks like in a line. It is an illustration, not text, so this is recorded rather than enforced.

**Nothing checks the wording of a nutrient row, by decision.** Every row is composed by
`printedNutrientLine` from the nutrient table, so no label document can make the wording wrong, and a rule no
document can fail has no known-bad fixture — the reasoning recorded above for the footnote. The "Includes"
defect lasted precisely because the composition itself was wrong; tests now pin it on all four displays.

**An EU label must identify a supplier established in the Union, and nothing checks it.** CLP Article 4(11),
read from consolidation 02008R1272-20260701: "A substance or a mixture shall not be placed on the market unless
a supplier established in the Union, which shall be identified on the label, …". Inserted by Regulation (EU)
2024/2865 and applicable from 1 July 2026. `GHS_CONFORMANT` carries a supplier in Leeds, so the EU control is a
label that has not been placeable since July. Whether an address is in the Union is not something a rule can
read from free text, so this is a disclosure for `docs/WHAT-IS-NOT-CHECKED.md` first, and perhaps a field later.
The CLP citations this engine carries were read against the 2025-09-01 consolidation; the six this experiment
leaned on were re-read against 2026-07-01 and are unchanged, and the rest have not been.

**A mixture's UFI is neither checked nor disclosed.** CLP Article 25(7): where a unique formula identifier is
created under Annex VIII, "it shall be included in the supplemental information on the label", in the form
Annex VIII Part A §5.2 sets ("UFI:"). It turns on whether the mixture falls under Annex VIII, which the document
does not say — another candidate for `docs/WHAT-IS-NOT-CHECKED.md`.

**Servings per container is not checked against the net quantity.** The base US food fixture declares 8
servings of 40 g in a 340 g package, which is 8.5. 101.9(b)(8)(i) rounds to the nearest whole number and does
not break a tie at .5 ("about" is a *should*), so this label is not shown to be wrong — but nothing would notice
one that was. No rule cross-checks the two figures.

---

## Rules that do not exist yet

**Nothing checks the Nutrition Facts footnote.** 21 CFR 101.9(d)(9) sets the footnote verbatim and
`NUTRITION_FOOTNOTE` carries all three permitted variants, but no rule compares what a panel prints against
them. Found while fixing the tabular display, which had been printing (j)(13)(i)'s abbreviated statement on
every tabular display including the ones not entitled to it — a defect that lasted precisely because no rule
looks here. Still no rule, by decision on `feat/childrens-footnote`: both drawing paths look the wording up by
display and by population, so no label document can make the footnote wrong, and a rule no document can fail has
no known-bad fixture — the reason 101.3(d)'s bold goes unchecked below. Tests pin the wording on both paths for
both populations instead. A rule becomes worth writing when the engine draws a footnote a label chooses, such as
the calorie-free permissions (d)(9) gives, which need claims modelled first.

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
and stock width/height/margin. Re-read on 2026-09-17: the container fields now go through `requiredNumber`,
which writes `NaN` rather than the empty string. Re-read on 2026-10-09: every rail has its own three stock fields
— `UpcAFormRail.vue` (`stock`), `UsFoodFormRail.vue` (`foodStock`) and `GhsFormRail.vue` (`ghsStock`) — and
all nine are still bound raw with `v-model.number`, so that half stands.

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

**Four export tests prove a statement reached the PDF by comparing file sizes.** The small-package line, the
assortment statement, the unit container statement and the second column's figures are each checked in
`apps/api/src/labels/routes.test.ts` by asserting the PDF with the text is longer than one without. `renderPdf`
compresses its content streams by default, so the size is the deflated size, and forty characters more text is
not bound to make it larger. None has failed, and none is known to be wrong today. The check is simply weaker
than it reads, and a change to font subsetting or stream compression could break it with nothing broken.
Reading the text back, from an uncompressed render, would test what the assertion means. Found by the review of
the (j)(15) change, which added the third instance. Re-counted on 2026-09-17: there are four, and the fourth
is older than the dual-column work it looks like it belongs to — the second column's figures have been checked
this way since `6681343`, which is where the assertion came in.

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

### Verified, no stage yet

**No form rule judges the columns an egg carton declares.** Found by `/code-review high` on PR #41, and verified.
`us-food/dual-column-form` returns as soon as no `food-nutrition-second-column` element is drawn, which is always
true of a carton claiming (j)(14): its information is presented beneath the lid and the outer carton draws no panel.
So a carton declaring two columns is judged on neither their headings, their separation, their equal prominence nor
their completeness — a second column declaring one figure of fourteen is reported on an ordinary label and not on a
carton. `us-food/protein-percent` asks the carton for its second column's protein percentage where that column
declares a protein amount, and deliberately says nothing where it declares none, on the ground that the form rule
reports the incomplete column; for a carton, nothing does. Judging a declared column that nothing drew is the
question (j)(14) keeps raising, and the answer wants a reading of which of (e)'s requirements are about the
information and which are about the panel.

**A primitive does not say which column it belongs to, so rules infer it from the cells drawn.** Four review
rounds on `feat/second-column-percentages` went to that inference, each on a case the last had not covered: a
panel whose mode went back to single, a nutrient left out of `order`, a row whose first column states no amount,
and a nutrient `order` lists twice. `us-food/nutrition-percent-dv` now asks for the second column's band, then
counts a row's right-aligned cells against what each column declares, which is correct but is arithmetic about
geometry rather than a fact the layout states. `TextPrimitive` carries `elementId` and `anchor` and nothing about
the column, and `us-food/protein-percent` does the same counting for its own reason. A `column` on the primitive,
or a second-column row element as `nutritionSecondColumn` is a band element, would let both rules read what was
drawn instead of deducing it. It is a change to the layout's contract, so it wants its own branch.

**A percentage stated for a nutrient with no Daily Value is printed and cannot be judged.** Found by the review of
`feat/second-column-percentages`, and true of both columns. `declaredPercentDv` and now `columns.secondPercentDv`
accept a figure for trans fat or total sugars, which 101.9(c)(9) and (c)(8)(iv) give no Daily Value, so the panel
prints "0g 99%" and `us-food/nutrition-percent-dv` skips it: there is nothing to recompute it against. (d)(7)(ii)
requires the percentage "for each nutrient" with a DRV or RDI and the (d)(12) display leaves those two cells blank,
so a figure there is a defect a rule could report from the document alone. The field pre-dates this branch on the
first column; the second column widened it. A rule would need its own code, citation and fixture.

**Nothing authorises a per-container column outside (b)(6)'s window, and no rule says so.** (b)(6), read from
the eCFR on 2026-09-17, permits a voluntary second column only for a package holding "more than 150 percent and
less than 200 percent of the applicable reference amount", sold individually — and even there the column it
permits is a *household measure* one, placed to the left. Above 200 percent the column is mandatory under
(b)(12)(i) instead. So a label declaring a per-container second column on a 120 percent package, or on a
multi-serving package, is carrying a column 101.9 does not provide for at all, and this engine draws it without
comment. Whether that is a finding is a real question rather than an obvious yes: (c) restricts which
*nutrients* may appear, not which columns, and reporting a label for a column the regulation is merely silent
about is the kind of false positive a user cannot argue with. It needs the modal verbs read across (b) and (e)
together before anything is written, and it would want its own code, citation and fixture.

**(e)(1)'s headings and (e)'s equal prominence may not reach a per-container column either.** Raised by the
review of the change that stopped reporting *ungoverned* columns, and left because it is a further reading
rather than a loose end of that one. The same logic points at it: (e)(1) says "there shall be two or more
column headings accurately describing the amount per serving size of **the form of the same food** ..., **the
combinations of food, the units, or the RDI groups** that are being declared" — the four kinds (e)'s opening
permits, and a per-container column is none of them. (e)'s "equal prominence shall be given to both sets of
values" sits in the same sentence as "such dual labeling", which refers to the same four.

So a column (b)(12)(i) compels is governed by (e)(6), which asks for two columns separated by vertical lines
and says nothing about headings or prominence. `FDA_DUAL_COLUMN_HEADINGS_MISSING` cites (e)(1) and
`FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE` cites (e), and both fire on such a column today.

Two reasons not to act on it in passing. It would narrow the rule set again, on the commonest mandatory panel
this tool draws, and that is a decision worth taking deliberately rather than as a third consequence of one
reading. And the counter-argument is real: (e)(6) says the columns are presented "as shown in the displays in
paragraph (e)(6)(i)", whose sample labels are headed — so the question is whether that phrase incorporates the
illustration's headings as a requirement, which is exactly the "guidance figure made a requirement" trap
`CLAUDE.md` records. Wants the displays read and the phrase weighed before anything changes.

**OSHA's pictogram tables are not modelled, so `ghs/pictogram-set` stands down on US labels.** Since
2026-10-09 the rule declines every `us-osha` label at this tool's limit, citing 29 CFR 1910.1200 Appendix C,
C.2, instead of judging it against CLP Annex V under Annex V's citation. C.2, read from the eCFR that day,
takes a classified chemical's pictograms from "C.4 for each hazard class and associated hazard category".
Judging US labels would need three things:
- **C.4's tables, transcribed and verified.** The eCFR publishes them as Federal Register images, not text, so
  they need reading as rendered pages.
- **A mapping from the CLP classes this tool offers to OSHA's.** It is not one to one: Appendix A.3.2.1 lets
  eye irritation Category 2 be classified 2A or 2B, and 1910.1200 has no aquatic hazard class at all.
- **A decision about the editor**, which offers CLP's whole classification list on a US label, aquatic hazards
  included, captioned with CLP's pictogram ("→ GHS09"). The engine no longer draws GHS09 for a US label,
  through `derivedPictograms`, but the list still shows it.

A stage of reading, or more. `docs/WHAT-IS-NOT-CHECKED.md` tells users, and the editor says it beside the
classification on a US label.

**Whether printing GHS09 on a US label should be a violation is open.** `ghs/pictogram-integrity` reports it as
`GHS_PICTOGRAM_NOT_RECOGNISED`, a violation under 29 CFR 1910.1200 Appendix C.2.3.2: "One of eight standard
hazard symbols shall be used in each pictogram", and the environment symbol is not one of the eight. But OSHA's
own pictogram QuickCard (OSHA 3491), read on 2026-10-09, lists "Environment (non-mandatory)", and C.3.1 admits
supplementary information that "does not contradict or cast doubt on the validity of the standardized hazard
information". The regulation's text and the regulator's guidance point different ways, which is exactly the
case `CLAUDE.md` says to write down rather than settle by assumption. Raised by `/code-review high` on PR #71.
Settling it wants OSHA's preamble to the 2012 or 2024 rule, or a letter of interpretation, read for whether a
ninth pictogram is permitted supplementary information. Until then the violation stands, as it has since
phase 4.

**`gs1/quiet-zone` stands down on four symbologies and says nothing, deliberately.** It declines where no
figure has been confirmed against a source document — CODE128, CODE39, MSI and PHARMACODE — and unlike the
three rules that now declare a decline, it does not, because a user cannot act on it: there is no field to
fill in, and the honest answer is that this project has not read those specifications. It is recorded in
`docs/WHAT-IS-NOT-CHECKED.md` instead. Worth revisiting only if the engine ever draws a symbology outside
UPC-A, since today no label can carry one — at which point a decline that says "this tool cannot check your
symbology" becomes something a user needs on the label rather than in a document.

**The rail's number inputs mark themselves `min="0"` and mean `positive()`.** `min` is advisory on a typed
value, so a browser accepts a zero or a negative in any of them and the document takes it. The four
dual-column fields now refuse one outright, because a non-figure there made a duty read as *answered* rather
than unasked; the rest do not, and `availableSurfaceSqInches` is the oldest of them. Nothing is known to be
wrong today — `NutritionFactsSchema` refuses a non-positive figure on save or export, so such a document
cannot be persisted, and the geometry fields are guarded by `requiredNumber` writing `NaN`. What remains is
that a user can type one, see the preview change, and learn only on save. Worth one pass over the rail's
numeric inputs with a shared guard rather than four more copies of the same three lines.

**`optionalNumber` accepts 0 and negatives, and `min="0"` means `positive()`.** It admits them into
`servingsPerContainer`, `availableSurfaceSqInches` and `continuousVerticalSpaceInches`;
eight `min="0"` attributes mean `positive()`; and nine bindings across the three rails write `''` into a field
typed `number`. None of them refuses anything, so a user types a zero, sees the preview change, and learns on
save. Interface stage 4 settled the refusal policy for the three measurement fields (the box keeps the figure,
the field takes `aria-invalid`, a sentence says what to state instead); closing these is a change to what the
guards accept, and a much larger diff. The hand-set type size had the same defect, and since 2026-10-09 it
uses the measurements' refusal.

**(b)(11)'s promoted-use second column is unmodelled.** 21 CFR 101.9(b)(11), read from the eCFR on 2026-09-17:
a product "promoted on the label, labeling, or advertising for a use that differs in quantity by twofold or
greater from the use upon which the reference amount in § 101.12(b) was based" — the example is liquid cream
substitutes promoted for use with breakfast cereals — means the manufacturer "**shall** provide a second column
of nutrition information based on the amount customarily consumed in the promoted use". That is a third
mandatory route to a second column, beside (b)(12)(i) and (b)(2)(i)(D), and `dualColumnDuty` knows nothing of
it. Two reasons it is not simply an addition. Its trigger is a *promotion*, which reaches "labeling or
advertising" beyond the label, so it shares the unmodelled-claims problem that already blocks most of (j)'s
exemptions. And its exemption list is its own — "nondiscrete bulk products ... used primarily as ingredients
... or traditionally used for multipurposes ... and multipurpose baking mixes" — which is a different set from
(b)(12)(i)(A) to (C), so it cannot borrow the shared one. There is also no `DualColumnBasis` value for it.

### Open from verifying the reported entries (2026-10-08)

- **Bold text is measured with Regular metrics.** **Verified, and narrower than reported.** The
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

  **"Changes no verdict" stopped being true once a bounds check read widths.** `layOutGhsLabel` now records a
  line that runs past the right edge, and a bold signal word measured in Regular widths could print up to
  that 3–5% past it unrecorded — and still clear `GHS_SIGNAL_WORD_SINGLE`. The check resolves the SemiBold face
  for bold text the way `embeddedFontFor` does, so the omission is right; the wrap it follows still uses
  Regular widths, which is this entry. `usFoodEngine`'s right-edge check measures the bold statement of
  identity the same way, and the resolution is one function, `measuredFamilyFor`, rather than a copy in each
  engine.

  **It reaches the linear display's word flow too.** Found by the review of PR #64's follow-up: the linear
  display places each word at the advance of the one before, measured in Regular, while its bold words print
  SemiBold — so a bold word can overprint the start of the word after it on any line. The panel-border check
  now measures ink in the printing face and reports the cases that cross the border; the overlap inside a line
  is this entry's, and closes with it.

**The editor re-derives which ingredient row a declined check is waiting on.** Raised by `/code-review high` on
PR #72. `firstUnweighed` and `firstUnnamed` in `UsFoodFormRail.vue` repeat the rules' own split between the
ordered run and the entries behind the quantifying statement, and the rule ids that own each range, to decide
which box a link from "checks that did not run" lands on. The second link defect PR #72 fixed, a percentages link
sent where no check asked for one, came from exactly that copy. A `Decline` that named the rows it wants —
`wants: [{ fact, index }]` or similar — would let the editor read the answer instead of recomputing it. Not done
there because it changes `Decline`'s shape for every rule that declines, for its own pull request. The editor
now filters on what each check asked for, and `declinedFacts.test.ts` lands each link on the box its check named.

**Three more from the `/code-review high` on PR #65, recorded rather than fixed:**

- **Labels saved before #65 still carry the zeros the old rail wrote.** A row added and named but
  never weighed was seeded at 0, and the order rule reads those as stated: oats 90 then two seeded rows passes
  as "3 ingredients run in descending order". Nothing has been deployed — phase 8 is deployment — so no saved
  label a user holds carries them; only development databases do. Worth a sentence in the deployment
  checklist, not a migration.
- **Five pieces of rail state each re-implement "only while `documentGeneration` matches" by hand** — the
  held override, the refused percentages, the set-aside second column, and since 2026-10-09 the refused type
  size and the GHS statement codes set aside on a change of market — and each has to be cleared by hand on
  every in-document reset. Held in a component, each is also lost when a change of label type unmounts its
  rail; the GHS note now says so rather than promising the codes return. A `heldForDocument` helper, or a store-side scratch map cleared when the
  generation moves, would put the rule in one place.
- **The percentage refusal is a second refusal mechanism** beside `refusableNumber`, `REFUSED_MEASUREMENT` and
  `sayRefusal`, retiring on a different signal. A per-row `refusableNumber` would share one path. Not done
  here because `refusableNumber` holds one figure per field and the rows are a list.

Two more found while verifying the reported entries, recorded rather than fixed:

- **A finding's element is both where to look and what withholds it.** `FDA_INGREDIENTS_EXEMPT` names
  `food-ingredients`, which an exempt label never draws, so selecting the pass outlines nothing. The id is not
  a mistake: it is the key `withholdUncertifiablePasses` reads, so the exemption falls if the statement's
  element is ever omitted, and `certification.test.ts` holds that on purpose. One field doing two jobs is the
  defect — a separate `withheldWith` beside `elementId`, or the rail declining to offer a selection for an
  element the layout lacks, would each close it. `elementIds.test.ts` excuses this code by name and checks the
  excuse still applies.
- **The withholding returns early when a layout records no omissions.** `withholdUncertifiablePasses` checks
  `layout.omissions.length === 0` first, so an artwork pass naming an element that was never drawn — rather than
  drawn and omitted — survives on a layout with no omissions at all. Not reachable in the sweep today: the
  (j)(14) carton, whose passes name an undrawn panel, records an omission and is withheld. It would be reached
  by the next element drawn conditionally without an omission recorded for its absence.

---

## The rule catalogue's severities

**Two guidance codes are declared from reading, not from observation.** `GHS_PICTOGRAM_PRECEDENCE_OPTIONAL`
and `GHS_SMALL_CONTAINER_AVAILABLE` are reached by no fixture and no sweep document, so `severities.test.ts`
lists them as unreached alongside the three pass codes in "Three pass codes are reached by no fixture",
under the phase 7 review. Each is emitted only as `'guidance'`, which is
what it declares: `GHS_SMALL_CONTAINER_AVAILABLE` as a literal, and `GHS_PICTOGRAM_PRECEDENCE_OPTIONAL` from
a ternary whose condition also chooses the code, so its other branch is a different code. A sweep document for each would move them from read to observed.
Neither has a fixture, because the coverage checks treat them as non-failures — see the next entry.

**The fixture-coverage checks still guess what a failure is from a code's name.** `ghsRules.test.ts`,
`usFoodRules.test.ts` and `rules.test.ts` decide which codes need a known-bad fixture with a suffix pattern
— `_MET`, `_COMPLETE`, `_OPTIONAL`, `_AVAILABLE` and so on. Now that every code declares its severities,
that question has a real answer: a code needs a fixture if it declares anything but `pass` (and, by the
current convention, `guidance`). A failure code that happened to end in `_COMPLETE` would be excused from
fixtures today without anyone deciding so. Not changed with the declarations, because it alters which codes
the suite demands fixtures for, and that wants its own look at whether `guidance` should be exempt at all.

**The type system could check every severity, and does not.** Raised by `/code-review high` on PR #63.
`DeclaredCodes` is a `Record<string, …>` and `finding()` takes any code and severity, so a declaration is held
to the rule only on the branches the sweep reaches — which is how `GHS_LABEL_BELOW_MINIMUM_SIZE` came to be
declared `violation` alone. Making `Rule` generic over its codes map would let `finding(rule, { code, severity
})` compile only for a declared pair, and would check a computed severity such as `isUs ? 'blocking' :
'violation'` on both branches without a list of unreached codes. Not done here: every rule is an object typed
by annotation that refers to itself inside `check`, so each would need `satisfies` and a literal codes map,
and self-reference under inference is where that tends to fall over. It is a change to all 35 rules for its
own pull request.

**A severity's mark is built by hand in four templates.** `FindingItem.vue`, `FindingsRail.vue`,
`DesignView.vue` and now `RulesView.vue` each set the icon `aria-hidden` beside the word in the severity's
colour. A `SeverityMark` component would make a change to that treatment one edit rather than four. Noted by
the same review.

---

## From the stage 1 migration

**No field in any rail is marked required, and the migration is not the place to change that.** There is no
`required`, no `aria-required`, no asterisk convention and no "(required)" text anywhere across the 105
label sites in the three rails — confirmed by grep, not by reading. A user finds out what was mandatory from
the findings rail, after the fact.

Adding it during the migration to `FormField` would be cheap and is the wrong move. Migrating three rails is
a structural change that must be behaviour-preserving, because the only way to know the component layer is
correct is that nothing about the rendered form changed; a product change smuggled into a refactor makes
every diff ambiguous — did this field move because the component works, or because somebody decided it was
required? It is also genuinely a product question rather than a component one, and the answer is not
uniformly yes: `CLAUDE.md` is emphatic that reporting a label for exercising a permission is a false positive
its user cannot argue with, and several of these fields are exactly that shape — a declared exemption, a
voluntary second column, a reference amount the tool does not carry the table for.

`FormField` can take a `required` flag whenever the answer arrives; nothing in its shape forecloses it. What
this entry records is that the decision was deliberately not taken inside the migration.

## From stage 4, canvas and editor

**A Save answered after a quick trip away from its label and straight back is set aside.** `supersede`
moves the generation when an open starts, and returning to the label already held — no second read — does
not move it back, so a `PUT` on `/labels/abc` that answers after `/labels/def` and back is treated as stale.
If it succeeded, the label reads "Unsaved changes" though the server holds that content; if it failed, the
error is not shown. Conservative in the direction that loses nothing — the leave guards still defend every
edit, and a second Save writes the same content again — which is why it is recorded rather than fixed with
a generation that can be restored. Found by the review of the change that introduced `supersede`.

**Two late Save answers still go astray, both without overwriting anything.** A new label's first Save,
answered after a switch of label type and back, creates its record and leaves the editor attached to nothing,
so a second Save creates an identical second record: the generation moved on the switch, though the document
on screen is the same one again. Comparing the answer's label type with the type on screen would attach it
in that order and still not in the other, which is why the mechanism was not reworked for it. And a Save that
fails after the user has left the editor sets its error on an editor no longer on screen, so it is never
seen — which was true before this change as well; the leave guards asked first, because the edits were
still unsaved. Both found by review of the overwrite fixes.

**"Needs 2.97 mm" wraps onto a line of its own, away from the clear-space figures it qualifies.** An audit
finding (`docs/ui-audit-2026-09-18/close-figcaption.png`) that was never written down here, and still true:
at the canvas's width in the editor the figcaption's `<dl>` wraps after "Clear space", so the requirement
sits under the zoom row's neighbours rather than beside the measurement it is the minimum for. Not fixed
with the two above because the obvious repair — wrapping the two pairs so they wrap together — is not
valid inside a `<dl>`, which allows a `div` around one name and its value but not around two. It wants a
decision about the markup: one pair whose value states both figures, or a different element.

## From the interface stage 0 review

**The canvas's `fit` does not render at 106% of true scale, and the review that said so was reading rather
than running.** Raised by `/code-review medium` on the stage 0 diff: `fit` clamps the frame at
`widthMm * 4` px while a CSS millimetre is 3.7795 px, so making `fit` the default must mean every desktop
preview opening 5.8% over true scale and `preview == print` quietly broken. The arithmetic is right and the
conclusion does not follow. `widthMm * 4` is always *greater* than the SVG's own intrinsic width of
`widthMm * 3.7795`, for every label at every size, so the clamp sits above the content and never binds; what
shrinks the label on a narrow pane is `width: 100%`, not the ceiling. Measured in a browser at 1440, a
120 mm label draws **453.55 px against a true 453.54**. Mutating the ceiling to `widthMm * 3` px makes it
bind and the new assertion fails at 360.00 — so the test has teeth and the original code has no defect.

Nothing to do, and the entry is here because the shape recurs: this is the same error as the "`'' * 240` is
`0`" entry above, which reasoned correctly about a predicate and wrongly about whether the input ever
arrives. Kept rather than struck because the next reader of that line will do the same arithmetic.
`e2e/the-canvas-fits.spec.ts` now pins the measurement, and the comment beside the ceiling says why it is
inert.

**Two review findings from the same pass were taken and cannot be mutation-tested, which is worth saying
out loud.** Neither changes behaviour today, so neither has a test that dies without it:

- `theme.test.ts`'s colour-token guard derives its family list from the `--color-*` declarations instead of
  carrying a hand-written copy. Today the two lists are identical, so nothing observable changes; the value
  is that declaring a new family in `main.css` extends the guard by itself rather than silently not.
- `e2e/the-masthead.spec.ts` measures `document.documentElement.clientWidth` rather than the requested
  viewport width. Headless they are the same number, which is why no run can tell them apart; a visible
  scrollbar takes real layout width, so the old form would have failed for anyone running it `--headed`.

**Not taken, and left for the stage that owns it.** The `Error` assertion in `LabelsView.test.ts` reads
`toContain('Error')` against a fixture message of `Internal server error`, so it depends on that fixture not
itself containing the capitalised word. It is load-bearing today — mutation-tested both ways — but it is
pinned by the fixture rather than by the markup. The error has its own element now, `[data-labels-error]`,
from the saved-labels stage, but the assertion still reads its whole text; asserting the `<span>` that
carries the word would pin the markup instead.

## Serving the client

**An address with no page is answered 200.** The client has a 404 route now, inside the shell, but the server
cannot know which paths the client routes: `app.ts` hands `index.html` to any GET that is not reserved and has
no dot, so `/labels/abc/edit` arrives with status 200 and the client says "There is no page here". A crawler
or a link checker reads a page. The fix is the server knowing the client's route table — a second copy of it,
or one exported from the web app and read at build time — which is a deployment question for phase 8 rather
than a shell one. Noted when the 404 route was added.

---

## From the pre-stage-2 security pass

The pass itself came back clean on the thing it was run for: no secret has ever been committed, the browser
bundle carries none, and stage 1's static handler cannot be walked out of. Two findings were fixed at the
time — the wildcard CORS header and the two production advisories, both in `CHANGELOG.md`. These are the rest.

**Edge-level limits are phase 8's.** Every limit on this server is middleware in this process: the audit route
has twenty calls per client per hour, two hundred per process per day and an optional `AUDIT_API_KEY`; the export
routes have sixty renders per client per hour; the 10 MB body limit is on `/api/audit` alone and everything else
is held to 256 KB. A per-route daily cap on the one route that spends a key is something only this process can
enforce, but refusing traffic cheaply belongs at the edge — an ALB rule or a WAF — and that is deployment work.
The routes are unauthenticated, which is also the edge's job.

**The audit route's guards run after its body has been parsed.** `/api/audit`'s `express.json({ limit: '10mb'
})` is mounted ahead of its router, so a request the quotas or the key refuse has already been buffered and
parsed in full: ten megabytes of JSON can be read before a 401. The guards bound what the route can *spend*,
which was their job, and nothing about what it costs to refuse. Narrower than when it was raised: the 10 MB
limit is now on this route alone, and every other route is held to 256 KB. A limiter mounted ahead of the body
parser would close it, at the cost of splitting the route's protections across two files.

**The audit route's quotas are per process, so two containers are two allowances.** `express-rate-limit`'s
default store is in memory, which is the right call for one container and the wrong one for a service scaled
horizontally: the daily cap is what stops a deployment spending its key, and four tasks would spend four times
the figure that was set. Nothing is wrong today — this runs as a single container, which is what bundling
`label-core` through tsup is for — and a shared store is a dependency and a Redis to run, which is not worth
adding before there is a second task. Worth remembering as part of any move to more than one, alongside the
edge-level limits in "Edge-level limits are phase 8's".

**Three dev-only advisories remain.** `vitest` and `@vitest/mocker` (a path traversal in the mocker's redirect
handling) and `esbuild` (arbitrary file read via the dev server, on Windows). None ships: `esbuild` is only
reachable from production dependencies via `vue-router` → `vite`, which no runtime path touches. `npm audit
fix` will not resolve them without a major bump of the test runner, and taking a vitest major inside a
security change is how an unrelated breakage gets attributed to the wrong commit. Worth doing deliberately,
on its own, when there is a reason to touch the tooling.

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

### What reviewing the mechanism turned up

Each reproduced before being written here. None is fixed by choosing `artwork` or `document`, which is why
they are separate entries rather than part of the reading.

**Three pass codes are reached by no fixture, all for one reason.** The sweep in `fixtures/sweep.ts` reaches 35 of 40, re-counted on
2026-09-17; the figures below were 34 of 39 when this was written, and the rule set has grown since. Both
figures are counted by hand, and that is itself a small gap: nothing asserts either one. The nearest check,
`certification.test.ts`, counts *rules* that cleared at least once, not pass codes, so the sweep could lose a
code without a test noticing.
`GHS_PICTOGRAM_COMPLETE` is unreachable by any document and correctly so: `glyphDrawn` is only ever `false`,
because the Annex V specimen artwork was never verified, and the rule continues past the pass whenever it is.
The other four are reachable and not in the sweep — `GHS_SMALL_CONTAINER_COMPLETE`, `FDA_DUAL_COLUMN_MET`,
`FDA_DUAL_COLUMN_FORM_MET` and `FDA_NET_QUANTITY_METRIC_NOT_REQUIRED`. `GHS_PICTOGRAM_SET_MATCHES` and
`GHS_SMALL_CONTAINER_COMPLETE` have since joined `GHS_PICTOGRAM_COMPLETE` as unreachable, for the same reason
and as correctly: each certifies a pictogram, and no glyph is drawn. The small-container pass was listed here
as reachable for a commit after that stopped being true. It matters less than it did, because
the guarantee that every pass states what it certifies is now the compiler's, not the sweep's. It still
matters for every reading that flips one of them, since a flip ships with a fixture that reaches it.
`FDA_NET_QUANTITY_METRIC_NOT_REQUIRED` has since been flipped, and `FDA_DUAL_COLUMN_MET` and
`FDA_DUAL_COLUMN_FORM_MET` pinned to the artwork. All three are reached by `certification.test.ts`, not by the
sweep. Re-read on 2026-09-17: `FDA_DUAL_COLUMN_FORM_MET` is now reached by the known-bad fixtures and
`FDA_PROTEIN_PERCENT_MET` by the sweep's toddler document, so the five unreached were
`GHS_PICTOGRAM_COMPLETE`, `GHS_PICTOGRAM_SET_MATCHES`, `GHS_SMALL_CONTAINER_COMPLETE`, `FDA_DUAL_COLUMN_MET`
and `FDA_NET_QUANTITY_METRIC_NOT_REQUIRED`. **`FDA_DUAL_COLUMN_MET` is now reached**, as a side effect of the
(e)(6) fix rather than as work: the three dual-column fixtures had to state the facts that make their column
mandatory before they could expect an (e)(6) citation, and a stated duty with a drawn column is what that pass
certifies. It is worth noticing that it is a pass now issued on three known-bad documents, and correctly — the
mandate rule asks whether a column is present, the form rules report that it is incomplete, and the two answers
do not contradict. Four remain.

**`FDA_NET_QUANTITY_METRIC_NOT_REQUIRED` is now reached by the sweep**, from a random-package document in
`PERMISSION_PATHS`. `/code-review high` on PR #63 noticed that `certification.test.ts` already reached it
from a document of its own, so the sweep — which the citation, certification and severity checks all read —
never saw it. Three remain, all unreachable for the `glyphDrawn` reason above: `GHS_PICTOGRAM_COMPLETE`,
`GHS_PICTOGRAM_SET_MATCHES` and `GHS_SMALL_CONTAINER_COMPLETE`.

**The sweep's documents duplicate ones the rule tests already build — reported by review, not yet
verified.** A reuse pass over the `certifies` mechanism reported that the permission documents in
`fixtures/sweep.ts` repeat documents `usFoodRules.test.ts` builds and asserts exactly; that the second-column
exemption document now exists in three places; that `passedOnArtwork` and `passedOnDocument` have identical
bodies; that `FindingInput` restates `Finding`'s severity split; and that the sweep's three loops re-derive
the dispatch `listRules(labelType)` provides. Its suggested direction is to export each exemption document
from `fixtures/usFood.ts`, built from the known-bad fixture it excuses, so an exemption document is always
the violating label plus its exemption and the two cannot drift. Not done in the mechanism commit, which had
already grown by fixing a review's findings in place. One item from that pass was fixed there: only the
US-food loop labelled where its findings came from, so a GHS permission document added later would have
counted as fixture coverage and escaped the check that every such document reaches something.

### What reading the US food provisions turned up

**(j)(15)'s two conditions on the outer package are not checked.** The unit container's statement is drawn
from `fda/unitContainerStatement.ts` and measured, and the exemption names it so that one which did not print
withholds the pass. What (j)(15) asks of the multiunit package itself — that it carries the nutrition
information, and that the units are "securely enclosed within and not intended to be separated from the retail
package" — is outside the label this engine draws, and the pass says so.

**An egg carton's second column is required, but not checked for completeness.** Found by `/code-review high`
on PR #36 and reproduced on `feat/egg-carton-and-unit-container`. A package in (b)(12)(i)'s band declaring a
second column with a figure for total fat alone gets `FDA_DUAL_COLUMN_MET` and `FDA_DUAL_COLUMN_INCOMPLETE` on
the ordinary label. Claiming (j)(14), the same declaration gets no dual-column finding at all. The mandate rule
reads the declared figures for a carton, since no panel is drawn, and is satisfied by any second-column figure.
The completeness check lives in `us-food/dual-column-form`, which reads the drawn column, and nothing is
drawn. No false pass is issued, and the carton's exemption pass lists the column's completeness among what it
does not check. Checking it from the declared figures is possible, but (e)(1)'s form rules are written about a
drawn panel, and deciding which of them hold of information presented beneath a lid wants a reading of its
own rather than a patch.

**No rule models nutrition claims, so the condition most 101.9(j) exemptions share goes unchecked.** (j)(1),
(2)(i)–(iii), (3), (4), (10), (13)(i) and (18) each hold only while the food "bears no nutrition claims or other
nutrition information in any context on the label or in labeling or advertising" (read from the eCFR on
2026-09-16). This project has no representation of a claim — 21 CFR 101.13 and 101.14 are unmodelled — so every
one of those passes says the condition is not checked, and none can be withdrawn when a claim appears. The
same gap already keeps (c)(2)(i), (c)(3) and (c)(6)'s "if no claims are made" relaxations unapplied. Modelling
claims, even as a declared list the label prints, is a piece of work of its own; "or in labeling or
advertising" reaches beyond the label and could never be checked here at all.

**`FDA_ALLERGEN_DECLARATION_UNCONFIRMED` fires on a declaration that printed whole.** Recorded from the `high`
review of PR #31, and reproduced. The allergen rule asks `wasFullyDrawn` of each declaring element, which counts
every omission, positional or not. Cases where the source prints raise the advisory anyway. On
`US_FOOD_CONFORMANT` with the almonds renamed `nut paste`, not declared inline, and `containsStatement:
['tree-nuts', 'milk']` on the full 240 mm stock, "Contains: almonds." prints on a baseline at 162.77 mm, and the
only omission is the engine's `detail` for the milk entry no ingredient carries. The editor reaches this
routinely: `UsFoodFormRail.vue` keeps a Contains tick after its ingredient's allergen is cleared, on purpose.
The other case is 163.15 mm with no firm, where the line prints and only its line box overhangs. A third arrived
on `fix/contains-unnamed-allergen`, found by its review and pinned by a test: the engine now records an omission
for each ingredient the Contains statement cannot name, so a praline with no nut type beside a marzipan typed as
almonds prints "Contains: almonds." whole and still raises the advisory for the marzipan. None is a
false clearance, and since that PR the message claims only that an omission is recorded. It is still an advisory about a declaration that is fine,
though in the third case the label also carries the praline's real violation.
The review suggested the rule read line by line — keep only the Contains and list lines that landed on the
stock and search those — which would need no engine change. It is not a small fix, for two reasons. First, a
baseline on the stock does not put the glyphs there: descenders hang below it, and `FaceMetrics` in
`text/metrics.ts` carries cap height, lowercase-o height and advance widths but no descender, so the metric
would have to be read from the font file and verified first. A line's right edge would have to be measured too,
in the face it prints in. Second, it loosens the condition the pass is withheld on, from "no omission against
the element" to the rule's own measurement. That is the direction in which every false clearance here has
shipped, so it wants its own branch and its own review. The alternative is omissions that say what was lost —
lines, or entries — which is a change to the engine's contract.

### What reading the GS1 provisions turned up

**The resolver-domain check shares a code and a citation with every other Digital Link rejection.** It rests
on GS1 Digital Link URI Syntax 1.7.0 §4.11's `scheme = "http" / "https" / "HTTP" / "HTTPS"` production
specifically, not on §4 generally, but it is reported as `GS1_DIGITAL_LINK_INVALID` with §4's citation like
every rejection `buildDigitalLinkUri` makes. Splitting it wants a fixture for a bad domain separate from the one
for a bad AI value, and is worth doing when one is written.

**`sourceRegion` is millimetres on a stock, and a vision region is pixels on a photograph.** `BoundingBox`
names all four members `xMm`, `yMm`, `widthMm`, `heightMm`, and the same type is what `ResolvedElement.box`
uses. Filling it from a model would either put pixels in fields named for millimetres — the first breach of
the units-in-the-field-name convention this project has — or need a scale nobody has measured. It is not
requested at all in stage 1. Highlighting the part of a photograph a value came from would be genuinely good
on the confirm screen, and the vision documentation calls its localisation approximate, so it needs a
deliberate decision about what an approximate region may be used for before it needs a type.

**The US OSHA statement tables are empty.** `US_OSHA_HAZARD_STATEMENTS` and `US_OSHA_PRECAUTIONARY_STATEMENTS`
hold nothing, so a `us-osha` label can name no statement code this build can spell, and every lookup under that
regime refuses rather than guesses. Transcribing 29 CFR 1910.1200 Appendix C.4 is wanted, as a reference table
with its own provenance — read and verified, never generated. `GhsRequest` already asks the table rather than an
enum, so it needs no change when the table fills.

**A label already stored with EU codes on a `us-osha` regime can no longer be opened.** `GET /labels/:id`
re-validates the stored document against `LabelDocumentInput` and answers 500 when it does not match —
deliberately, and it names the id so the record can be found. Tightening the schema is what makes an existing
record fail it, and `PUT` validates the same shape, so nothing in the application can repair one.

The practical risk is nil today: nothing is deployed, `main` is 89 commits behind `dev`, and there is no
database that outlives a developer's laptop. It is recorded because it is the shape of problem that stops
being free the moment phase 8 happens — the first schema tightening after deployment needs a migration, or a
read path that repairs rather than refuses, and this is the first change that would have needed one.

**Whether an unrecognised statement code should be a 400 at all is still open.** The schema refuses one; the
layout engine, handed the same code, records an omission saying it drew nothing for it and carries on
(`ghsEngine.ts` — the block at 249-264 when this was written, 346-361 today). Those are two different answers
to one question, and only the schema's is visible to a user — as a rejected label rather than as a label that
says what is missing from it. The audit path already chose the third position: show the code, refuse to confirm
it, save the rest.

Rejecting is kept for now because it is what the audit endpoint's own warnings promise, and because a silently
accepted code produces a label that looks complete and is not. But the alternative is defensible and arguably
better: admit the code, let the omission report it, and let a rule judge it. That decision wants making
deliberately, and it belongs with whoever transcribes Appendix C.4 — because until then the question only ever
arises for codes this build cannot spell.

**Nothing derives a hazard classification from the statement codes.** `GhsLabelData.hazards` carries
`ANNEX_V_ENTRIES` ids, and CLP Article 26 precedence turns on them — `ghs/pictogram-set` and
`ghs/pictogram-precedence` both decline without them. A label prints H-codes and pictograms, not class ids, so
an audit either asks the user to classify by hand or leaves the two most interesting GHS rules unable to run.
A deterministic H-code to hazard-class mapping would close that, and it is a reference table with its own
provenance requirements rather than a function — Annex VI, read and verified, not inferred. Emphatically not a
job for the model: a classification it guessed would make the precedence rule judge the guess.

**A label printing P378 in its combination its own way is warned as unrecognised.** Small. A label that *did* use P378 and printed
the combination as `P370 + P380 + P375 + P378`, or as `[P378]` without the plus, resolves to nothing and is
warned as unrecognised — verified. Both are a label spelling a real code in a way the regulation does not.
Aliasing those two spellings onto the bracketed key is safe in a way the reverse is not, because both say
P378 was used. Still not urgent: the warning is honest, the code is shown to the user, and the canonicaliser
now collapses every *whitespace* variant of the bracketed form onto the key, which is the common case.

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

**`api/savedLabels.ts` and `api/audit.ts` have near-duplicate request handling.** Re-read on 2026-09-17: only
`savedLabels.ts` has a named `request` helper; `audit.ts` carries the same guarded parse inline in
`readGhsLabel`, which is the same duplication one step less visible — and `audit.ts`'s own docblock still says
"The two `request` helpers are now near-duplicates", describing a helper it no longer has. The guarded parse
of an error body — keep the server's sentence, fall back to a status-only message, never let a failed parse of
an error page replace the real failure — is the subtle part and it is now written twice. The BACKLOG's own
rule for the export helper was that a shared thing with one caller is a guess at what a second one wants;
there are two callers now, so that objection is gone. What remains is that merging them means editing a
shipped and tested module in the middle of a feature, which this project's habit says is done deliberately
rather than while passing through. They differ in two ways worth keeping: saved labels handle a 204, and each
carries its own error class.

---

## From phase 7, stage 3

**Switching type away from an untouched saved label and straight back reports unsaved changes.** Two clicks,
nothing typed, and both leave guards fire over a document identical to the stored one. The first switch
rebases the baseline onto the new type and detaches; the second is skipped, because the type watcher's rebase
is restricted to attached documents — so the baseline stays stranded on the type nobody is looking at.
Confirmed: `open=false away=false back=true`.

**The obvious fix is a trap, and this entry exists mostly to say so.** Dropping the `savedId` restriction — on
the reasoning that whether a document is attached says nothing about whether it has anything to lose — closes
this and opens a false clearance on the audit hand-off. `loadUnsaved` leaves the baseline describing a
*different* type on purpose, and that mismatch is the entirety of what keeps an audited label dirty; a
widened rebase reads it as “nothing to lose” on the way back and writes the confirmed audit data in.
Measured: `handover=true away=false back=false`, guards silent, on the path phase 7 was built to protect. It
was written, reviewed, caught and reverted inside this change.

What it needs is for “never written” to be representable rather than inferred from a snapshot comparison — a
flag `loadUnsaved` sets and `markSaved` clears, which `isDirty` honours whatever the baseline happens to
describe. That is a change to what the store *means* by dirty, so it belongs with the two entries below it
rather than bolted onto a rebase condition. `savedLabelAttachment.test.ts` pins the hand-off round trip in
the meantime, so the trap cannot be walked into twice quietly.

**Arriving at `/labels/new` from an untouched saved label reports unsaved changes.** `EditorView`'s route
watcher clears `savedName` a line after detaching, and `name` is part of the snapshot — so the document
differs from its baseline by a name nobody typed, and the leave guards fire over a copy of a label that is
already stored. Pre-existing, unchanged by the `detach()` fix, and a false positive rather than a loss.

Not fixed here for two reasons. It is in the view rather than the store, and the store is where the
“rebase only when there is nothing to lose” rule now lives — so the honest fix is for the store to own this
transition too (something like a `detachForNewDocument()` that clears the name and answers the same question
once), rather than for the view to re-derive it. And it rests on a design question worth asking deliberately:
whether leaving a saved label for `/labels/new` should hand over a clean copy — “start from this one”, which
is what the watcher's own comment says it is for — or a draft the guards defend. The answer decides the fix,
and it is not obvious.

`EditorSaveView.test.ts`'s new case restores `savedName` before asserting for exactly this reason: anything
else passes on the name's own dirtiness and never touches the edit underneath it.

**A detached document shows no “Unsaved changes”, however dirty it is.** `EditorView.vue`'s indicator is
behind `v-if="store.savedId !== null"`, so the moment a document detaches — a type switch, a route back to
`/labels/new`, an audit hand-off — the only visible dirtiness signal disappears and the leave prompt becomes
the first a user hears of it. Pre-existing, and deliberate as far as it goes: the span's two words are
“Saved” and “Unsaved changes”, and “Saved” would be a lie about a document that has never been written.

The fix is small — show it when `savedId !== null || isDirty`, keeping the same text — but it flips two
assertions written on purpose (`EditorSaveView.test.ts:131` and `e2e/the-label-audit.spec.ts:139`, the latter
asserting the audit hand-off shows none). It also decides the same design question as the entry above: if
arriving at `/labels/new` from an untouched saved label stops being dirty, this indicator stops appearing
there too. The two want settling together, and settling them means deciding what `/labels/new` *is* — a clean
copy to start from, or a draft worth defending.

**Neither leave guard has a test that asserts a prompt was raised.** The store tests cannot: they never mount,
and `isDirty` is one step removed from what a user meets. `e2e/the-unsaved-editor.spec.ts` now counts dialogs
for the two cases above, which is why the type-switch defect is visible at all. The other guard,
`beforeunload`, is still untested anywhere — it reads the same `store.isDirty`, so nothing is unprotected,
but nothing pins that it is still wired up either.

