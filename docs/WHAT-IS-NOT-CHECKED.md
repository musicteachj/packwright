# What is not checked

A clean audit from this tool is not a statement that your label is compliant. It is a statement that the checks
this tool performs found nothing — and there are requirements it does not check at all.

This document lists them. It exists because the alternative is worse: a report with nothing in it, and no way
for you to tell whether that means your label is sound or whether nobody looked. Most of what follows is a
deliberate decision rather than a gap waiting to be filled; where something is an open question instead, it
says so.

Two things are worth knowing before the list.

**Most rules measure what the engine drew, not what you typed.** A rule asking whether the net quantity sits in
the bottom 30% of the principal display panel measures printed geometry, which is what makes the preview and
the export agree. A few are questions about the document rather than about ink — whether a GTIN's check digit
is correct, whether a Digital Link is a conformant URI, whether a nutrition format you are entitled to use is
one you qualify for — and those are answered without reference to what printed. The report marks which is
which.

**A rule that cannot answer does not pass — and where you could have answered it, the report says so.** Where a
requirement turns on a fact your label does not carry, the check produces no pass and no finding. The report
lists it under **"checks that did not run"**, separately from "cannot be checked", which is about elements the
engine could not *draw* — a different problem, and not one you can fix by filling in a field.

**That list is not exhaustive, by design.** A rule only announces standing down where you could do something
about it. Where the limit is this tool's own — a barcode symbology whose quiet-zone figures have never been
confirmed against a specification, below — the check is silent, because naming it would send you looking for a
control that does not exist. Those limits are in this document instead, which is the reason to read it.

---

## Nutrition Facts and US food labels

### Nutrition claims are not modelled at all

This is the largest gap, and it reaches further than the others.

A great many requirements in 21 CFR 101.9 turn on whether the food bears a **nutrient content claim** or a
**health claim** — "good source of calcium", "low fat", and the rest, governed by 21 CFR 101.13 and 101.14.
This tool has no representation of a claim, so it cannot evaluate any condition that mentions one.

Concretely:

- Most of the exemptions in 101.9(j) hold only while the food "bears no nutrition claims or other nutrition
  information in any context on the label or in labeling or advertising". Every pass this tool issues under one
  of those exemptions says that condition was not checked. If your product makes a claim, an exemption this
  tool cleared may not apply to you.
- The relaxations in 101.9(c)(2)(i), (c)(3), (c)(6)(ii) and (c)(6)(iii) — where saturated fat, cholesterol,
  total sugars and added sugars need not be declared below a threshold "if no claims are made" — are **not
  applied**, because the condition cannot be evaluated. This tool asks for those declarations in cases where
  the regulation might not.

Note the words "or in labeling or advertising". That condition reaches beyond the label entirely, to material
this tool will never see. It is not something a future version could check either.

### Reference amounts are taken from you, not looked up

21 CFR 101.12(b) tabulates a Reference Amount Customarily Consumed for roughly 140 food categories, and a great
deal turns on it: 101.9(b)(7) derives your serving size from it, and 101.9(b)(12)(i) and (b)(2)(i)(D) make a
second column of nutrition information **mandatory** for a package holding 200 to 300 percent of it.

**That table is not carried here.** Where a reference amount matters, this tool uses the figure you declare and
does not check it against §101.12(b) — so it cannot tell you that you have picked the wrong category, or the
wrong amount within the right one. The serving-size check confirms a serving size is declared and properly
formed, not that it follows from the reference amount.

The consequence worth knowing: if your declared reference amount is wrong, every conclusion resting on it is
wrong too, including whether you owe a second column at all. The checks will look clean.

### The Nutrition Facts footnote is drawn, not judged

21 CFR 101.9(d)(9) sets the footnote's wording exactly. This tool looks that wording up from the regulation and
prints it, choosing by which population's Daily Values apply and by which display the panel uses. There is no
field through which a label can supply its own footnote text, so **no label document can make the footnote
wrong**, and there is nothing for a rule to catch.

That is a narrower claim than it may sound, and the difference has mattered. What no document can get wrong,
the *engine* still chooses — which wording, and which of the permitted variants, including the abbreviated
`*% DV = % Daily Value` that 101.9(j)(13)(i) allows on a small package. Because no rule judges the footnote,
nothing independently confirms that choice was right; a wrong one has shipped before and was found by reading
the code rather than by a failing check.

If you are checking a label this tool did not draw, the footnote is worth reading against the regulation
yourself.

One permitted variant is **never produced**: 101.9(d)(9) allows a shortened footnote on foods that may bear the
§ 101.60(b) calorie-free terms. Those are claims, and claims are not modelled — so this tool cannot know your
food qualifies, and will draw the full footnote instead. A label entitled to the short form is not wrong; this
tool simply will not produce it.

### 101.3(b) and (d): the statement of identity

