# Backlog

> **Frozen until Phase 8 is deployed (James's decision, 2026-10-17).** This file is a record of why things were
> not done, not a plan of what to do next. Until then, a finding gets work only if it is a false clearance, a
> citation that does not say, or cannot be shown to say, what the finding claims, a crash, data loss or a
> security hole. Anything else gets
> one line here at most, and nobody offers an entry as the next piece of work. Where a section below calls an
> entry worth doing, schedulable or a chore to do first, this notice governs. The file was pared down from 1,802
> lines to 888 on 2026-10-09 (`a422483`) and had grown to 1,242 eight days later, every review adding to it, and
> a file this size reads as a to-do list whatever its header says. Once Phase 8 is deployed it is decided once:
> the few entries worth doing move to a short list of their own, and this file is archived where the code
> comments that point into it still resolve.

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
provision that does not say what the finding claims. **None outstanding.** The last, the editor's Digital Link passing
what the parser refuses in a resolver domain (found by `/code-review high` on #97), was fixed on 2026-10-17 by judging
the link it builds with the printed path's code. The two before it were fixed on 2026-10-16
(`CHANGELOG.md`): `gs1/digital-link` passing a GS1 value whose symbols are not percent-encoded as URI Syntax 1.7.0
§4.2 writes them, and a configured resolver domain ending `#x` passing as a conformant Digital Link, the second found
by the medium review of dev and the first while fixing it. Before them, `check_label` passing type
sizes, placements and barcode geometry the engine chose itself (found by `/code-review high` on #86), was fixed on
2026-10-11 (`rules/described.ts`, `CHANGELOG.md`). The MCP evaluation of 2026-10-10
found two — `check_label` passing a label size nobody gave it, and `GHS_PICTOGRAM_NOT_REQUIRED` giving a reason its
citation contradicted — and both were fixed the same day (`CHANGELOG.md`). The one before them, `ghs/pictogram-set`
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

**None outstanding.** The last, `check_label` passing values the engine chose itself, was fixed on 2026-10-11: on a
label printed elsewhere nothing passes on a value the request did not state (`rules/described.ts`). The two before
it, found by the MCP evaluation of 2026-10-10 — `check_label` reporting every
pictogram as having no symbol, and text set at Packwright's own type sizes as "not printed", both about
Packwright's drawing rather than the user's label — were fixed on 2026-10-11: a label checked through `/mcp` or
audited from a photograph is judged as one printed elsewhere (`LabelSubject`, `CHANGELOG.md`). The evaluation's
two must-fix findings were fixed on 2026-10-10.

The five pinned on 2026-10-08 were fixed in PRs #71 to #73: `ghs/pictogram-set` citing the EU on US labels, the
assortment order check, the hand-set type size, the "exempt" status beside a printed panel, and statement codes
kept through a change of market. Their history is in `CHANGELOG.md`.

The deployment checklist (pre-#65 seeded zeros, the first schema change needing a migration, per-process quotas,
edge-level limits, `/mcp`'s configuration) is in `docs/DESIGN.md` § Phase 8, with James's decision on each
recorded beside it (2026-10-11). Unknown routes answered 200 was fixed on 2026-10-11.

---

## From the re-checks of 2026-10-12

**CLP gives P103 two English texts, and Packwright prints the older. Decided 2026-10-16: keep Part 2.** Annex IV Part 1,
Table 6.1 reads "P103 Read carefully and follow all instructions." since Commission Regulation (EU) 2019/521 replaced
that entry; Part 2's English wording, which the same act did not amend, still reads "Read label before use."
`ghs/statements.ts` takes its P-statement texts from Part 2, by design (its module note), so an EU consumer label that
needs P103 is printed with the Part 2 wording. Both texts are the regulation's own, so neither is a paraphrase; which
one a label should carry is the question, and it is the kind this project does not settle by guessing. Read on
2026-10-12 from the consolidated text in force (02008R1272-20260701) and from 2019/521. Found by a grader of the
second re-check (`docs/experiments/2026-10-12-mcp-recheck-sizeless/`). **The comparison of every code was done on
2026-10-16** (`docs/CLP-P-STATEMENT-TEXTS.md`): 18 codes differ between the parts, four in words (P103, P280,
P336, P410 + P412), one in spelling (P301 + P312, CENTER against CENTRE), one in a choice slash (P250), one in
capitalization and eleven in punctuation, spacing or the degree sign; P503 is in Part 1 only, and one bracketed
combination is keyed differently. **James's decision, 2026-10-16: the engine keeps printing Part 2**, because
Article 22(4) says the statements "shall be worded in accordance with Part 2" and Part 2 is the only part with
every language; a label carrying Part 1's wording is not to be reported, because Annex IV's introduction, as
2019/521 replaced it, permits "minor textual variations". P280 is the exception that is more than wording (Part 1
adds "hearing protection"), and `docs/WHAT-IS-NOT-CHECKED.md` tells a user so. Still open from it: offering Part
1's P280 as a choice, which belongs with the undisclosed P-statement selection. (`ghs_statement_text` on `/mcp` has
said since 2026-10-16 that its text is Part 2's and that Part 1 words 18 statements differently.) A search on 2026-10-16 found no act,
corrigendum or official note reconciling the parts; ECHA's labelling guidance, which might, could not be fetched
(echa.europa.eu blocks automated requests).

**P503's spacing cannot be settled from the sources this project can fetch.** The XHTML of the consolidation in
force reads "Refer to manufacturer/ supplier/… for information on disposal/recovery/ recycling", with a space after
two of the slashes; the engine prints none, following the rule its module note records for line breaks after a
slash. The PDF breaks the line at both of those slashes, so it cannot say. P503 is in Annex IV Part 1 only, so
there is no Part 2 text to compare. Left as it is, since the Official Journal's own typesetting is the only thing
that would decide it. Found by the Part 1/Part 2 comparison of 2026-10-16; the eight other spacing faults it found
were fixed the same day (`CHANGELOG.md`).

**A statement can now wrap only at a space, so `CENTER/doctor/…` is one unbreakable word.** Removing the eight
spurious spaces (#93) took away the break point before the ellipsis, and `wrapTextMm` breaks on whitespace only. On
a narrow panel a line that used to wrap there now runs long. It is not silent: the GHS engine records a word wider
than the panel as a right overrun, so nothing is counted as printed that is not. The regulation's own PDF breaks
lines after a slash, so allowing a break after `/` in `text/measure.ts` would be typographically sound; it changes
every wrapped line that contains a slash, so it is a `layout/` change with its own review. Found by
`/code-review medium` on #93.

**The comparison that certifies the statement table is not in the repository.** The module note of
`ghs/statements.ts` says every Part 2 text was compared by script with the XHTML in force, and on 2026-10-16 it
was, but the extractors and the comparison lived in `/tmp`. Nothing re-runs them, so the next unforeseen kind of
extraction artifact passes CI the way these eight did. Checking in the two extractors and a normalized Part 2
extract, with a test that the table matches it, would replace one regex per defect found with a check of the
whole table. The extract is a copy of the regulation, so it would need its own provenance note and a re-fetch
whenever a new consolidation is read. Found by `/code-review medium` on #93.

**A model can still invent a barcode magnification, and the prompt is the wrong place to stop it.** The server's
`instructions` say never to send a label size the user did not give, and since 2026-10-16 Haiku 4.5 does not (0 of 42
in `docs/experiments/2026-10-16-mcp-recheck-instructions/`, against 3 of 21 before). In two of those answers it sent
`magnification: 1` instead, which no prompt gives, and `check_label`, which judges a stated magnification as stated
(stage 23), passed it. A wording naming every value the tool takes on trust (size, margin, magnification, bar height,
the digits, the food facts) was tested the same day (`docs/experiments/2026-10-16-mcp-recheck-measurements/`): it
stopped the magnification, and three Haiku answers asked for the size instead of checking, against none, with two
planted defects missed. James decided not to ship it. **Done in the tool on 2026-10-16:** the schema's own
descriptions of `magnification` and `barHeightMm` say each is sent only when the user stated it. The fifth re-check
(`docs/experiments/2026-10-16-mcp-recheck-tool-side/`) found no invented magnification or bar height in 42 Haiku
answers and no answer asking instead of checking. **Still open:** one answer there invented a label size and told
the user it "meets the minimum", which no check can tell from a stated size; and one put the printed Digital Link in
`artwork.text` instead of `digitalLink`, so nothing judged it. Both are the model's, one in 42 each.

**A Digital Link as printed has two questions this tool leaves open.** Since 2026-10-16 `check_label` takes the link
exactly as printed and `gs1/digital-link` judges the string (`parseDigitalLinkUri`). It withholds the pass, as a
limit, where the link carries another GTIN than the barcode's, or something its tables cannot place. Each could become
a finding with reading: whether GS1 requires a label's Digital Link to carry its barcode's GTIN (James's decision of
2026-10-16 was no pass until the text is read); and the rest of URI Syntax 1.7.0's path grammar, of which this build
holds the GTIN's qualifiers (22), (10) and (21) only, so a UPUI path's (235) or a GLN's path stands down rather than
being judged. A third, a GTIN in fewer than 14 digits, became a §4 violation on 2026-10-17 (James's decision, on
`/code-review high` of #97): §4.5's `gtin-value = 14DIGIT` is in the grammar §4 cites, so it needed no citation of its
own.

**An empty host in a Digital Link is a limit, and RFC 9110 may make it a fault.** URI Syntax 1.7.0 §4.11's `reg-name =
*( … )` allows an empty host, so faulting one under §4 would cite the grammar against what it permits, and James
decided on 2026-10-17 to keep it a limit. Two `/code-review high` rounds on #97 cited RFC 9110 §4.2.1, which they
quote as "A sender MUST NOT generate an "http" URI with an empty host identifier". That would be a finding under a
citation the rule does not yet carry, so it needs RFC 9110 read in the session that writes it, a citation added beside
§4 and §4.1, and a fixture.

**The convenience alphas are an advisory, and a short GTIN a violation, though both are non-conformant.** URI Syntax
1.7.0 §4.1, read 2026-10-17, removes both from the grammar together, and its "Important" note calls them alike "legacy
expressions" that "only existing infrastructure ... SHOULD continue to support". That note is about readers, not about
what a label may print, and the alphas' own advisory already says the URI "is non-conformant to the current standard".
So the short GTIN is rightly a violation under §4, and the alphas' advisory severity, which predates #97, is the
inconsistency. Raising it to a violation is a change to what the rule reports, so it is James's to decide. Found by
the per-commit review on #97.

**Query parameters that are not GS1's are judged as URI text, not by their own grammar.** Since 2026-10-17 every
parameter must have a key and an "=", one not judged as a GS1 attribute must be text RFC 3986 §3.4 allows, and a pass
names such parameters, so `?x=<script>` and `?foo` are faults; until the sixth `/code-review high` on #97 found them,
both passed as conformant. What remains is URI Syntax 1.7.0 §4.10.1's own grammar for an extension, `extensionKey = *(
DIGIT ) everythingExceptDigitsAndEquals *( DIGIT / everythingExceptDigitsAndEquals )`, which is narrower than RFC
3986; its reserved keywords `linkType` and `context`, which it says "SHALL NOT be used except as defined" in the
GS1-Conformant Resolver Standard, not read here; and a key that decodes to a removed convenience alpha, `%67tin`,
which a resolver normalizing it reads as `gtin`, an AI code in no release since 1.3.0. Left for the §6.1 stage below,
since an extension parameter is the link owner's data and none of these can now pass a string that is not a URI.



**A printed Digital Link the parser refuses loses the limits it would have said.** `parseDigitalLinkUri` throws on
the first thing the grammar refuses, and what it had listed in `unplaced` by then, such as an empty host,
goes with it, so the finding stands alone where `docs/WHAT-IS-NOT-CHECKED.md` says a limit is said in the finding's
own words. Found by the per-commit review on #97, 2026-10-17. Nothing passes on account of it, since the refusal is a
violation; the fix is for the parser to return its refusal beside what it placed rather than throw, which changes its
contract for every caller, so it waits for a reason to touch the parser again.

**The editor's Digital Link beside a refused field is judged by a stand-in.** Where `buildDigitalLinkUri` refuses a
field, `gs1/digital-link` builds a second link from the fields `validateAiValue` passes and judges that, so what the
rest of the link carries is still said. Its findings measure a URI the user never configured, one without the refused
field, and the `sound` filter is a second copy of the builder's own checks. Found by the fourth `/code-review high` on
#97, 2026-10-17. Nothing passes on account of it, since the refusal is itself a violation. The cure is the entry
above: a builder and a parser that return every refusal beside what they placed, rather than throwing on the first,
would leave nothing for a stand-in to do. The same change would let the parser's qualifier loop and its reading of
`PATHS` become one walk over the grammar, which the same review asked for; the two now share one table
(`QUALIFIER_ORDER` is taken from `PATHS`), so they cannot drift on data, only in code.

**Recognize a Digital Link by the standard's own §6.1 procedure, before extending the hand-written parser again.**
Worth a stage of its own before deployment. Six review rounds on #97 (2026-10-16 and 17) each found another corner of
URI Syntax 1.7.0's ABNF that `parseDigitalLinkUri` did not cover: hosts, percent-encoding, which key opens the path,
encoded query keys, then fragments and empty query parameters. The parser is a hand-written partial recognizer of the
grammar, and reviewers keep finding the parts not yet written. §6.1, "Recognising a GS1 Digital Link URI", read
2026-10-17, offers two things, and neither is a full recognizer. Its regular expressions are a gate only: §6.1.3 says
a string matching RE1 "plausibly is an uncompressed GS1 Digital Link URI", and one matching none "definitely is not a
conformant GS1 Digital Link URI", so RE1 could refuse with a citation what fails it, but cannot pass anything. §6.1.4
points to the GS1 Barcode Syntax Resource, which "validates the GS1 Application Identifiers and their associated
values" but "does not aim to address all possible validation scenarios". The stage would read both, decide whether RE1
should guard the parser and whether the Syntax Resource (its license, and `label-core`'s rule of importing no
framework) can judge the AI values, and replace what of the hand-written recognizer they cover. Recorded against it,
from the fifth `high` review on #97, as clean-ups the same change would make: the optional marker on a `PATHS` step
parsed three ways; `leniently` and `decoded` as two wrappers of one decode; the GTIN's shape restated in `valueFits`
beside the builder's check; each candidate's key, value and path computed two or three times, and `faultOf` re-running
`readFrom` for a message; the query sorting AIs into keys and attributes by the AI table's flags rather than by
`PATHS`, so `?414=` is an attribute while `?00=` is not (the standard's `queryStringParam` does list a GLN parameter,
so that one passes rightly); and the values of a key's components this build does not hold, (254), (8011), (8019),
(7040) and (8020), judged by §4.2 but not by their §4.6 formats.

**`buildDigitalLinkUri` accepts any resolver domain; only the rule judges it.** Since #97 `gs1/digital-link` judges
the configured domain with `judgeCustomUriStem` before building, but the builder itself still returns a URI for
`javascript:alert(1)` or a domain ending `#x`. Found by the eighth `/code-review high` on #97, 2026-10-17. Its one
other caller is the experiment harness's prompt builder (`apps/api/src/experiments/withoutTool/prompt.ts`), not the
product, so nothing a user sees passes on account of it. Moving the stem check into the builder would cover every
caller and let the rule drop its own; it belongs with the §6.1 stage, which will touch both.

**The MCP test's fallback URI does not percent-encode.** `asCheckLabelTakesIt` in `apps/api/src/mcp/server.test.ts`
puts the URI together by hand where `buildDigitalLinkUri` refuses the fields, without encoding the lot or serial. A
sweep document with `/`, `?` or `#` in its lot would give the printed side a different fault from the configured side,
and the equality check would compare two defects. Latent: no sweep document has such a lot. Found by the same review.
The same fallback strips a domain's trailing slashes with `domain.replace(/\/+$/, '')`, which turns `https://` into
`https:`, where the builder now uses `withoutTrailingSlashes` (found by the sixth `high` review on #97); a sweep
document with an empty host and a refused field would compare two different defects.

**The experiment harness can pass its spend cap.** It checks the cap before starting each conversation, with four in
flight, so a study can end above it by up to four conversations' cost, about $0.30 at the worst seen. Every study so
far has ended well under its cap. Bounding it means counting what is in flight against the cap before starting
another. Found by `/code-review medium` on the third re-check's harness change.

## From the MCP evaluation, 2026-10-10

Found by grading 144 answers in `docs/experiments/2026-10-10-mcp-with-and-without/`, and each confirmed by the lead
against the code and the record. Two were must-fix and were fixed on 2026-10-10 — `check_label` now refuses a
label whose size it is not told, and `GHS_PICTOGRAM_NOT_REQUIRED` cites Article 26 where Article 26 is the reason —
and the two false findings about a user's label, the empty pictogram frame and text "not printed" at Packwright's
own type sizes, were fixed on 2026-10-11. Their history is in `CHANGELOG.md`. What is left is below.

**CLP gains a minimum type size on 1 January 2028, and nothing can check it yet.** Regulation (EU) 2024/2865,
Annex I point (2), replaces Table 1.3 with one carrying a minimum x-height by package capacity (1.2 mm up to 0.5 L,
1.4 mm to 3 L, 1.8 mm to 50 L, 2.0 mm above), and point (3) adds 1.2.1.5: lines at least 120% of the font size
apart, one easily legible sans-serif face, black on white. Regulation (EU) 2025/2439, Article 1(c), inserted
2024/2865 Article 2(3a), putting both back to 1 January 2028. All three read from the EU Publications Office on
2026-10-11. A GHS document carries no type sizes and Packwright sets its own, so neither the editor nor
`check_label` can judge this today. **Before 2028-01-01**, add type sizes to the GHS document and a rule on them,
with the 120% line spacing (`GHS_TYPE_DEFAULT.lineHeight` is 1.35) and the ≤0.5 L band split that the new table
introduces and the current one does not have. `docs/WHAT-IS-NOT-CHECKED.md` says so meanwhile.

**A label printed elsewhere could have its type sizes checked, given the measure the regulations use.** Since
2026-10-11 every US food type size, the net quantity's position and a barcode's quiet zones give no verdict through
`check_label` or the photo audit (`rules/described.ts`, `docs/WHAT-IS-NOT-CHECKED.md`), because the request states
sizes, if at all, as em sizes and 101.7(h)(2) and 101.2(c) measure the printed letter. The input that would let them
run is a **measured letter height** per element — the "o", or the capital where the text is all capitals — which a
user can take off a proof with a loupe. That is a schema change, a field in the editor or not, and its own design
discussion: stated letter heights would be judged as stated, so the check becomes a check of the user's
measurement. Worth doing when `/mcp` is in use and food labels are what it is used for. James's decision of
2026-10-11 was not to add em-size fields in the meantime, since they would ask for the wrong number.

**The "Contains" statement's size against the ingredient list could be judged on a described label where both are
stated.** §403(w)(1)(A) compares the two sizes rather than setting a letter height, and a label set in one face keeps
that comparison whatever the face — so a request stating both `containsStatementFontSizeMm` and
`informationPanelFontSizeMm` could have the size half judged. The rule stands down whole on a described label today,
because its other half, the gap to the list, is where the engine stacked the two. Splitting it is small; it would
bring back the fixture's "Contains at 2 mm" violation through `check_label`. The gap half cannot follow from a
stated `containsStatementGapMm` as things stand: the engine adds it *on top of* its own gap (the smaller of its block
gap and one line of the list), so the stated figure is never the distance printed. `/code-review high` on #87 read
it as the absolute gap; making it one is the change that would let the gap be judged too.

**On a label printed elsewhere, the layout's overrun omissions still rest on the engine's defaults for barcodes and
food.** Stage 22 gave the GHS overruns a second wording (`LayoutOmission.whenDescribed`) because a GHS document
carries no type sizes. The same is true of a UPC-A symbol drawn at the default magnification, bar height and digit
band, and of US food blocks stacked at default ems: on a small stated stock, `check_label`'s `uncheckable` can say
"the UPC-A symbol runs N mm past the top … so part of its bars or digits is not printed" about a label whose barcode
is whatever size it is. It is the accusing direction — the omission withholds passes, never grants one — so it is not
a false clearance, but it is a false statement about the user's label. Found by `/code-review high` on #87. The
general fix is for the layout to record which values it defaulted and the omissions built from them to carry the
described wording, as the GHS ones do; worth doing with the measured-letter-height work, which touches the same
inputs.

**`GHS_PICTOGRAM_SIZE_MET` will need to wait for `pictogramSideMm` on a described label.** The engine draws the
band's minimum where no side is stated, so the pass is compliant by construction, the same shape as the barcode's
magnification. It is withheld today only because every pictogram carries the unseen-symbol omission; the day
pictogram artwork is drawn, it becomes a false clearance through `check_label`. The fix is
`verdictWaitsOnADescribedLabel` with a new `DeclinedFact`, which needs an editor field for the side — the GHS form has none.

**Requiring the label's size stopped a check before it started — fixed on 2026-10-12.** The re-check of that day
found 43 of 72 answers asking for a size and checking nothing. James chose to judge the rest: `stock` is optional, a
sizeless label is drawn edgeless and its rules see a stock of no area, so the size checks wait and nothing is assumed
(`CHANGELOG.md`). Worth confirming in the next evaluation that models now check first and ask second.

**A sizeless food label's drawn display and its rules' entitlement use two different floors.** The layout is drawn on
the edgeless stock, so the engine picks the Nutrition Facts display from a floor of about 155,000 in², while the
rules see a stock of no area and judge entitlement from the principal display panel alone. On a small tabular panel
the drawing gets the (d)(11)(iii) minimums and a ten-metre-wide panel while the rules treat the package as entitled
to the small-package route. Nothing judged today reads the difference: the type-size rule, the only one measuring
display-specific geometry, stands down on a described label. Worth fixing before a rule reads the drawn display of a
described label — by letting the engine take the panel-only floor too. Found by `/code-review high` on #90.

**The evaluation harness's records each judge their own view.** The records of 2026-10-09 and 2026-10-10 judge the
drawing, as they were graded; the re-check of 2026-10-12 (`--recheck` modes) records what `check_label` answers, by
James's decision that day. A future evaluation should do as the re-check does.

**An assumed margin keeps the label type's default, on purpose (decided 2026-10-11).** `check_label` needs a size but
not a margin, and uses the label type's default where none is given, saying so in `stockUsed.marginAssumed`. A
smaller default — zero, or 5% of the label — was considered and rejected: no rule reads the margin, but it sets the
panel the engines place content in, so a smaller assumed margin leaves more room, and content that overruns at the
label's real margin could then fit and pass on geometry the label may not have. The default can only refuse. Where it
does, the answer now says the margin was assumed and asks for the real one (`assumedMarginNotice`), rather than
reading "A 6 mm margin leaves no panel" about a margin the user never gave. Found by `/code-review high` on #84.

**Whether a vitamin's %DV may be computed from the actual amount is open.** `us-food/nutrition-percent-dv` accepts a
printed percentage computed from either the declared amount or the actual one before rounding, for every nutrient.
That permission is 101.9(d)(7)(ii)'s — "dividing either the amount declared on the label for each nutrient or the
actual amount of each nutrient (i.e., before rounding) by the DRV" — and it is scoped to nutrients "for which a DRV has
been established". For vitamins and minerals, (c)(8)(ii) says only "the amount per serving … calculated as a percent
of the RDI", naming neither basis (both read from the eCFR on 2026-10-12). Accepting both is the reading that cannot
report a label for the basis it chose; if FDA requires one, the rule is clearing figures the other basis produces. FDA's
"Questions and Answers Related to the Compliance Date, Added Sugars, and Declaration of Quantitative Amounts of
Vitamins and Minerals" guidance (2018, revised 2019) is the likely place it is answered — guidance, not regulation,
so at most it would make the rule's message say which basis FDA expects. Found by `/code-review high` on #88.

**Smaller, from the same grading:** the Digital Link field `domain` described nothing, so every model's first Digital
Link carried a host name with no scheme, which the rule rightly refuses — described since 2026-10-11, with `capacityL`,
`containsStatement`, `pictogramSideMm`, `smallContainerLabelling` and the margin; whether that saves the calls is for
the next evaluation to show. The two citation findings beside it — the %DV pass citing only 101.9(d)(7)(ii), and the
GS1 rules citing 25.0's figure numbers — were fixed on 2026-10-12 (`CHANGELOG.md`).

## From the MCP server, 2026-10-10

**The server refuses four of the 87 documents the judge is tested against, as the exporter does.** Three
fixtures remove the ingredient list and keep an `ingredientThreshold.count`, which the shared schema refuses as
covering entries that are not there; the fourth is the 3 percent threshold, which its own fixture has to force
past the type system (`3 as unknown as 2`) and the schema refuses as a figure 101.4(a)(2) does not permit. The
editor judges all four and the rules report them. This is decision 4 of the MCP plan working as meant — the
server refuses what the export routes refuse — and each refusal names its field, so it is a note rather than
work. It does mean `FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED` can be reached only from the editor.

**A misspelt field inside `data` is dropped, not refused.** Zod strips keys a schema does not list, everywhere in this
project, so a model sending `containsStatment` gets a label with no contains statement and a finding about that,
rather than an error naming the typo. The finding is not a false clearance — a dropped field takes information away
— but it is a worse answer than a refusal. **The check request's top level and its `stock` are strict since
2026-10-11** (`stok`, `marginMM`), which touches no shape the other routes share. Inside `data` it stays: refusing
there on the server alone would break decision 4, refusing everywhere changes what the saved-label and export routes
accept, and the 2026-10-10 evaluation found no model misspelling a key there.

**Anyone with an Anthropic API key can spend claude.ai's shared allowance.** The tier for Anthropic's outbound
range exists because every claude.ai user arrives from it, but the Messages API's MCP connector calls out from
the same range, so a stranger can point it at `/mcp` and loop until the 5,000 an hour are gone — and every
claude.ai user then gets 429s, which break a connector, until the hour turns. The plan accepted that one heavy
user could do this (decision 2); `/code-review high` on #82 sharpened it into an attack that costs a few dollars.
Nothing tells callers in that range apart without a sign-in. Worth checking at the phase 8 connector test: whether
Anthropic's requests carry a per-user or per-conversation header that could key the bucket. Until then the log
line for each refusal is the alarm.

**Requests that are not tool calls have no limit in this process.** The allowances count `tools/call`, so
`initialize`, `tools/list` and malformed bodies cost the caller nothing, and each builds a server and parses up to
256 kB. That is the status of every route here but the exports and the audit, and it is the phase 8 edge limit's
to refuse; the expensive part of `tools/list`, converting the label schema, is now done once per process.

## From the shared schema, 2026-10-10

**A blank statement code makes the schema misreport its siblings.** `GhsRequest` canonicalises and de-duplicates
statement codes in a transform, and checks them against the regime's table in a refinement. When one entry fails
its own `.trim().min(1)`, zod skips the array's transform but still runs the object's refinement, so the refinement
reads the codes as sent. `["H999", " ", "h225"]` under `eu-clp` is answered with "“h225” has no verified eu-clp
hazard statement text" beside the blank's own complaint — false, since `h225` alone is accepted as `H225`. Seen
while recording the export routes' answers before the schema moved; left as it is because that stage's proof was
that every answer stayed byte for byte the same. The request is refused either way, so it is a misleading message
rather than a wrong verdict. The fix is to canonicalise inside the refinement too, or to skip it when the field
already has an issue; the comment above `if (code === '') continue` in `schema/labelDocument.ts` is where the
existing half of that guard lives.

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
2024/2865 and applicable from 1 July 2026. Whether an address is in the Union is not something a rule can read
from free text. **Disclosed in `docs/WHAT-IS-NOT-CHECKED.md` on 2026-10-10**, with the application date checked
against 2024/2865's Article 2(2) as 2025/2439 replaced it; a field, and a rule on it, remain possible later.
The CLP citations this engine carries were read against the 2025-09-01 consolidation; the six this experiment
leaned on were re-read against 2026-07-01 and are unchanged, and the rest have not been.

**A mixture's UFI is neither checked nor disclosed.** CLP Article 25(7): where a unique formula identifier is
created under Annex VIII, "it shall be included in the supplemental information on the label", in the form
Annex VIII Part A §5.2 sets ("UFI:"). It turns on whether the mixture falls under Annex VIII, which the document
does not say. **Disclosed in `docs/WHAT-IS-NOT-CHECKED.md` on 2026-10-10**, with Part A, 5.3's alternatives:
the inner or outer packaging, or the safety data sheet for a mixture supplied to an industrial site.

**Which precautionary statements a label carries is not judged, and not disclosed.** CLP Articles 22 and 28
leave the selection from Annex I's tables to the supplier, with Article 28(3)'s limit of six unless more are
needed. No rule compares a label's P-statements with its classification, so an eye irritant printing no eye
response statement passes — the landing sample did, until 2026-10-10. `docs/WHAT-IS-NOT-CHECKED.md` says
nothing about the selection; a sentence there would close it.

**This engine cannot print a CLP supplemental hazard statement.** Annex II's EUH statements — EUH066 "Repeated
exposure may cause skin dryness or cracking" among them, required by Annex VI for acetone — have no table in
`ghs/statements.ts` and no field in a label document, so a substance or mixture that needs one cannot be
labelled completely here. Found on 2026-10-10 while checking the landing sample, which was acetone and is now a
fictional mixture that needs none. **Disclosed in `docs/WHAT-IS-NOT-CHECKED.md` the same day.** The statements
themselves would need Annex II transcribed and verified, as the H- and P-statements were, and a field to carry
those Annex VI assigns.

**Servings per container is not checked against the net quantity.** The base US food fixture declares 8
servings of 40 g in a 340 g package, which is 8.5. 101.9(b)(8)(i) rounds to the nearest whole number and does
not break a tie at .5 ("about" is a *should*), so this label is not shown to be wrong — but nothing would notice
one that was. No rule cross-checks the two figures.

---

## Rules that do not exist yet

**A clipped (b)(12)(i)(C) column is reported as the wrong basis**, since the exemption falls away and `FDA_DUAL_COLUMN_MISSING` names the declared basis rather than the clipping, which its own omission reports (medium review of fix PR 2b, 2026-10-18).

**A type-size check with every part in a no-verdict band says nothing and asks for nothing**, though stating a package area of 12 in² or more would let it run (same review).

**A Type B self-reactive substance or organic peroxide declared by one Annex V row is judged as that row**, so a Type B ticking only "Types A, B" is held to GHS01 alone; the catalog models rows, not types (high review of #106, 2026-10-18).

**A tabular display of 40 in² or less waiting on its vertical space asks only for the space**, though ticking "cannot take a standard vertical column" would also settle it; the checkbox cannot say "not stated" (high review of #105, 2026-10-18).

**A net quantity by count is asked for an SI declaration, and whether 15 U.S.C. 1453(a)(2) wants one for a count was not settled** (found writing the SI unit check for fix PR 2, 2026-10-17; the rule did this before).

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

**`apps/api/src/labels/routes.test.ts` fails now and then under the full suite's load, and never alone.** Seen
twice on 2026-10-11 and 2026-10-12 — "takes an assortment with its statement, and prints it" once, "accepts every
id it does define" once — each passing in three isolated runs and on the next full run. Both export a PDF, so a
timeout under contention is the likely cause; not yet confirmed from the error, which is worth capturing the next time
it happens rather than re-running past it.

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

**Settled 2026-10-17: printing GHS09 on a US label stays a violation.** `ghs/pictogram-integrity` reports it as
`GHS_PICTOGRAM_NOT_RECOGNISED`, a violation under 29 CFR 1910.1200 Appendix C.2.3.2: "One of eight standard
hazard symbols shall be used in each pictogram", and the environment symbol is not one of the eight. But OSHA's
own pictogram QuickCard (OSHA 3491), read on 2026-10-09, lists "Environment (non-mandatory)", and C.3.1 admits
supplementary information that "does not contradict or cast doubt on the validity of the standardized hazard
information". The regulation's text and the regulator's guidance point different ways, which is exactly the
case `CLAUDE.md` says to write down rather than settle by assumption. Raised by `/code-review high` on PR #71.
Settling it wants OSHA's preamble to the 2012 or 2024 rule, or a letter of interpretation, read for whether a
ninth pictogram is permitted supplementary information. Until then the violation stands, as it has since
phase 4. **Settled 2026-10-17:** neither preamble grants a permission and no interpretation letter was found, so
the violation stands on the regulation's text (`docs/verification-2026-10-17.md`).

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

**Narrowed 2026-10-18 for `/mcp`, by security fix 4:** a request carries one message, so what `/mcp` leaves
uncounted is at most one 25 KB answer a request, and no subscription is held open
(`docs/security-review-2026-10-18.md`, finding 5).

**Settled 2026-10-18 for saved labels, by security fix 3:** changing or deleting a label needs its edit token, and
writes are limited per address (`docs/security-review-2026-10-18.md`, finding 4).

**From the high review of #111 (2026-10-18), one line each:** a save refused at the cap or for a bad body still
spends one of the address's ten creates, so a person retrying a full app as its 409 suggests can reach 429; ten
creates an hour is shared by everyone behind one NAT; `PUT` validates the body before it checks the token; the list
awaits its find and its count one after the other; `PUT` checks the id twice; and the hourly limiter's settings are
written out in four files.

**Superseded 2026-10-18:** the security review found this parse order can reset the audit's spending cap, so
it is must-fix finding 2 of `docs/security-review-2026-10-18.md`, which also lists that review's recorded,
no-work items.

**Settled 2026-10-18 by security fix 2:** the audit route now reads its body after its limiter and its key.

**The audit route's guards run after its body has been parsed.** `/api/audit`'s `express.json({ limit: '10mb'
})` is mounted ahead of its router, so a request the quotas or the key refuse has already been buffered and
parsed in full: ten megabytes of JSON can be read before a 401. The guards bound what the route can *spend*,
which was their job, and nothing about what it costs to refuse. Narrower than when it was raised: the 10 MB
limit is now on this route alone, and every other route is held to 256 KB. A limiter mounted ahead of the body
parser would close it, at the cost of splitting the route's protections across two files.

**Settled 2026-10-18 for the daily cap, by security fix 2:** the day's count is in the database
(`audit/dailyAllowance.ts`); the hourly per-client limit below is still per process.

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

**From fix PR 4's reviews (2026-10-18), one line each:** the editor, the design page, `templates/upcA.ts`, the
engine's out-of-range error and the print test sheet still call 0.8x to 2.0x the permitted range, true outside the
on-demand band; `gs1/magnification` applies table 5-44's EAN/UPC band to every drawn symbol, which is only ever a
UPC-A; `EAN_UPC_MIN_X_DIMENSION_MM` is written beside `MIN_MAGNIFICATION` rather than derived from it, and
`isAtTheListedHeightFloor` repeats `xDimensionBand`'s edge by hand; "say the limit in the last finding" is copied
from `gs1/digital-link` rather than shared.

**From security fix 1 (2026-10-18), one line each:** the audit's extraction schema (`extractionSchema.ts`) has no
maximums of its own, so a long extracted value is refused only when the confirmed label is saved or exported;
`nutritionFacts.ts`'s `printedInRun` interpolates a declared percentage into a regex unescaped, so the point in
"4.5" matches any character (no false clearance found, since the engine never prints a figure it could confuse).

**From the high review of #109 (2026-10-18), one line each:** a saved label stored before the bounds with a value
past one now answers 500 on open, with no tolerant read (the deployed database starts empty); the `/mcp` sweep's
guard against bound refusals also catches the older `min(1)` and `positive()` refusals; `widestLineMm` is written
in both engines, and the two end-of-string trims are two helpers; `Math.max(...)` and `Math.min(...)` remain over
the nutrient rows and the bars, which are bounded; and `wrapTextMm` measures a word that starts a line twice.

**From the review of `75ff207` (2026-10-18):** the allergen rule still strikes every other ingredient's name out of
the whole printed list once per allergen, so 1,000 entries over all nine allergens take about 0.5 to 0.75 s in
`check_label`; finding each name's matches once and masking them per allergen would be linear, but it changes how
(B)(ii)'s caveat treats overlapping names, so it wants its own fixtures. Also, one line each: the strike-out count
test uses two allergens and has one assertion the other always implies, and the Contains text is lowercased once per
bearing ingredient.

**From security fix 2's reviews (2026-10-18), one line each:** the audit key is kept in `localStorage` with no
expiry, and is still sent, unseen, once a server stops asking for one; requests without a key fill the same hourly
bucket a key holder at that address uses (per address only with `TRUST_PROXY_HOPS=1`); where the status cannot be
read, the first read goes without a key and counts against the hour before the field appears; a key with a character
`fetch` cannot put in a header reads as a generic failure; the environment's cross-field check is skipped while
another field fails, so a missing audit key is reported a deploy late; the key is required even where
`AUDIT_DAILY_LIMIT=0` has turned the audit off; and line-wrapped base64 is refused as "not base64".

**From security fix 3's medium review (2026-10-18), one line each:** two tabs writing the held-label list in the same
instant can drop the newer token, since each is a read and a write of one `localStorage` key; `GET /api/labels` has no
rate limit (as reads never have) and counts the collection on every call; the editor decides whether Save may replace
once per attached label, so a token gained or lost in another tab shows on the next open; a 201 without a token
(only a client and server from different builds) creates a label nobody can change; and the client's 200-id ceiling
copies `LABEL_CAP` by hand.

**From the high review of #112 (2026-10-18), one line each:** the list asks about the 200 most recently created
held ids, not the most recently changed, so past 200 held a live label can be left off the page (its token is kept);
with a full quota, a forgotten id stays in storage and comes back; a stored token that no longer opens its label
leaves a row Delete cannot clear; the editor says "Opened from a link" for any label it holds no token for, and
promises Save as new beside a full app; a full app with nothing held says so twice and still offers the editor;
malformed ids are skipped by the list rather than dropped on read; `isNotYours` has no caller; and the e2e helpers
copy the storage key and header name.

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

