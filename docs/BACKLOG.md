# Backlog

Things found and deliberately **not** done, with the reason. Mostly review findings that were real but
outside the stage that surfaced them.

This file exists because the alternative was worse. Reviews on this project have been scoped to the whole
branch, and each one found three to five genuine defects in already-committed territory; fixing all of them
immediately turned four planned items into three unplanned commits and left phase 5 stage 6 no further
forward. A finding worth keeping is not automatically a finding worth doing next.

---

## What is in here, as of 2026-09-17

Every entry was read against the code on 2026-09-17 and sorted into four kinds. Nothing was struck on this
pass: the entries describing work already done had been struck as the work landed, and no open entry turned out
to be finished. What the reading changed is the shape of the file rather than its contents — a count of open
entries was frightening and meaningless, because most of them are not work anybody intends to do.

**Must fix before this ships.** A rule that can clear a label on something never printed, or a finding citing a
provision that does not say what the finding claims. **None outstanding.** There were two on 2026-09-17 and both
are struck below: the (e)(6) citation, under the phase 6 opening review, and the two GS1 rules that kept no
reading of their source, under phase 7 stage 1.

**Requirements nothing checks, and the findings say so.** Real regulatory ground the engine does not cover,
where every pass it issues admits the gap in its own message. Schedulable, and safe to leave: the reference
amounts of §101.12(b), the aggregate and bilingual displays, (j)(13)(ii)(B)'s permitted abbreviations, an egg
carton's declared second column, a percentage stated for a nutrient with no Daily Value, the two spellings of
a bracketed GHS combination code, the printed text of a GHS statement, and which mark belongs on the
small-package abbreviated footnote.

**What this engine does not check, by decision.** Not work, and not going to become work without a change of
scope. These belong in front of a user rather than in a backlog: the Nutrition Facts footnote, which no
document can make wrong; 101.3(b) and (d); the single-typeface assumption behind every type-size measurement;
nutrition claims, whose condition reaches "labeling or advertising" beyond any label; the allergen advisory's
deliberate over-strictness; a hazard classification derived from statement codes; the calorie-free footnote
variant; and where the "% Daily Value*" heading sits on a dual-column panel. **All eight are now in front of a
user**, in `docs/WHAT-IS-NOT-CHECKED.md`, with the quiet-zone fallback the README already asserted — nine in
all. They stay listed here because this is where the reasoning lives; the document says what it means for
somebody holding a report.

**Notes, history and chores.** The rest: decision records, reviewer claims since disproved, entries struck as
they were fixed, and editor, API, scanner, security and test-hygiene work with no compliance meaning. One
chore is worth doing before anything else that reads a nutrition panel's columns — **a primitive does not say
which column it belongs to**, which cost four review rounds on one pull request.

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
which writes `NaN` rather than the empty string; the three stock fields are still bound raw, so that half
stands.

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

**~~`gtin-scan-note`'s id changed when the GTIN field moved onto `TextField`.~~ Closed** in the same stage,
and the entry is kept because what it cost to close is the interesting part.

The scan note used to be two mutually exclusive `<p>`s sharing a hand-written id, wired to the field by a
hand-written conditional `aria-describedby`. On `TextField`'s `description` slot both ends move onto the
component: `FormField` generates the id itself. `EditorView.test.ts` asserted the literal string
`'gtin-scan-note'`, so it failed.

**Neither remedy this entry originally proposed was taken.** Giving `FormField` a caller-supplied id would
have added API surface to serve a test's string. Swapping one literal for another would have kept the
coupling and merely renamed it. The assertion was rewritten as the relationship it was always making — read
`aria-describedby` off the field, then look for *that* element — which is id-agnostic and strictly stronger.

Doing so exposed a second test passing for free. `clears the note once the field is typed in` asserted
`find('#gtin-scan-note').exists()` was `false`, and an element that no longer exists under any condition is
always absent, so it would have stayed green however broken the clearing became. It now asserts the field
points at nothing. Both are mutation-tested: removing the description slot fails two tests.

The general lesson, which is the reason this is not simply struck: **an assertion written as a literal id is
a relationship in disguise**, and it fails or goes vacuous the moment the wiring moves. `UsFoodFormRail` has
seventy of these sites left to migrate.

**~~`GhsFormRail.vue`'s 44 hazard-class checkboxes lost their per-run styling when they moved onto
`CheckboxField`.~~ Fixed in the same stage, and the entry is kept for what it nearly cost.**

The hand-written markup set the Annex I section number in the mono face and the pictogram code in its own —
`numeric text-chrome-400` for `entry.section`, `numeric text-chrome-200` for `→ GHS0x`. `CheckboxField`'s
`label` was a plain string with no slot, so the migration concatenated all three runs into one and the
styling went.

It was recorded here as a deliberate simplification on the grounds that nothing observable moved: the
accessible name was always that concatenation, and no test reads a section number's font. Both of those are
true and the conclusion still does not follow. **A GHS hazard class number and a pictogram code are
identifiers**, and this entire component layer exists to put identifiers in the mono face — the migration
would have undone that rule on forty-four rows at once, in the name of applying it. "No test covers it" is
the reason it needed catching by eye, not a reason to accept it.

`CheckboxField` takes a default slot now, with `label` still required and still the accessible name, on the
same pattern as `FormField`'s description. `label` stays required as the stated intent and the fallback —
but the slot is what renders, and a label's accessible name is its text content, so the slot *is* the name.
The component warns in development when the two disagree. Mutation tested — removing the slot fails a named test.

The general shape, for the seventy sites in `UsFoodFormRail` still to migrate: **a component API that only
takes strings will quietly flatten every label that was not one run of prose**, and no test will say so
because styling is not part of an accessible name.

## Saved labels