Only 101.3(a) — that a statement of identity appears on the principal display panel — is checked. The rest is
left alone on purpose:

- **(b), the "common or usual name".** Whether a given string is a food's common or usual name is a question
  about 21 CFR part 102 and about how words are actually used, not a question about a label. The passing
  message for this check says so.
- **(d), "a size reasonably related to the most prominent printed matter".** This states no measurable
  standard. Any finding under it would be an opinion wearing a citation.
- **(d), bold type.** The engine draws the statement bold unconditionally, so a rule for it could never fail on
  a label this tool produced. It becomes worth writing only if the weight ever becomes yours to choose.
- **(d), "lines generally parallel to the base".** This engine draws no rotated text, so there is nothing to
  catch.

### Where the "% Daily Value*" heading sits on a two-column panel

On a panel with two columns, this tool prints that heading right-aligned over the second column. Whether that
matches the sample display in 101.9(e)(6)(i) **has not been checked against the illustration**.

This is listed as an open question rather than a known limitation, and the distinction matters. FDA's sample
labels are illustrations, not the regulation, and this project does not let an illustration create a
requirement. Until someone reads the source, the honest statement is that nobody has looked — not that the
placement is wrong, and not that it is right.

---

## Allergens

### The allergen warning is deliberately over-strict

When this tool cannot confirm that an allergen declaration printed in full, it raises an advisory saying so.
It fires when no element declaring that allergen drew completely — and "completely" counts any shortfall at all,
including ones that left the allergen's own text perfectly legible. Where a source is declared in both the
Contains statement and the ingredient list and only one of them fell short, no advisory is raised.

**This can warn you about a declaration that is fine. It will not clear one that is not.** The check is built
to err in that direction on purpose: an unnecessary warning costs you a moment's reading, and a missed allergen
declaration is the most serious defect a food label can carry.

If you see this advisory on a label whose Contains statement looks complete, read it against your ingredients
and move on.

---

## GHS chemical labels

### Hazard classification is yours to supply

Two of the most useful GHS checks — that the pictograms on the label match the hazards, and that CLP Article 26
precedence has been applied — work from **hazard class identifiers**, not from the H-codes printed on the
label. A label carries H-statements and pictograms; it does not carry class identifiers.

So where your label data has no classification, both of those checks stand down and say so — they appear under
"checks that did not run", naming what to supply. This is the normal case when reading a label from a
photograph, which yields H-codes and pictograms and never a classification, so expect to see them there on
almost every audit until somebody classifies the substance by hand.

Deriving a classification from H-codes automatically would need Annex VI transcribed and verified, and it is
emphatically not something to have a language model guess at — a guessed classification would make the
precedence check judge the guess rather than the label.

---

## Barcodes

### Artwork printed through a symbol is reported, not judged

A barcode with artwork across it can be destroyed while both its quiet zones stay perfectly clear. Every
geometric check this tool makes — margins, magnification, bar height, human-readable text — can pass on a
symbol that will not scan at a till.

This tool detects overprinting and says so in words, but issues **no verdict** on it, because no clause
covering overprinting has been confirmed against a source document. It also withholds the barcode's pass
rather than certifying a symbol it cannot vouch for. Treat the notice as the finding it declines to be.

### Quiet zones are checked for what this tool draws, and not for symbologies it does not

The blank margin either side of a barcode is the most frequently violated requirement in the GS1
specification. This tool draws **UPC-A**, whose quiet-zone figures are confirmed against the General
Specifications, and checks them.

The engine also carries confirmed figures for UPC-E, EAN-13, EAN-8, ITF-14 and GS1-128, and carries none for
CODE128, CODE39, MSI and PHARMACODE — those are not GS1-governed and their own ISO/IEC specifications have not
been read for this project. Where no figure is confirmed, the quiet-zone check **issues nothing at all**:
neither a pass nor a finding, because a pass resting on the general 7X minimum would understate what the
symbology actually requires and read as reassurance. You cannot currently produce a label in any of those
symbologies, so this does not bite today; it is recorded because the silence is deliberate and would otherwise
look like an oversight if it ever became reachable.

---

## Type size measurement

The type-size checks that measure a printed letter height read it together with the typeface it was measured
in, because a height means nothing without the face. Where a block of text spans several lines, such a check
pairs the smallest height across those lines with the typeface of the first. (Not every type-size check works
this way: where the regulation states a point size rather than a letter height, the check compares point sizes
and the typeface does not enter into it.)

**On labels this tool draws, that is exact**, because the whole label is set in one typeface. It would become
inexact on a label that mixed two faces within a single block — which nothing here can currently produce. It is
recorded because it is the kind of assumption that stops being true quietly.

---

## If you find something missing from this list

That is worth reporting. A requirement this tool neither checks nor admits to skipping is the one kind of gap
this document exists to prevent.
