# What is not checked

A clean audit from this tool is not a statement that your label is compliant. It is a statement that the checks
this tool performs found nothing — and there are requirements it does not check at all.

This document lists them. It exists because the alternative is worse: a report with nothing in it, and no way
for you to tell whether that means your label is sound or whether nobody looked. Everything below is a
deliberate decision, not a gap waiting to be filled, and each one says why.

Two things are true of every check here and are worth knowing before the list.

**Rules are measured against what the engine drew, not against what you typed.** A rule asking whether the net
quantity sits in the bottom 30% of the principal display panel measures the printed geometry. That is what
makes the preview and the export agree. It also means a rule can only judge ink this tool laid down — a label
you produce elsewhere is not what was examined.

**A rule that cannot answer says nothing, rather than passing.** Where a requirement turns on a fact your label
does not carry, the check declines and the report says so, in the block above the findings. Silence in the
findings list is not the same as approval, and the report is written to keep those apart.

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
- The relaxations in 101.9(c)(2)(i), (c)(3) and (c)(6) — where saturated fat, cholesterol and the sugars need
  not be declared below a threshold "if no claims are made" — are **not applied**, because the condition cannot
  be evaluated. This tool asks for those declarations in cases where the regulation might not.

Note the words "or in labeling or advertising". That condition reaches beyond the label entirely, to material
this tool will never see. It is not something a future version could check either.

### The Nutrition Facts footnote is drawn, not judged

21 CFR 101.9(d)(9) sets the footnote's wording exactly. This tool looks that wording up from the regulation and
prints it, choosing by which population's Daily Values apply. There is no field through which a label can
supply its own footnote text, so there is no way to get it wrong and nothing for a rule to catch.

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
That advisory fires whenever *anything* about the declaring element failed to draw completely — including cases
where the allergen text itself printed perfectly well and the incomplete part was something else entirely.

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

So where your label data has no classification, both of those checks decline and report nothing. This matters
most when reading a label from a photograph, which yields H-codes: those two checks will stay silent until
somebody classifies the substance by hand.

Deriving a classification from H-codes automatically would need Annex VI transcribed and verified, and it is
emphatically not something to have a language model guess at — a guessed classification would make the
precedence check judge the guess rather than the label.

---

## Barcodes

### Quiet zones are verified for six symbologies, not all of them

The blank margin either side of a barcode is the most frequently violated requirement in the GS1 specification,
and this tool checks it — but only where the exact figure has been confirmed against a source document.

Confirmed, and checked against their own figures: **UPC-A, UPC-E, EAN-13, EAN-8, ITF-14 and GS1-128.**

Not confirmed: **CODE128, CODE39, MSI and PHARMACODE.** These are not GS1-governed; their quiet zones come from
their own ISO/IEC symbology specifications, which have not been read for this project. They fall back to the
general 7X minimum, which may understate what your symbology actually requires. A pass on one of these is not
evidence the symbol will scan.

---

## Type size measurement

Every type-size check reads a measured glyph height together with the typeface it was measured in, because a
height means nothing without the face. Where a block of text spans several lines, the check pairs the smallest
height across those lines with the typeface of the first.

**On labels this tool draws, that is exact**, because the whole label is set in one typeface. It would become
inexact on a label that mixed two faces within a single block — which nothing here can currently produce. It is
recorded because it is the kind of assumption that stops being true quietly.

---

## If you find something missing from this list

That is worth reporting. A requirement this tool neither checks nor admits to skipping is the one kind of gap
this document exists to prevent.
