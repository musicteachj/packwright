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

**The rail's required numeric fields have the unguarded-blank shape.** `v-model.number` hands back the string
when `parseFloat` gives NaN, so clearing a box writes `''` into the document. The two *optional* numbers were
fixed — blank means unset, which is a thing the regulation permits. The container and stock dimensions are
required, so a blank has no defined meaning, and the fix is a design question rather than a guard: retaining
the last value snaps the digits back mid-edit, which is worse than the bug for anyone clearing a field to
retype it. Sites: `UsFoodFormRail.vue` container width/height/circumference/surface area and stock
width/height/margin.

**The default document reads `almonds (almonds)`.** A review flagged it; `EditorUsFoodView.test.ts` asserts it
on purpose, as "belt and braces — the parenthetical in the list and the statement after it". Both are right:
carrying both declarations is realistic, and demonstrating it on an ingredient already named for its own food
source is degenerate. An ingredient whose name does not reveal the allergen — the classic being
`marzipan (almonds)` — would show the feature earning its place. A content decision about the seeded
document, not a correctness fix.

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