**~~A saved label's `data` cannot be posted to the export route as it stands.~~ Closed** by the saved-labels
user interface, which is the stage this entry said would make it reachable. Opening `/labels/:id` restores the
stock a label was saved at as well as its data, and `e2e/the-saved-label-round-trip.spec.ts` carries the round
trip: save at 90 mm, open, export, assert the PDF's MediaBox. Reverting the fix makes it report `[0 0 170.07874
113.385827]` — 60 mm, the default — which is the silent wrong size this entry described.

The helper it also asked for was not written. Nothing outside the editor builds an export request, so a shared
one would have a single caller and would be a guess at what a second one wants.

**~~The label list is unbounded.~~ Fixed.** `GET /api/labels` returned every document on every call. It pages
now — `{ labels, nextBefore? }`, fifty by default and two hundred at most — over a **cursor** rather than a
skip, because `skip` re-reads and discards everything before the offset, which makes the last page of a long
list the most expensive one to fetch. `labelDocument.ts` indexes both keys; it indexed only `updatedAt` for
one commit after the sort gained `_id`, which put the planner back on a collection scan — confirmed either way
with `explain`, and caught by review rather than by a test.

The cursor is compound, `(updatedAt, _id)`, and the first version was not: Mongo stores milliseconds, labels
saved inside one of them tie, and a cursor of `updatedAt < boundary` steps over every neighbour of the
boundary. Four labels sharing a timestamp returned two and reported the list finished. Caught by review, and
the test written for it now creates its labels with a shared timestamp rather than sleeping to avoid one.

**A label saved while the client walks the pages is missed.** Raised by the review of the paging change and
left. `listLabels` follows the cursor page by page, and a label created between two of those requests sorts
above the cursor and appears on neither — so the list omits it until the next refresh. The single unbounded
query it replaced could not miss a row, which makes this a real if small regression. It is inherent to
cursoring on a mutable sort key rather than a fix anybody forgot: `updatedAt` is what "newest first" means
here, and seeking on `_id` alone would order by creation instead. The honest remedies are to accept it — a
list that is not live is the ordinary case, and the label appears on the next load — or to make the view
explicitly incremental, which is the "load more" decision below. Worth deciding with that one rather than
separately.

**What is not done is the list view.** `listLabels` follows the cursor to the end, so the client behaves as it
always did and every individual query is bounded — but a "load more" control, or any indication that a list
has been cut short, is a design decision for the view rather than the client. Until one exists, an account
with more than two thousand labels would silently stop at that many.

**The Nutrition Facts section reads "exempt" while the label also carries a panel.** The status line is
`nutritionExemption !== '' ? 'exempt' : …`, and neither the exemption picker nor the panel checkbox clears the
other. Reproduced in jsdom on `feat/egg-carton-and-unit-container`: claim the (j)(15) unit container, then tick
"The label bears a Nutrition Facts panel". The section says "exempt", while the rules treat the label as
carrying a panel. They grant no exemption, report the new empty panel's missing nutrients, and the engine
draws no statement. The rules are right, because a label printing a panel is not using its exemption, so
nothing false is certified. But the rail tells the user the opposite of what the report does, and the saved
document carries a claim nothing judges. It was already true of the (j)(13)(i) small package and every kind
claimed alone. Whether ticking one should clear the other, or the status should read the panel first, is a
design choice for the editor rather than a fix to slip into the exemption work.

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

### Verified, deferred with a stage

**~~A dual column is certified by one figure out of fifteen.~~ Fixed**, and found so on 2026-09-16 when this file
was counted rather than struck when the fix landed. A panel whose second column carries only
`{ 'total-fat': 6 }` now returns `FDA_DUAL_COLUMN_INCOMPLETE`, naming the thirteen nutrients declared in the
first column only. What follows is the entry as it stood. `nutritionPanel.ts` emits the
`food-nutrition-second-column` band as soon as *any* nutrient carries a second value, and both
`us-food/dual-column-required` and `us-food/dual-column-form` test only that the band exists. Reproduced: a
panel with `secondAmounts: { 'total-fat': 6 }` and nothing else prints one figure in the second column and
returns `FDA_DUAL_COLUMN_FORM_MET/pass`. (b)(12)(i)'s mandate reported satisfied by a fifteenth of a column.
**Phase 6 stage 2**, with the rest of the dual-column work.

**~~The dual-column branch discards `declaredPercentDv`.~~ Fixed**, and found so on the same day. Both column
paths in `layout/nutritionPanel.ts` go through `percentOf()`, so a dual-column panel declaring Total Fat at
9% prints "3g 9%" and `FDA_NUTRITION_PERCENT_DV_WRONG` reports it: the artefact and the finding agree. What
follows is the entry as it stood. The single-column path goes through `percentOf()`,
which honours a declared percentage; the dual path calls `printedPercentDailyValue(id, value)` directly. So
on a dual-column panel the renderer silently prints the *correct* percentage while
`us-food/nutrition-percent-dv` reads the document and reports the wrong one — the artefact and the finding
contradicting each other, and the mis-declared-percentage defect made undrawable. **Phase 6 stage 2.**

### Verified, no stage yet

**~~101.7(f)'s exemption is conditional and is applied unconditionally.~~ Fixed** on
`fix/net-quantity-zone-proviso`. The placement rule now grants `FDA_NET_QUANTITY_ZONE_NOT_REQUIRED` only when the
declaration clears the three part 101 requirements this project checks on it — presence under 101.7(a), type
size under 101.7(i), separation under 101.7(f) — asked of those rules rather than re-derived. Where it does not,
the placement requirement applies and is judged as for any package, and an `FDA_NET_QUANTITY_OUTSIDE_ZONE` on a
small package says which requirement cost it the exemption. The dual declaration is not a condition: its
mandate is the FPLA's, and 101.7(p), read from the eCFR on 2026-09-16, says only that a metric statement "may
also appear". The rest of 101.7 is not modelled, and the pass says it rests on the three. The same defect had two
more forms than the one reproduced below: `US_FOOD_SMALL_PANEL` was reported crowded and exempt at once, which
a test asserted, and a small package with a blank inch-pound declaration got the exemption beside the blocking
finding that it had none. What follows is the entry as it stood. The proviso reads that the
bottom-30 percent requirement "shall not apply … **when the declaration of net quantity of contents meets the
other requirements of this part**", and `netQuantityPlacement.ts` quotes that clause in its own doc block and
then keys the exemption on package area alone. Reproduced on a 0.9 in² panel with undersized type:
`FDA_NET_QUANTITY_TYPE_TOO_SMALL/violation` and `FDA_NET_QUANTITY_ZONE_NOT_REQUIRED/pass` on the same
declaration, the second predicated on a condition the first has just reported unmet. Lower severity than the
others here — the type-size violation is still reported, so nothing is wholly cleared — but it is a pass
issued on an unsatisfied condition, and the fix is a conditional the rule already has the inputs for.

The US food reading kept `FDA_NET_QUANTITY_ZONE_NOT_REQUIRED` on the artwork, and this entry is the reason.
Keyed on panel area it reads like an entitlement, which makes it the obvious candidate for the document. But the
proviso's condition is about the printed declaration, so stamping it `document` would have let it survive
the omission of the very declaration it is conditional on — this defect, deepened. `certification.test.ts`
now fails if it survives one.

**~~A "Contains" statement can vanish unannounced.~~ Fixed** on `fix/contains-unnamed-allergen`. The engine
records a detail omission for each ingredient whose allergen needs a specific type and states none, naming the
ingredient, whether or not the statement prints for others. Reproduced again before the fix on 2026-09-17. What
follows is the entry as it stood. `usFoodEngine.ts` records an omission for an allergen no
ingredient carries, but not for the case where every bearing ingredient yields no food-source name — which is
what `tree nuts`, `fish` and `crustacean shellfish` do without an `allergenSpecificType`. Reproduced:
`containsStatement: ['tree-nuts']` with `{ name: 'praline', allergen: 'tree-nuts' }` draws no Contains
element and records `omissions: []`. Not a false clearance — `FDA_ALLERGEN_SOURCE_NOT_SPECIFIC` still fires —
but a declared element leaves the artefact with nothing saying so, which is the one thing `LayoutOmission`
exists to prevent.

**~~Two of the three footnote variants are unreachable.~~ Half fixed** on `feat/childrens-footnote`. A panel
declared `representedFor: 'children-1-through-3'` is drawn with the 1,000-calorie footnote on both drawing paths,
against Daily Values for that group. The first-sentence-only variant is still unreachable: (d)(9) permits it only
for foods that can use § 101.60(b)'s calorie-free terms, and this project models no claims. What follows is the
entry as it stood. `NUTRITION_FOOTNOTE.childrenOneToThree` and
`.firstSentenceOnly` have no consumer; `layout/nutritionPanel.ts` hardcodes `.standard` at both sites. The
eCFR text fetched this session confirms both variants are real requirements — a food "represented or
purported to be for children 1 through 3 years of age" **shall** substitute "1,000 calories" — so a
children's food is drawn with the 2,000-calorie wording and no rule looks at the footnote at all (see
"Nothing checks the Nutrition Facts footnote", above). There is also no field on `UsFoodNutritionFacts` to
declare the food as being for that age group, so the substitution is currently unreachable from the app as
well as undrawn. Needs a selector before it needs a rule.

**~~A food for children 1 through 3 must give its protein percentage, and nothing asks for it.~~ Fixed** on
`feat/toddler-protein-percent`. `us-food/protein-percent` reads the printed protein row of a panel declared for
children 1 through 3 and reports one with no percentage; an egg carton's is asked of its declared figures. The value
is still not judged, and a protein claim, the other trigger, is not modelled. What follows is the entry as it stood. 21 CFR
101.9(c)(7)(i), read from the eCFR on 2026-09-17: the protein percentage "may be placed on the label, except that
such a statement shall be given if a protein claim is made for the product, or if the product is represented or
purported to be specifically for infants through 12 months or children 1 through 3 years of age". A *shall* for
exactly the food `representedFor` now declares. Reproduced on `feat/childrens-footnote`: the conformant panel
declared for children 1 through 3, with no stated protein percentage, prints "Protein 5g" and no rule mentions
protein. The engine cannot derive the figure, because (c)(7)(ii) corrects the amount by a digestibility score no
label carries, and the percentage rule excludes protein for the same reason. What is missing is a rule requiring a
declared protein percentage on a toddler food, and whether a declared one can be judged at all without that score.

**~~A dual-column panel cannot state a protein percentage in its second column, so a toddler food on one cannot
comply.~~ Fixed** on `feat/second-column-percentages`. `columns.secondPercentDv` states the second column's
percentages, the panel prints them in place of the figures it derives, and `us-food/nutrition-percent-dv` judges
them against the second column's own amounts. What follows is the entry as it stood. Found by the review of `us-food/protein-percent` on `feat/toddler-protein-percent`, and reproduced. Read from
the eCFR on 2026-09-17, 101.9(e)(2), (e)(3) and (e)(6) each present the percent Daily Value in every column, by what
the second column counts, and for a food for children 1 through 3 that includes the protein percentage (c)(7)(i)
requires. The first column prints a stated percentage, but `UsFoodNutritionFacts` has no field to state one for the
second column, and the engine derives none for protein, so the second column prints "5g" with nothing beside it.
The rule reports that under the paragraph for the column's basis, which is true of the printed label, and nothing in the editor can fix it. The
fix is a declared second-column percentage, at least for protein, with the rail offering it.

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

**~~(e)(6) is cited for every per-container column, though its own words reach only the mandatory ones.~~
Fixed.** Found by `/code-review high` on PR #40. 101.9(e)(6) opens "When dual labeling is presented for a food on
a per serving basis and per container basis **as required in paragraph (b)(12)(i)** of this section or on a per
serving basis and per unit basis **as required in paragraph (b)(2)(i)(D)**", so a column carried voluntarily was
being cited to a paragraph whose own predicate its label does not meet.

`dualColumnDuty` now reports every basis actually required rather than only the first, because the predicate is
per-provision: a per-unit column is (e)(6)'s business only where (b)(2)(i)(D) required a per-unit column, and
both provisions can bite on one label. `eachColumnReference` and `separatedColumnsReference` consult it and
return `undefined` where (e)(6) does not reach, leaving each rule to fall back to the citation it declares —
(e) for `us-food/dual-column-form`, (c)(7)(i) for `us-food/protein-percent`, which is the path a label stating
no basis already took. The messages distinguish the two, because "no basis stated" is a field the user can fill
in and "carried voluntarily" is not.

**The reading that settled it**, from the eCFR on 2026-09-17: nothing in (e) covers a voluntary column. (e)'s
opening permits dual labeling for forms, combinations under (h)(4), "different units ... as provided for in
paragraph (b)" and RDI groups, and a per-container column is none of them. The one paragraph in 101.9 that
contemplates a voluntary second column is **(b)(6)** — a package "more than 150 percent and less than 200
percent of the applicable reference amount" *may* provide, "to the left of" the per-container column, a column
"per common household measure that most closely approximates the reference amount". That is a different column
from the one a label declaring `per-container` describes: it sits on the other side and counts something else.
So (b)(6) was not adopted as a substitute citation, and the general reference stands instead of an invented
specific one.

Two things that reading turned up, neither in scope and both below: what authorises a per-container column
*outside* (b)(6)'s window, and (b)(11)'s promoted-use column.

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

**~~An incomplete voluntary second column is still reported as a violation, under a paragraph that does not
reach it.~~ Fixed by removing the finding.** Raised by the review of the (e)(6) citation fix and settled on
2026-09-18 by reading (e) again. Its opening permits dual labeling for four things and its requirements are
the terms on which *those* permissions are exercised — "When **such** dual labeling is provided". A
per-container column nothing compels is none of the four, so no provision of 101.9 governs its form.

**Advisory was considered and rejected.** `Finding.citation` is required, so an advisory would still have named
101.9(e) while saying (e) does not reach the column — the same false statement at lower volume, and the defect
this project treats most seriously. There being no provision, there is no finding; the limit is in
`docs/WHAT-IS-NOT-CHECKED.md` instead, which is what that document is for and keeps this consistent with
`gs1/quiet-zone`, silent for the same reason.

**What it cost, which is worth knowing.** The editor seeds a per-container column and collects no reference
amount, so a browser-built dual column is governed by nothing until the user states the three facts — and four
checks that used to fire on it (completeness, separation, headings, equal prominence) now do not. They were
firing under a citation that did not apply, so this is a correction rather than a loss, but it is the commonest
label this tool draws. The mandate rule's decline asks for exactly those facts, which is the path back.

**`ghs/pictogram-set` cites CLP Annex V whatever the regime.** Its sibling `ghs/pictogram-precedence` selects
29 CFR 1910.1200 Appendix C for a `us-osha` label and CLP Article 26 for an EU one; this rule has a single
citation and no branch, so a US label is told its pictograms are wrong under an EU regulation. Noticed while
adding declines — the decline inherits the rule's citation, so it inherits this too — and left alone because
it predates that change and needs the OSHA pictogram set read and verified before a second citation can ship,
which is a reading rather than a refactor. `docs/WHAT-IS-NOT-CHECKED.md` does not mention it; it should, if
this is not fixed first.

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

**~~The rejected figure also stays on screen.~~ Settled in interface stage 4, for the three fields it
applied to.** The policy is **show it as rejected**: the box keeps the figure, the field takes
`aria-invalid`, and a sentence beside it says the label does not hold it and what to state instead.
Clamping was rejected outright — the document would hold a measurement nobody typed, on a tool whose only
value is being right — and refusing the keystroke was rejected because `type="number"` sanitises its own
value, so the control cannot tell a refused figure from a half-typed one without becoming a text input.

The entry as written was half wrong in a way worth keeping. It described one defect; there were two, in
opposite directions, from the same keystroke. Where the field had never been filled the `0` did stay on
screen, as recorded. Where it already held a figure the box was **blanked** instead, because the bound
value moved and Vue patched the element — which is the worse of the two, since it takes back a keystroke
as it is typed.

**What stands is the wider half of the entry above, and it is untouched.** `optionalNumber` still accepts
`0` and negatives into `servingsPerContainer`, `netQuantityFontSizeMm`, `availableSurfaceSqInches` and
`continuousVerticalSpaceInches`; eight `min="0"` attributes still mean `positive()`; and nine bindings
across the three rails still write `''` into a field typed `number`. None of those refuses anything today,
so none of them has the disagreement that was just fixed — a user types a zero, sees the preview change,
and learns on save. Closing them is a change to what the guards accept rather than to what the control
shows, which is a different question and a much larger diff. Left out of stage 4 for scope, not doubt.

**~~The editor has no inputs for the three facts a dual-column duty turns on.~~ Fixed.** Found by
`/code-review high` on PR #43. `UsFoodFormRail.vue` collected no reference amount, package content, unit
content or "packaged and sold individually", though the type and the API schema carried all four — so every
label built in the browser left 101.9(b)(12)(i) and (b)(2)(i)(D) unanswerable, and
`us-food/dual-column-required`, the one rule in the set that reports a label for *omitting* a required display,
was silent on every one of them. The rail now takes all four.

Two details worth keeping. The reference amount's three parts travel together, so entering an amount creates
the whole record and clearing it removes the record rather than leaving a category claiming a row of §101.12(b)
with no figure against it. And "packaged and sold individually" is a **three-state** control rather than a
checkbox: a checkbox can say "yes" or say nothing, and saying nothing is exactly the state that left the duty
unanswerable, while "no" is a real answer that takes the duty away — a multi-serving box is not sold
individually and (b)(12)(i) does not reach it.

**~~`us-food/dual-column-required` clears a label that drew a column of the wrong basis.~~ Fixed.** Found by the review
of the (e)(6) citation fix. The rule asks whether a second column is *present*, never what it counts, so a
package whose unit sits at 250 percent of the reference amount — owing a per-unit column under (b)(2)(i)(D) —
gets `FDA_DUAL_COLUMN_MET` for drawing a column its own document labels per container. The pass is not wrong
about what it says, which is that a column was drawn; it is wrong about what a reader takes from it, which is
that the obligation was discharged. The citation fix works around the reader-facing half by naming the column
actually owed in the *other* rule's message rather than calling the declared one voluntary, so the two findings
no longer contradict each other on the same label. The mandate rule itself is untouched, and closing it means
deciding what a mismatch is: a distinct finding code, or a withheld pass. Note (b)(12)(i) and (b)(2)(i)(D) can
both bite at once, so "the wrong basis" is not always a single right answer — which is why the check asks
which owed columns are **not** on the label rather than whether the one drawn is among those owed. Asking the
second was the first version of the fix, and it certified every package owing two columns, since a label can
only draw one and whichever it drew was always "among" them.

The reading that settled it, from the eCFR on 2026-09-18: both provisions name what their column must carry,
not merely that one exists. A label owing a per-unit column and drawing a per-container one has not provided
what (b)(2)(i)(D) asks for. Where the label declares no basis at all the answer is neither — reporting the
column absent would be a false positive, clearing it would certify a column the engine cannot identify — so
that case is a new advisory rather than either.

**A package owing both additional columns cannot be made compliant in this tool.** Where a package sits in the
200–300 percent band *and* its individual unit does, (b)(12)(i) and (b)(2)(i)(D) each ask for a column, and
`UsFoodNutritionFacts.columns` holds one `basis` and one `secondAmounts` — so every such label is reported for
the column it cannot express. That is the right answer to give and a poor place to leave a user: the finding
is accurate and there is nothing they can do about it in the editor. Fixing it means a third column in the
model, the engine and the panel, which is a larger change than the reading that surfaced it. Noticed while
correcting the basis check, and reported rather than cleared because certifying the label would be the false
clearance this whole line of work has been removing.

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

**~~`us-food/dual-column-form` cites (e)(2) for an incomplete second column whatever the column counts.~~ Fixed**
on `fix/dual-column-citations`, and the unseparated-columns finding with it, which cited (e)(3) the same way. Both
choose by `columns.basis` from a table shared with `us-food/protein-percent`; a label stating no basis cites (e)
itself. What follows is the entry as it stood. Found by
`/code-review high` on PR #39, and read from the eCFR on 2026-09-17. `FDA_DUAL_COLUMN_INCOMPLETE` always carries 21 CFR
101.9(e)(2), whose "for the form of the product as packaged and for any other form" is about forms and combinations.
For per-serving beside per-container or per-unit columns, (e)(6) is the paragraph that puts "the quantitative
information by weight as required in paragraph (d)(7)(i)" in two columns, and for units and RDI groups it is (e)(3).
The finding is right and its citation is wrong for most of the bases the engine draws, including the mandatory
per-container column. `us-food/protein-percent` already chooses by `columns.basis`, and the same table fits here.
Left for its own change because it alters an existing finding's citation and its fixtures.

**Struck with it:** the carton is now asked for the second column its information declares, under the paragraph
for what that column counts. What follows is that entry as it stood. An egg carton escapes the same check. With no
panel drawn, `us-food/protein-percent` asks the carton only for a
declared first-column percentage. Reproduced: a carton claiming (j)(14), declared for children 1 through 3 with two
columns and 38 percent stated for protein, gets no protein finding at all. It is never passed either. Found by the
review of the dual-column fix, and left here because a toddler food in an egg carton with a second column is
unlikely and the declared second column has no percentage field to ask about anyway; it closes with the field.

### Reported, not yet verified

Recorded as reviewer claims rather than as facts. Each is checked before it is picked up. Six of the seven
open here were reproduced and settled on 2026-10-08, on `fix/reported-not-verified`: four were real and are
fixed, one was real and latent and is fixed, and one was not a defect. The seventh, the editor rail, is
below.

- ~~**The two small-package displays abbreviate the footnote in two ways, and neither matches the regulation's
  string.**~~ **Struck — reproduced, and not a defect.** The tabular display prints `*% DV = % Daily Value` and
  the linear `% DV = % Daily Value.`, as reported. Read from the eCFR on 2026-10-08: (j)(13)(i) relieves these
  packages of "the information in paragraphs (d)(9) and (f)(5) related to the footnote" and permits "the
  abbreviated footnote statement '% DV = % Daily Value'". (d)(6) says the "% Daily Value" column heading
  "shall" be "followed by an asterisk", and the tabular display prints that heading; (d)(9)'s footnote is
  "preceded by an asterisk". So the tabular asterisk is the heading's referent, which (j)(13)(i) relaxes the
  wording around and not the mark. The linear display has no column heading — (d)(7) excepts it — so nothing
  wants an asterisk, and its full stop closes the run the way its commas separate it. Both tests that only
  asked `toContain` now pin each display's exact string, with this reading beside them.

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

  **"Changes no verdict" stopped being true once a bounds check read widths.** `layOutGhsLabel` now records a
  line that runs past the right edge, and a bold signal word measured in Regular widths could print up to
  that 3–5% past it unrecorded — and still clear `GHS_SIGNAL_WORD_SINGLE`. The check resolves the SemiBold face
  for bold text the way `embeddedFontFor` does, so the omission is right; the wrap it follows still uses
  Regular widths, which is this entry. `usFoodEngine`'s right-edge check measures the bold statement of
  identity the same way, and the resolution is one function, `measuredFamilyFor`, rather than a copy in each
  engine.
- ~~**The Calories word and numeral sit on different baselines on the vertical display.**~~ **Fixed.**
  Measured: the 16 point word's baseline at 47.33 mm, the 22 point figure's at 49.45 mm — 2.12 mm, six points
  apart. `text()` in `nutritionPanel.ts` takes a `lineSizePt`, and every run on a line sits on the baseline the
  line is sized for. The same mechanism had a second victim: a second column set at a different
  `secondColumnTypeScale` floated above its row when smaller, and when larger fell out of the bottom of its own
  row box, where the hairline to the next row is ruled — 5.64 mm deep in a 4.23 mm row at 2×. Each row is now
  as tall as its largest run.
- ~~**The (c)(8) thick bar can be drawn above the first nutrient row.**~~ **Fixed.** Reproduced with `order`
  beginning at vitamin D: a 7 point bar at 55.52 mm, between the heading and the first row at 57.99. It now
  waits for a drawn row, as the hairline beside it did.
- ~~**A finding can carry an element id nothing resolves.**~~ **Fixed, and wider than reported.** As claimed,
  `us-food/nutrition-rounding` judged every declared amount, so a nutrient left out of `order` was reported
  against a row never drawn. Its pass was the worse half: an artwork pass, saying the printed amounts round
  correctly, that counted that unprinted figure — 11 amounts with or without sodium's row. It now judges only
  rows the panel drew, where it drew a panel; a panel printed beneath a (j)(14) lid is still judged, and its
  finding names no element. And Calories was never a row: its findings pointed at `food-nutrition-row-calories`,
  which no display has ever drawn. A new sweep, `elementIds.test.ts`, asks every finding in every fixture
  whether the engine drew the element it names, and found three more — a wrong check digit naming the symbol it
  prevents, an unstated ingredient exemption naming the statement an exempt label lacks, and the exemption's
  own pass. The first two are fixed; the third is the entry below.
- ~~**A tabular nutrient column wider than its panel is drawn outside it.**~~ **Fixed.** On a 60 mm label with a
  12 mm margin the columns ended 1.64 mm past the panel's border, inside the margin, with no omission recorded
  and six passes keyed to the panel standing. The engine now records one at the panel's own right edge, so those
  passes are withheld; the format entitlement, a fact about the document, survives.
- **Editor rail, five items.** The type-size override input unmounts itself mid-edit when the box is emptied
  (its `v-if` reads the same key its setter deletes), so the only route to an undersized declaration is
  overtyping without ever clearing; a blank ingredient percent is written as `0` rather than unset, so
  predominance order is judged against a figure the user never stated; `min`/`max` on that percent are not
  enforced on typed input, so out-of-range values reach the API as a raw 400; `setAllergen` re-asserts
  `declareInline: true` on every allergen change, silently restoring a parenthetical the user turned off; and
  toggling the second-column checkbox off `delete`s `facts.columns`, discarding every figure typed into it.
- ~~**`generate-font-metrics.mjs`'s missing-glyph guards are dead.**~~ **Fixed.** Reproduced: fontkit maps an
  unmapped code point to glyph 0, `.notdef`, advance 472 units in Plex Sans. The measurements moved into
  `scripts/fontMetrics.mjs`, which asks `hasGlyphForCodePoint`, and a `scripts` vitest project holds them to it.
  Regenerating the table afterwards produced a byte-identical `metrics.ts`, so nothing shipped was affected.

**Found while verifying the entries above.** One fixed:

- ~~**`us-food/nutrition-percent-dv` judged nothing on the tabular and linear displays.**~~ **Fixed.** It counted
  a column as drawn only where a row had a separate end-anchored cell, and those two displays print the
  percentage inside the row's own run — "Total Fat 3g 4%" — so the count was always zero. A declared 99 percent
  for fat was reported on the vertical display and drew nothing at all, finding or pass, on the other two: the
  same silence the report keeps where no provision governs. The first column now also counts as drawn where the
  stated figure appears as a whole token in what the row printed. Two fixtures, one per display.

And two recorded rather than fixed:

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
lists them as unreached alongside the three pass codes in "Four pass codes are reached by no fixture",
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

**~~A refused figure is shown but not announced.~~ Fixed in interface stage 5**, through the announcer
rather than through the description. Each of the three fields says its refusal on a line of its own, with
the field named, because it is heard away from the box it is about; the line goes when the field is
answered or left empty. Copying the GTIN's conditional `live` was not done, for the reasons this entry
gave, and `live` no longer exists to copy.

**~~A failed open says the editor is showing a new document, and it is not.~~ Fixed**, by making the
sentence true rather than changing it: a failed open now detaches exactly as arriving at `/labels/new` does —
the fields stay, nothing is attached, the name goes — so a Save creates a record rather than replacing the
one left behind. For any failure, not only a 404: the label on screen is not the one the URL names, which is
the only fact a Save needs. A non-404 message is framed as a sentence whatever the server sent.

**~~A Save still in flight when the user moves to another label lands on that label.~~ Fixed** as the
entry proposed, with the request-scoped shape the pending open uses: a Save records which document it was
made about — `documentGeneration`, which the store moves whenever a label is opened or let go of — and if
that has moved by the time it answers, its success is not applied: the record is still written, as asked,
but the label now on screen is not told it is that record and the URL is not moved back. A failure is still
said, naming the label it was for — a version that dropped it hid unwritten edits, and review caught it. A first version keyed on the route, and review
showed a route can be returned to; a second review showed the generation had to move on every type change
and when an open starts, not when it lands.

Fixed alongside, unrecorded until found: `markSaved` took its baseline when the Save answered, so an edit
made while it was out was marked saved, and the server's name was written back over a rename typed in the
meantime. The baseline is now the payload that was sent, and the name is adopted only if unchanged.

**~~The wait's live region is created with its text already in it.~~ Fixed in the same stage**, by not
giving the wait a region at all. The panes stay mounted through it, the findings rail takes `pending`, and
the regions already being observed say "Opening this label…" and then the opened label's counts — two
changes to one node, both of which a screen reader hears. The version this entry described was worse than
it said: by swapping the grid out it also unmounted the *rail's* region and rebuilt it full on arrival, so
the opened label's findings went unannounced where on `dev` they had been heard. Found by the phase's
whole-branch review.

What remains is the first page load of `/labels/:id`, where the region is born saying "Opening this
label…" because the page itself is. That is page content arriving, not a change to announce, and the change
that follows it is heard. The live-region question for the GTIN note and the refused measurements is
unaffected and still open.

**~~On a narrow screen showing Checks, two live regions are perceivable, and a comment says it cannot
happen.~~ Fixed in interface stage 5**, by there being one region to perceive. The findings rail and the
editor's narrow-only region both said the summary, in two wordings; both are gone, and the summary is said
once through the announcer at the application root. The patch this entry warned against — gating the
editor's region on the pane — was not needed and was not taken, for the reason given: it would have moved
the announcement from node to node as the panes changed. `e2e/the-responsive-collapse.spec.ts` now visits
every narrow pane, which is how the old version missed this.

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

**~~The editor's header keeps naming the previous label while the next one is being opened.~~ Fixed with
the shell.** The name field reads empty under an "Opening a label…" placeholder for the wait, the chip goes,
and Save stops reading "Saved"; the window title says "Opening a label". What follows is the entry as it
stood. The panes go,
but the name field still reads "Granola 340g" and the chip beside it still reads "Saved" — a document
identity asserted about something not on screen. Everything there is disabled, so nothing can be edited or
lost, which is why this is an entry rather than part of the fix: the harm the stage closed was a document
that could be edited and then silently discarded, and this is the cosmetic remainder. Worth doing with the
shell work, where the header is being looked at anyway.

**~~The dimension callout's figure is drawn over the barcode's own digits.~~ Fixed.** Measured: the
figure's ink started at 33.39 mm and the human-readable digits' ended at 33.85 mm. It is now placed from
where its ink starts — clear of the symbol's drawn box by 0.6 mm, with the ink's height taken from the
engine's own measurement of Plex Mono's capitals — and the rule sits under it. The browser test reads both
baselines and sizes from the elements and compares ink rather than bounding boxes, which include the
font's empty ascent and descent and would have demanded room the ink does not need. The measurement also
corrected a guess in the first version of this entry: the engine's drawn height ends at the digits'
baseline, not below their descent.

The clearance cost 0.46 mm of depth: the callout now reaches about 3.3 mm below the symbol where it reached
about 2.8. The overlay shares the label's `viewBox`, so a symbol placed closer than that to the bottom edge
has the callout's tick ends clipped — as it already would have at 2.8 mm. The default retail label leaves
about 6 mm. Noted by the review of the fix; not worth a change until a label puts a symbol there.

**~~The canvas's two overlay checkboxes never joined the component layer.~~ Fixed.** They are
`CheckboxField`s now. Measured as bare inputs: 13×13 boxes in 17 px rows with 0 px between box and word.

**"Needs 2.97 mm" wraps onto a line of its own, away from the clear-space figures it qualifies.** An audit
finding (`docs/ui-audit-2026-09-18/close-figcaption.png`) that was never written down here, and still true:
at the canvas's width in the editor the figcaption's `<dl>` wraps after "Clear space", so the requirement
sits under the zoom row's neighbours rather than beside the measurement it is the minimum for. Not fixed
with the two above because the obvious repair — wrapping the two pairs so they wrap together — is not
valid inside a `<dl>`, which allows a `div` around one name and its value but not around two. It wants a
decision about the markup: one pair whose value states both figures, or a different element.

## From stage 2, the report surface

**~~The rail repeats a forty-word explanation once per element, and the fix belongs in the engine.~~ Fixed
in the engine, as this entry said it should be.** `LayoutOmission` carries an optional `explanation` — what is
missing here, and why — built only through `explainedOmission`, which assembles `reason` from the two halves
so the sentence and its parts cannot disagree. The GHS pictogram and statement omissions use it; the rail
groups on `why` as a whole string it was handed and prints each element's own half above it. Every word the
engine wrote is still printed. The statement omission's single sentence with a colon became two sentences,
so its shared half reads as a sentence when said once; nothing quoted the old wording, and no rule reads an
omission's text — rules ask whether an element has omissions at all.

The editor's store and the audit report each assembled the "cannot be checked" list, and both had to change
the same way, so they call one builder now. The audit's copy had left out the overprinted-symbol half on
purpose, since an audit layout has no symbols — an earlier draft of this entry called that drift, which a
review corrected by quoting the comment that said why.

**~~"Checks that did not run" names facts a user could state and cannot link to any of them.~~ Fixed.**
`Decline` carries `wants`: the facts the label has not stated, named as paths into its own data
(`nutritionFacts.referenceAmount`) rather than as anything of the interface's, from a closed union. The web
app maps each to the field that states it in a `Record` over that union, so a fact without a field is a
compile error; a test renders each declining state and checks every field asked for is on the page. Each
check that did not run now offers a control per fact, and following one shows the Form pane on a narrow
screen and focuses the field.

**Writing the test that holds a decline to its word found the word broken.** `Decline.reason` promises that
doing what it says makes the check run. For a second column counting the individual unit, two rules told
the user to state the reference amount, what the package holds and whether it is packaged and sold
individually — and (b)(2)(i)(D) reads the reference amount and the *unit* content, nothing of the package. An
existing fixture reached it: a label that had stated all three package facts was asked for all three again,
and could never make the check run. The duty computation now reports what each provision is still missing
from the same `stated` test it decides with, each rule names its own provision's facts, and the "State …"
sentence is built from that list, so the instruction and the links cannot disagree. `rules.test.ts` follows
every decline's ask until the rule runs.

## From the stage 1 rail migrations

**~~The GTIN's scan note is created in the same render as the text it announces, so it may never be
spoken.~~ Settled in interface stage 5, and the decision this entry asked for was taken.** It set out two
shapes: accept a second live region and make "exactly one" into "one per concern", or route announcements
through a region that already exists. The second was taken, in a stronger form — not the findings rail's
region, which came and went with the rail, but one announcer mounted at the application root that nothing
can unmount. The scan note is now only a description; what a scan did is said through the announcer.

The first shape turned out to be half-true already, which is worth keeping. "Exactly one live region" was
never so: with the barcode scanner open there were two, measured, and nobody had decided it. The rule as
written now admits that — a widget the user opens may keep a status line about itself — and asserts the
thing that matters to someone listening, that a fact is heard once.

**`live` is gone from `FormField` and the three controls built on it.** It existed for this one field, and
the shape it offered — a description that is also a live region — cannot work, because the description is
created in the same render as its text. Removed rather than left unused, so the shape cannot come back.

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
pinned by the fixture rather than by the markup. Worth tightening when the component layer gives the error
its own testable element, which is stage 1.

## Serving the client

**Nothing is compressed.** The API serves `apps/web`'s build uncompressed, and the largest chunk is
`LabelCanvas-*.js` at roughly 1.07 MB — bwip-js, which the canvas needs and which nothing currently splits
out of the first load. Vite's dev server gzips; this one does not, and an ALB does not compress on a task's
behalf either, so the deployed app would ship the full megabyte on every cold visit.

**~~Not fixed in phase 6 stage 1~~ — the compression half is done.** `compression` is mounted ahead of every
route, with PDFs excluded by an explicit filter: PDFKit deflates its content streams already, so gzipping an
export is CPU spent to grow the response by a percent. That takes the JavaScript to roughly a quarter of what
it was on the wire.

**The code-splitting half is deliberately not done, and it is a UI decision rather than a build one.** The
chunk is large because the landing page draws a *real* barcode through bwip-js, synchronously, in a
`computed` — so the only way to take it off the critical path is to load it after the page renders and show
something else meanwhile. That changes what a first-time visitor sees: a barcode that appears a beat late,
or a placeholder that has to be designed. Splitting it into its own chunk without that changes nothing a
visitor would notice, since the landing page still waits for it. It belongs with the UI work, not here, and
doing it as a `manualChunks` line would have looked like progress while moving nothing.

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

**~~Nothing rate-limits the export endpoint.~~ Fixed.** `POST /api/labels/*/export` is unauthenticated, renders a PDF per
call, and sits behind `express.json({ limit: '10mb' })`. That combination is a cheap way to spend a task's CPU
from the outside. It mattered less while the wildcard CORS header made the API openly callable anyway and the
app was not deployed; it matters more once it is. The right home is **phase 8**, where an ALB and a WAF rule
are the natural places to put it rather than middleware in this process — and where the vision endpoint,
which spends money per call, will need the same protection more urgently.

**~~That endpoint now exists.~~ The audit route is covered; the export routes are not.** `POST /api/audit/ghs`
costs roughly two US cents a call at the sample label's token count, which made it the most expensive thing on
this server to abuse and the reason this entry stopped being theoretical. It now carries two quotas — twenty
per client per hour and two hundred per process per day — and an optional `AUDIT_API_KEY` that is required the
moment it is set. Both run before the extractor, so a refused request spends nothing, and the quota counts
refused keys so the key cannot be guessed at for free.

**This is middleware in this process, which the entry above says is the wrong home**, and that judgement still
stands for the shape of the protection rather than against having any. An ALB and a WAF rule are better at
refusing traffic cheaply and are still the right answer at the edge; what they cannot do is know that this
particular route spends a key per call, so a per-process daily cap on *this* route is a thing only this process
can enforce. The two are complements. What remains for phase 8 is the edge. The export routes now carry an
hourly per-client limit of their own — sixty renders, generous for a proof cycle and useless for a script —
and the 10 mb body limit is no longer theirs: it is mounted on `/api/audit` alone, the one route that posts a
photograph, with everything else held to 256 KB. They are still unauthenticated, which is the edge's job.

**~~There is no `.env.example`.~~ Written in phase 6 stage 6**, the stage that made `MONGODB_URI`
load-bearing, as this entry asked. It lives at `apps/api/.env.example` rather than the repository root:
`dotenv` resolves `.env` against the working directory and npm runs a workspace script from that workspace, so
a root `.env` is read by nothing. That was latent for as long as every variable was optional, and became a
failure to start the moment one was not.

**The audit route's guards run after its body has been parsed.** `express.json({ limit: '10mb' })` is
app-wide and registered before every router, so a request the quotas or the key refuse has already been
buffered and parsed in full. The guards bound what the route can *spend*, which was their job; they bound
nothing about what it costs to refuse, so ten megabytes of JSON still gets read before a 401. Raised by the
review of the audit-route change and left deliberately, because the fix is the body limit rather than the
guards: 10 mb is a figure chosen for a photograph, and every route on this server pays it. That sits with the
deferred hardening — the export routes' rate limit, the body size, compression — rather than here. A limiter
mounted at app level ahead of `express.json` would help the audit path alone, at the cost of splitting one
route's protections across two files, which is worth doing only if the body limit stays where it is.

**The audit route's quotas are per process, so two containers are two allowances.** `express-rate-limit`'s
default store is in memory, which is the right call for one container and the wrong one for a service scaled
horizontally: the daily cap is what stops a deployment spending its key, and four tasks would spend four times
the figure that was set. Nothing is wrong today — this runs as a single container, which is what bundling
`label-core` through tsup is for — and a shared store is a dependency and a Redis to run, which is not worth
adding before there is a second task. Worth remembering as part of any move to more than one, alongside the
edge-level limits the entry above still wants.

**Three dev-only advisories remain.** `vitest` and `@vitest/mocker` (a path traversal in the mocker's redirect
handling) and `esbuild` (arbitrary file read via the dev server, on Windows). None ships: `esbuild` is only
reachable from production dependencies via `vue-router` → `vite`, which no runtime path touches. `npm audit
fix` will not resolve them without a major bump of the test runner, and taking a vitest major inside a
security change is how an unrelated breakage gets attributed to the wrong commit. Worth doing deliberately,
on its own, when there is a reason to touch the tooling.

**~~When stage 5 widens the CSP for the scanner, it must add `'wasm-unsafe-eval'` and not `'unsafe-eval'`.~~
Done**, and found so on 2026-09-16. `apps/api/src/app.ts` sets `script-src` to `'self'` and
`'wasm-unsafe-eval'`, with a note giving this entry's reason. What follows is the entry as it stood.
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

**~~`Finding.certifies` is the right idea, and nothing defaults it any more — but the widening is in progress,
and this entry's original framing of *why* was wrong.~~ The widening is done**: every stamp was decided on
`feat/certifies-every-pass` and merged in PR #28, as the third paragraph below already said beneath a heading
that had not caught up. What stays true is the note that `certifies` on violations would need designing. What
follows is the entry as it stood. It said filtering an audit report on the field
would empty the report. No such filter exists: `withholdUncertifiablePasses` is the field's only reader, and
the audit report builds its "cannot be checked" block from `layout.omissions` directly. So widening
`certifies` changes one thing only — which passes survive an omission — and can only ever make that guard
*looser*. A report that separates a verdict about the user's label from one about our reconstruction would
need `certifies` on violations too, which `Finding` now forbids (`certifies?: never`) until someone designs
it.

Where it stands: `Finding` is discriminated on `severity`, so a `pass` without `certifies` does not compile.
When the builders were split, every existing `passed` call became `passedOnArtwork` so that no verdict
changed in the same commit as the mechanism. **Those thirty-seven stamps preserve the old default; they are
not yet decisions.** The provisions are read rule set by rule set, and a call site that has been judged
carries a note saying what its provision governs.

GS1's six were read on 2026-09-16. The check digit and the Digital Link rest on the document; the four that
measure the printed symbol rest on the artwork. GHS's seven were read the same day, and all seven rest on
the artwork. US food was read last. The SI exemption, the nutrition format entitlement and the second-column
exemption rest on the document, and the other twenty-three rest on the artwork. The ingredient exemption was
stamped `document` first and reversed once §101.100 was read. **No stamp is left undecided.**

### What reviewing the mechanism turned up

Each reproduced before being written here. None is fixed by choosing `artwork` or `document`, which is why
they are separate entries rather than part of the reading.

**~~`us-food/information-panel-type-size` clears type that was never printed.~~ Fixed** on
`fix/passes-rest-on-what-printed`. The rule now declines its pass unless every element it measured
`wasFullyDrawn` — not by counting only what printed, which would read as clearing the panel. Undersized type is
still reported whether or not it printed. What follows is the entry as it stood. Its pass names
`food-pdp`, and the engine never records an omission against that id, so the guard cannot withhold it. On
`US_FOOD_CONFORMANT` with 400 ingredients, the responsible firm is recorded as an `element`-scope omission
— "begins 645.22 mm down a 240.00 mm label, past its bottom edge, so none of it is printed" — and the engine
still emits its text primitives. The rule counts them: `FDA_PANEL_TYPE_SIZE_MET`, "3 elements on the panel
clear the 1.59 mm floor", where the three are the statement of identity, the ingredients (itself partly
omitted) and a firm that is not on the label. `certification.test.ts` asserts `FDA_RESPONSIBLE_FIRM_MET` is
withheld for this exact document, so two rules disagree about the same undrawn element and the one that
survives is the one certifying more. A live false clearance.

The US food reading kept it on the artwork — 101.2(c) bounds the height of printed letters — so the stamp is
right and cannot reach the defect. The pass names an element the engine never omits. The fix belongs in the
rule, counting only elements that `wasFullyDrawn`.

**~~`GHS_SMALL_CONTAINER_COMPLETE` names no element, so nothing can withhold it.~~ Fixed** on
`fix/passes-rest-on-what-printed`: the rule now declines the pass unless every element its list names
`wasFullyDrawn` — the product identifier, each pictogram, the supplier, and under OSHA the signal word and the
outer-package statement. While no glyph is drawn that is every container carrying a pictogram. What follows is
the entry as it stood. On a complete EU small
container (0.1 L, GHS02) it reports "The container carries everything the small-container provision requires
of it" while the only pictogram is a frame with no symbol in it. The rule's own list includes "at least one
hazard pictogram", which it checks as `layout.pictograms.length > 0` — frames, not glyphs. The violation
branch names `GHS_ELEMENTS.supplier`, so an id was available. `GHS_PICTOGRAM_SYMBOL_MISSING` is still raised
on the same label, so the label is not silently clean, but this pass states something false.

The GHS reading kept it on the artwork — both provisions list what the container's own label must carry — and
found it reaches further than the pictogram. It reads the supplier and the outer-package statement from the
document, so it also counts them when they were never printed: see the GHS engine entry under "What reading
the GHS provisions turned up".

One other `passedOnArtwork` site names no element and is equally beyond the guard's reach:
`GHS_PICTOGRAM_PRECEDENCE_MET`. **The GHS reading found it is not a false clearance on today's engine.**
Article 26 and C.2.1 say which pictograms "shall not appear", so it rests on the artwork. But the only
omissions `layOutGhsLabel` records against pictograms are missing glyphs, one on every pictogram alike, and
those change neither the codes `precedenceSuppressions` reads nor the truth of a claim that nothing forbidden
appears. `GS1_DIGITAL_LINK_VALID` was the second site, and the GS1 reading settled it on the document: URI
Syntax governs a string, and this engine prints no carrier for the link, so there is no ink to withhold the
pass over.

**~~`GHS_PICTOGRAM_SET_MATCHES` names the strip; omissions are recorded per pictogram.~~ Fixed** on
`fix/passes-rest-on-what-printed`, as the entry proposed: the pass is withheld unless every member pictogram
`wasFullyDrawn`. It carries
`ghs-pictograms`, and the engine records `ghs-pictograms-GHS02` — so on `GHS_CONFORMANT` the guard never
matches, and the pass "Every pictogram on the label is required by a declared hazard class" survives beside
a `GHS_PICTOGRAM_SYMBOL_MISSING` violation for the same pictogram. `ghs/pictogram-size` names the suffixed id
and *is* withheld. ~~Recorded as a mechanism, not yet as a defect~~ — **the GHS reading makes it a defect, and
a live false clearance.** The rule judges whether the pictograms the label *carries* are the ones Annex V
requires. That is the artwork, in the same way 101.5's firm is: the codes are read from the layout as a proxy
for what is printed, and a frame with no symbol is not a pictogram (C.2.3.1). So this pass should fall with
the pictograms it vouches for, and the guard never gets the chance. The fix is in the rule or the id, not the
stamp: withhold the pass unless every member pictogram `wasFullyDrawn`. On today's engine that withholds it
on every label carrying a pictogram, which is the correct answer while no glyph is drawn.

**Four pass codes are reached by no fixture.** The sweep in `fixtures/sweep.ts` reaches 35 of 40, re-counted on
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

**~~`us-food/nutrition-format`'s docblock and its behaviour disagree about (d)(11)(iii).~~ They do not, and
this entry was wrong.** It recorded a disagreement while declining to read the paragraph, which `CLAUDE.md`
says to fetch in the session that writes about it. Read from the eCFR on 2026-09-16: "If there is not
sufficient continuous vertical space (i.e., approximately 3 in) to accommodate the required components of the
nutrition label up to and including the mandatory declaration of potassium, the nutrition label may be
presented in a tabular display". A permission, conditional on vertical space and on nothing about package
size. `fda/nutritionFormats.ts` quotes it and `formatIsPermitted` implements it. The sweep document that
"reached nothing" was built on a paraphrase that dropped the condition, so it never declared
`continuousVerticalSpaceInches`, and the rule refused it under (j)(13) as it should.

Kept rather than deleted, because acting on the old entry meant "fixing" one of the two, and the likeliest
fix removes the route that entitles a tall, thin, large package to the tabular display.

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

**~~Neither exemption rule knows which exemption it grants, so the conditions they put on the label go
unchecked.~~ Fixed** on `fix/exemption-conditions`, in three commits. The paragraph claimed is recorded —
`ingredientsExemption` and `nutritionExemption`, each a `kind` naming one paragraph — and every exempt pass cites
it and says what of it goes unchecked; a label saved with a bare flag is excused and advised rather than
cleared. (j)(13)(i)(A)'s line and (a)(1)'s statement are both declared, printed by the engine, required by a
rule, and named by the pass so that one which did not print withholds it. (a)(1) turned out reachable after
all: its common ingredients are listed and judged as any list, and where none is common to all packages only
the statement is owed. What either line says beyond the names it must carry is not judged. (j)(15) and (j)(14)
followed on `feat/egg-carton-and-unit-container`. Still open, below: the nutrition-claims condition most (j)
paragraphs share. What follows is the entry as it stood. `ingredientsExempt` and `nutritionFactsExempt` are booleans. Read from the eCFR on 2026-09-16:
§101.100(a)(1) excuses an assortment "on the condition that the label shall bear, in conjunction with the
names of such ingredients as are common to all packages, a statement … indicating by name other ingredients
which may be present". And 101.9(j)(13)(i)(A) says the manufacturer "shall provide on the label of packages
that qualify for and use this exemption an address or telephone number". No rule checks either, and (a)(1)
is not reachable at all. The exempt path requires an empty ingredient list, while (a)(1) keeps the common
ingredients listed, so an assortment claiming it goes down the ordinary path and is never asked for its
statement. Both passes now rest on the artwork, which is right, but a stamp cannot supply a check that does
not exist. The fix is to record which paragraph is claimed and check what that paragraph requires the label
to bear.

**~~101.9(j)(15)'s unit container is not offered, because its condition is a statement nothing checks.~~
Fixed** on `feat/egg-carton-and-unit-container`. The label declares which of the three wordings the unit
bears, the engine prints it from `fda/unitContainerStatement.ts` where the panel would sit, and the
completeness rule reads the printed statement back — its words against the wording claimed, its height
against (iii)'s 1/16 inch on the basis 101.2(c) incorporates from 101.7(h)(2) — and names it in the pass, so
one that did not print withholds the exemption. The 101.2(c) rule leaves the element to (iii), so one
dimension is not reported twice. The two conditions on the outer package are not checked. What follows is the
entry as it stood. Read from the eCFR on 2026-09-16: the unit containers in a multiunit retail package are exempt where the outer
package carries the nutrition information, the units are "securely enclosed within and not intended to be
separated from the retail package", and "each unit container is labeled with the statement 'This Unit Not
Labeled For Retail Sale' in type size not less than 1/16-inch in height" — with "individual" permitted in or
before "Retail", and no statement needed where the units bear no labeling at all. Offering the exemption
before the engine draws that exact text, and a rule measures it, would issue a pass on a label condition no
one reads. It needs the statement taken verbatim from the regulation, its two permitted variants, and a
height check at the 101.2(c) floor it shares. Left out of the exemption work on the scope agreed for it.

**~~(j)(14)'s egg carton is not offered, because its information moves beneath the lid.~~ Fixed** on
`feat/egg-carton-and-unit-container`. The carton declares where its information is presented and keeps its
`nutritionFacts`, which are still required and judged. The engine draws no panel on the outer carton and records a
detail omission, which withholds every pass about the panel's printed figures while the violations still report.
The exemption's own pass names the principal display panel and says that where and how the information is
presented is not checked. What follows is the entry as it stood.

(j)(14)'s egg carton is left out for the same reason, found by the review of the commit that recorded the
paragraphs — which had offered it. Shell eggs in a carton with a conforming top lid "are exempt from outer carton
label requirements where the required nutrition information is clearly presented immediately beneath the
carton lid or in an insert that can be clearly seen when the carton is opened". The information is relocated,
not excused, and this engine draws neither the underside of a lid nor an insert, so a pass saying no panel is
required would certify a declaration nothing printed.

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

**~~The small-package display route trusts a typed area that the label and its panel rule out.~~ Fixed** on
`fix/small-package-display-floor`. One helper, `labelingSurfaceFloor` in `geometry/pdp.ts`, takes the larger of
the label's area and the principal display panel's, and `smallPackageRouteApplies` and `formatIsPermitted` let it
overrule a smaller declared figure. It reached further than this entry said. Three things turn on that route,
and all three trusted the typed area: the format entitlement; the display chosen, and so the Calories numeral
and servings statement the engine draws and the type-size rule accepts — 14 point where (d)(11)'s tabular
display needs 22, on a 44.64 in² label with 5 in² typed; and the (b)(12)(i)(A) second-column exemption, a
`document` pass, which excused a mandatory second column on the same label. The engine and every rule compute
the floor the same way, and the (j)(13)(i) exemption now uses the same helper. What follows is the entry as it
stood. Found by the
`high` review of PR #34, and reproduced. The 101.9(j)(13)(i) exemption now refuses a package whose label or
principal display panel is itself 12 in² or more, since each is a floor under the surface available to bear
labeling. The (j)(13)(ii) display route in `fda/nutritionFormats.ts` — `smallPackageRouteApplies` and
`formatIsPermitted` — reads the same declared `availableSurfaceSqInches` with no such floor. On
`US_FOOD_CONFORMANT`'s 120 × 240 mm label, whose panel is also 44.64 in², a panel declaring
`availableSurfaceSqInches: 5` and `format: 'tabular'` returns `FDA_NUTRITION_FORMAT_MET`, "A package of 5.0 in²
may present its nutrition information in a tabular display". The sweep's "tabular display, small package"
permission document is built exactly that way. The fix is the same floor, applied where the entitlement is
decided, with that document moved onto a small label and container. Not done in that PR because the file is
outside it, and the display type sizes that follow from the route need re-checking with it.

**No rule models nutrition claims, so the condition most 101.9(j) exemptions share goes unchecked.** (j)(1),
(2)(i)–(iii), (3), (4), (10), (13)(i) and (18) each hold only while the food "bears no nutrition claims or other
nutrition information in any context on the label or in labeling or advertising" (read from the eCFR on
2026-09-16). This project has no representation of a claim — 21 CFR 101.13 and 101.14 are unmodelled — so every
one of those passes says the condition is not checked, and none can be withdrawn when a claim appears. The
same gap already keeps (c)(2)(i), (c)(3) and (c)(6)'s "if no claims are made" relaxations unapplied. Modelling
claims, even as a declared list the label prints, is a piece of work of its own; "or in labeling or
advertising" reaches beyond the label and could never be checked here at all.

**~~`FDA_SERVING_SIZE_MET` names a row the engine never omits.~~ Fixed** on
`fix/passes-rest-on-what-printed`. The rule now declines unless the panel and the row both `wasFullyDrawn`.
Because omissions name the panel, that also withholds it where the row printed and something below it did
not — stricter than it needs to be, never looser, and how every other pass on the panel already behaves. The
engine records a Nutrition Facts panel
running past the bottom of the stock against `food-nutrition-panel`, and never against its rows. On
`US_FOOD_CONFORMANT` on a 120 × 25 mm label, the panel begins at 16.8 mm, the serving-size row prints at
32.2–36.0 mm (wholly below the edge), and the only omission is `food-nutrition-panel/detail`. `runRules`
still returns "The panel declares a serving size of …". The stamp is right; the id is out of the guard's
reach. The same shape as the panel type-size entry above. Reproduced 2026-09-16.

**~~`FDA_ALLERGEN_DECLARED_MET` names the ingredient list, and can rest on the Contains statement instead.~~
Fixed** on `fix/passes-rest-on-what-printed`. The rule now learns which element declared each source and
declines its pass unless at least one of them printed in full. It declines rather than reporting the allergen
undeclared, because the omission is already the finding.
Found by the `high` review of PR #28 and reproduced. §403(w)(1) is satisfied by either form, and the rule
searches both printed texts — but the pass always names `food-ingredients`, and the engine still emits text
primitives for a block it records as off the label. On `US_FOOD_CONFORMANT` with the almond ingredient renamed
`nut paste` and `declareInline: false`, on a 120 × 158 mm label, the Contains statement begins at 159.8 mm and
is recorded as an `element` omission, the printed list never names almonds, and `runRules` still returns
"almonds is declared." `FDA_CONTAINS_TYPE_MET` beside it is correctly withheld. The artwork stamp is right; the
pass names the element that did not make the declaration. The fix is to name, or require `wasFullyDrawn` of,
whichever element's text discharged it — the same shape as the serving-size, panel type-size and
pictogram-set entries, which are worth fixing together.

**~~A declared allergen whose only declaration is cut off gets no allergen finding at all.~~ Fixed** on
`fix/unconfirmed-allergen-declaration`. The rule now raises `FDA_ALLERGEN_DECLARATION_UNCONFIRMED`, an
advisory under §403(w)(1), for each ingredient whose source is declared only in elements with an omission
recorded against them. It names the source and points at the declaring element, and the pass stays withheld.
It is not "not declared" for the reason below, and it does not block export: it makes the lost declaration
visible rather than stopping it shipping. Because `wasFullyDrawn` counts any omission, it also fires where the
source did print — a Contains statement whose only omission is an entry no ingredient carries, or the
163.15 mm case below — so its message says an omission is recorded, never that the text went unprinted. The
first wording said "did not print in full"; the `high` review of PR #31 found that false in a state the editor
keeps on purpose, where clearing an ingredient's allergen leaves its Contains tick and the statement prints
whole. Telling those cases apart is the open entry that follows this one. What follows here is the entry as it
stood.
Found by the `high` review of PR #29 and reproduced. Since that branch, the allergen rule declines its pass when every element
declaring a source has an omission, and reports nothing in its place. Where the statement is wholly off the
label, the `element` omission says so plainly. Where it is only cut, the omission is `detail` — on
`US_FOOD_CONFORMANT` with the almonds renamed `nut paste`, a 161.74 mm label puts "Contains: almonds." on a
baseline at 162.77 mm — and the only explanation is "runs past the bottom", which names no allergen. No pass
is issued, so it is not a false clearance, **but it can ship.** Export is refused only for `element`
omissions (`blockingOmissions`). The firm, drawn below the statement, is one — but only when the label has a
firm. Without one, `FDA_RESPONSIBLE_FIRM_MISSING` is reported, and a blocking *finding* only asks the editor's
user to confirm before exporting, so the PDF goes out with the declaration cut off and no allergen finding.
A first draft of this entry said export was always blocked; the review of it read `usFoodEngine` and found
the firm is drawn only when present. A missing allergen declaration is the most consequential thing on a food
label to leave unnamed, and "not declared" cannot simply be raised instead: the
omission is per element, so the rule cannot tell whether the lost line held the source. The reverse also
shows: at 163.15 mm the whole line prints and only its line box overhangs, and the pass is withheld anyway.
Deciding this needs omissions that say which lines were lost, or an advisory finding that says the
declaration could not be confirmed on the label. The advisory is a new code with a citation and a fixture, so
it is a change of its own.

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

**~~`usFoodEngine` records nothing for a word that runs off the right edge.~~ Fixed** on
`fix/engines-record-what-runs-off`. The statement of identity, measured in the SemiBold face it prints in, and
every block `stackText` draws now record a `detail` omission when their widest line runs past the stock, or
an `element` omission when they begin past it. The
face resolution is shared with the GHS engine as `measuredFamilyFor` in `text/measure`. What follows is the
entry as it stood. Found while fixing the same gap in
the GHS engine, and reproduced. `wrapTextMm` never breaks inside a word, and the engine's bounds checks look at
the bottom edge alone — only the net quantity declaration is checked across. On `US_FOOD_CONFORMANT` on a
60 mm label, a statement of identity of "Supercalifragilisticexpialidociousgranola" is set as one line whose
right edge is 114.8 mm, nothing is recorded against it, and `FDA_STATEMENT_OF_IDENTITY_MET` still clears. A
live false clearance, and the fix is the one `layOutGhsLabel` now has: measure each block's widest line
against the stock, for the stacked blocks and the statement of identity's own loop — in the face it prints
in, since the statement of identity is bold.

**~~A margin as wide as the stock describes no panel, and all three engines accept it.~~ Fixed** on
`fix/margin-leaves-no-panel`, decided as a `LayoutError`. All three engines now refuse a margin that leaves
the panel zero or less in either dimension, through one shared `assertMarginLeavesPanel`. Zero rather than a
minimum usable panel, because no source publishes one. Reproducing it before the decision corrected the
sentence below that nothing ships: that holds for a margin wider than the stock, but at exactly half the width
it does not. On `GHS_CONFORMANT`'s 74 mm stock a 37 mm margin left a panel no width at all, the statements ran
up to 74.79 mm past the right edge as `detail` omissions only, and nothing blocked export — while 36.99 mm was
refused. In the three cases whose passes were checked against the drawing — US food at a 125 mm margin, GHS at
37 mm, UPC-A at 65 mm — every pass that survived named ink that did print, so none of those was a false
clearance.
The refusal costs a centred UPC-A, which lands in the middle of the label even on a negative panel. The
omission branches for a symbol or block wholly off the label are kept, though no accepted stock reaches them.
What follows is the entry as it stood. Found reviewing the
right-edge checks on `fix/engines-record-what-runs-off`, and reproduced. Every engine requires only a finite,
non-negative margin, so `{ widthMm: 60, marginMm: 65 }` resolves a panel of negative width, and anchors then
place elements wholly off the label. That branch made each engine record such an element as an `element`
omission, so no empty label exports — except that `usFoodEngine`'s net quantity check, which predates it, still
files a declaration wholly outside the label (x 65.0–153.1 mm on a 60 mm stock) as a `detail`. Nothing ships
because of it: under that margin every stacked block also begins off the label and blocks export. But the
honest answer to such a stock is probably a `LayoutError` — "input that describes no drawing at all" — which
would make every one of these cases unreachable rather than handled one by one. A decision about the engines'
contract, not a fix to make in passing.

### What reading the GHS provisions turned up

**~~The GHS engine records no omission for a block drawn off its stock, so no GHS pass about text can be
withheld.~~ Fixed** on `fix/engines-record-what-runs-off`. `layOutGhsLabel` now records what `usFoodEngine`
does for every stacked block — an `element` omission for one that begins past the bottom edge, a `detail` for
one that runs past it — including the statements, which it draws by its own loop, and each pictogram. It checks
the right edge too, for pictograms and for text, since the wrapper never breaks inside a word. Both reproductions below are laid out for real
in `certification.test.ts`. An `element` omission blocks export, so a GHS label with a block wholly off its
stock is now refused by the export route, as a US food label already was. What follows is the entry as it
stood. `layOutGhsLabel` stacks its blocks top to bottom and, by design, clamps nothing — but unlike
`usFoodEngine` it records nothing either. On `GHS_CONFORMANT`'s data and a 60 × 6 mm stock the signal word's
baseline sits at 13.4 mm, wholly below the edge, and `GHS_SIGNAL_WORD_SINGLE` still reports "The label carries
one signal word, “Danger”". The realistic case is the small container. A US 50 ml container invoking
(f)(12), on a 50 × 25 mm label, prints its outer-package statement at 34.3–41.3 mm and its manufacturer at
43.3–49.8 mm — both wholly off the label — and its only pictogram at 18.1–32.3 mm, more than half off. The
only omission recorded is the missing glyph. `runRules` returned `GHS_SMALL_CONTAINER_COMPLETE`, "The container
carries everything the small-container provision requires of it", beside `GHS_PICTOGRAM_SET_MATCHES` for the
half-printed strip, while the manufacturer's name and telephone and the outer-package statement — three
entries on the rule's own list — are not on the label. Reproduced 2026-09-16. **Both passes are now withheld by
their own rules** — but on this label only because the glyph is missing. The small-container rule also gates
on the supplier and the outer-package statement printing, and that gate had nothing to act on until this
engine recorded the omission. It is the GHS sibling of the GS1 off-stock entry
below, and `usFoodEngine`'s bounds check is the precedent for the fix.

### What reading the GS1 provisions turned up

**~~A UPC-A drawn off its stock clears bar height and its digits on ink that is not on the label.~~ Fixed** on
`fix/engines-record-what-runs-off`, as an omission from the engine rather than a gate in the two rules.
`layOutUpcALabel` records a `detail` omission against the symbol when its ink runs past any edge, or an
`element` omission when it lies wholly outside the label — the bars,
and the digits the quiet zones carry, measured from the primitives. The guard then withholds every pass
measured off the symbol, magnification included, and the check digit stands. What follows is the entry as it
stood. On
100 × 20 mm stock — the document `rules.test.ts` already uses for vertical overflow — the nominal symbol
starts at y −3.85 mm. That puts 3.85 mm of its 22.85 mm bars above the top edge, and the digits' baselines at
23.85 mm, below the bottom one. `runRules` returns four passes and nothing else, among them
`GS1_BAR_HEIGHT_SUFFICIENT`, "The bars are 22.85 mm, meeting the 22.85 mm minimum", and `GS1_HRI_PRESENT`,
"The symbol prints 036000291452 beneath the bars", with every digit off the label. The quiet-zone rule
declines to certify this symbol through `certifiable`; the two rules beside it never learned to. Neither
`certifies` answer reaches it, because the engine records `verticalOverflowMm` on the symbol and no
omission, so the guard has nothing to look up. A live false clearance, reproduced 2026-09-16. The fix is a
containment gate in the two rules or an omission from the engine, and choosing between them decides whether
magnification — still measurable on the part that did print — is withheld with them.

**~~Two GS1 rules keep no reading of their source.~~ Fixed.** Both primary sources were fetched on 2026-09-17
and both rules now cite by release and section, with the reading recorded in the module note.
`gs1/gtin-check-digit` and `gs1/checkDigit.ts` cite **GS1 General Specifications Standard, Release 26.0
(Ratified Jan 26), §7.9.1 and table 7-8**, from https://ref.gs1.org/standards/genspecs/ — page 544 read as a
rendered image rather than a text extract. `gs1/digital-link` cites **GS1 Digital Link Standard: URI Syntax,
Release 1.7.0 (Ratified Aug 2026) §4**, from https://ref.gs1.org/standards/digital-link/uri-syntax/, with the
alphas finding moved from a bare "1.3.0" to **§4.1 of the release in force**, which names the removal and dates
it. §2 settles that §4 is the right primary clause: "The core of this standard is expressed using ABNF grammar
[RFC 5234] in section 4 such that conformance can be determined with certainty."

`geometry/symbol.ts` was re-read in the same commit rather than left citing 25.0, so the repository does not
quote two releases of one standard. **Every figure in it was unchanged** — 0.330 mm nominal, the 0.264/0.660
bounds behind `MIN_MAGNIFICATION` and `MAX_MAGNIFICATION`, UPC-A's 113 modules including quiet zones, the
9X/9X and 11X/7X quiet zones, the 22.85 and 18.23 mm heights — and every quotation still matches word for
word. **Three table identifiers were wrong**, recorded as "figure 5.2.3.4-1", "figure 5.2.3.5-1" and "figure
5.12.3.1-1" where the standard numbers them **tables 5-11, 5-12 and 5-44**.

Three things worth keeping from the reading:

- **The standard contradicts itself about the alphas' deprecation release.** §4.1 says "marked as deprecated in
  version 1.2 of the standard"; the change log at §8.2 says "deprecated in version 1.2.0". The message follows
  §4.1 because §4.1 is what it cites, and `gs1/digitalLink.ts` records both. Nothing turns on it: the removal
  release is 1.3.0 in each.
- **Checked and not a defect.** URI Syntax 1.4.0 requires a GTIN expressed as 14 digits — "the value of a
  GTIN-8, GTIN-12 or GTIN-13 SHALL be prefixed with leading zeroes ... to reach a total of 14 digits".
  `buildDigitalLinkUri` already routes AI `01` through `normaliseToGtin14`, so it conforms. Its docblock example
  did not, showing the removed `/gtin/` alpha, and was corrected.
- **Still open, deliberately.** The resolver-domain check rests on §4.11's `scheme = "http" / "https" / "HTTP" /
  "HTTPS"` production specifically, not on §4 generally, but it shares `GS1_DIGITAL_LINK_INVALID` and its
  citation with every rejection `buildDigitalLinkUri` makes. Splitting it into its own citation wants a fixture
  for a bad domain separate from the one for a bad AI value, and is worth doing when one is written.

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

**~~`GhsRequest` validates a `us-osha` label's statement codes against the EU table.~~ Fixed.** See
`CHANGELOG.md`. The premise that the two were “one problem” and needed the same fix turned out to be wrong,
and that is the part worth keeping: transcribing Appendix C.4 was never required. An enum could not be made
regime-correct at all — it is built at module load and a correct one would be empty under `us-osha`, which
`z.enum` cannot express — so the fix was to stop using one and ask the table the same question every other
layer asks. The transcription is still wanted, and it is now an independent piece of work rather than a
blocker.

**Changing the market does not clear the statement codes chosen under the old one.** `GhsFormRail`'s Market
control is a plain `v-model="data.regime"`, so choosing EU, picking `H225`, and switching to US OSHA leaves
the code on a label whose regime has no text for it. Three clicks. The rail no longer *captions* it out of the
wrong regulation — that was the defect fixed here — but the code is still there, the engine will record an
omission for it, and the export route will now refuse the label outright.

Not fixed here because what should happen is a real question rather than an oversight. Silently dropping a
user's chosen statements when they change a dropdown is its own kind of data loss; keeping them and reporting
the label is honest but obstructive; the audit confirm screen's answer — show them, mark them uncarriable,
carry the rest — is probably the right shape and is a piece of interface work rather than a guard.

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

**~~A combination code carrying an optional member cannot be matched.~~ The entry that stood here was wrong,
and its own suggested fix would have printed regulatory text nobody asked for.** It said a label printing
`P370 + P380 + P375` — correctly, having not used P378 — resolved to nothing. It does not:
`'P370 + P380 + P375'` is **its own key** in `EU_CLP_PRECAUTIONARY_STATEMENTS`, with its own text, sitting two
lines above the bracketed one. Both resolve. The claim was written from reading the bracketed key and
inferring the rest, which is the shape this file keeps having to correct.

It matters because the fix it proposed — “a lookup that understands the bracket” — reads naturally as mapping
the un-bracketed code onto the bracketed entry. That would append “[Use … to extinguish].” to a label that
never carried P378: this project generating regulatory text, which is the one thing it exists not to do.

**The standing questions are answered.** One key in 199 carries a bracket, and it is that one. It has an
un-bracketed twin, and no other bracketed key does, because there is no other bracketed key.

**What is actually unmatched is the opposite case**, and it is small. A label that *did* use P378 and printed
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

**~~Whether `detach()` could lose work at `/labels/new` without an audit is unchecked.~~ Walked in a browser;
the answer is no, and the walk found a different defect that is now fixed.** See `CHANGELOG.md`. Editing at
`/labels/new`, leaving, returning and leaving again prompts every time: `savedId` is null throughout that
route, so the watcher's `detach()` had nothing to let go of and the phase 7 guard covered it.

**What the walk found instead was `detach()` itself, on the path nobody had asked about.** It rebased the
baseline onto the document in front of it, so an edit made before detaching stopped counting as unsaved.
Reachable by switching the label type on an edited saved label — no audit, no route change, two clicks — and
the leave guards then said nothing at all. Fixed by leaving the baseline where it is, with the type watcher
deciding the one case where a switch makes the comparison meaningless.

**The methodology note is the part worth keeping.** The original probe “did not hold” for a reason, and the
reason was in the harness rather than in the application: the test router's initial navigation is a promise,
so mounting without awaiting `isReady()` runs the route watcher against the empty starting route first — a
trap `EditorSaveView.test.ts:29-33` already documents. “It proved nothing” was the right verdict and the wrong
stopping point; ten minutes in a browser settled what a second jsdom probe would not have.

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

