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

There is one exception, and the report marks it as one. Where a regulation plainly reaches your label and this
tool cannot represent an answer to it, staying silent would read as a pass and reporting a violation would blame
your label for the tool's limit. That entry appears under "checks that did not run" with nothing to fill in, and
says in so many words that the limit is this tool's. Today there are three, all below: the package owing both
second columns; whether a US label's pictograms are the ones its classification requires; and, on a label you
describe or photograph rather than draw here, whether each pictogram carries its symbol.

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

### 101.7(h): the net quantity in boldface

The declaration "shall appear in conspicuous and easily legible boldface print or type". The engine draws it bold
unconditionally, so, as with the statement of identity, a rule for it could never fail on a label this tool
produced, and none is written. It is drawn in IBM Plex Sans SemiBold (weight 600), the heaviest face Packwright
embeds. The regulation does not define boldface by weight, and this project reads a semibold as bold, as it does
for the statement of identity; if you print with a font of your own, check that its weight reads as bold. It was drawn in the regular face until 2026-10-17, while the net quantity rules
reported it compliant; `docs/verification-2026-10-17.md` records how that was found. On a label you describe
rather than draw, nothing judges whether the declaration is bold: a description does not carry the weight
of the type, and no finding about it appears, either way.

### 15 U.S.C. 1453(a)(2): the SI declaration is read for its unit, not its value

The Fair Packaging and Labeling Act requires the net quantity in "the SI metric system" as well as in inch/pound
units. The check looks for an amount in an SI unit in the metric declaration: grams, liters or meters, bare or with
an SI prefix from micro to kilo, as a symbol or spelled out ("liter" or "litre"), and the square or cubic meter.
Anything else there, "16 oz" or a bare "500", is reported. It does not check that the other declaration is in
inch/pound units, that the SI figure equals it, or that the units chosen are "the most appropriate", and the
passing message says so. Case is not
judged: "340 G" on a label set in capitals reads as grams, though NIST's style guide writes "g". Abbreviations
that are not SI symbols, such as "gm" or "ltr", and fractions such as "½ L", are reported: write "g", "L" or a
decimal. Until 2026-10-17 any text in the metric field passed.

### Type between a permission's floor and the usual minimum

Four situations let type go smaller than the usual minimum on a condition this tool cannot test. Type in that
band gets no verdict, neither reported nor counted in the passing message, which names what it left alone. Type
below the permission's own floor is reported against the usual minimum, since it fails either way.

- **101.9(d)(3)(ii), the serving size at 8 point.** "If the 'Serving size' declaration does not fit in the
  allocated space a type size of no smaller than 8 point may be used on packages of any size." Whether it fits is a
  judgment about your layout that the check does not make.
- **101.9(j)(13)(i)(B), packages under 12 in².** On a package with less than 12 in² available to bear labeling,
  "all required information shall be in type size no smaller than 6 point". Whether that replaces 101.9(d)'s 8,
  10, 16 and 22 point minimums or sits beside them is not settled: the paragraph does not say, (d)(1)(iii) names
  its own small-package exceptions, and FDA's linear illustration annotates "all type sizes are 6 point". So, by
  James's decision of 2026-10-17, Nutrition Facts type at 6 point or more and under its usual minimum gets no
  verdict on these packages. A package that declares no area counts as possibly this small whenever its label and
  principal display panel are. The same sentence lets an individual serving-size package served with meals, not
  for retail sale, follow 101.2(c)(2) instead, so on a package of 3 in² or less the band reaches down to 1/32 inch.
- **101.2(c)(2), individual serving-size packages.** A package served with meals in restaurants, institutions
  or on passenger carriers, not for retail sale, with 3 in² or less to bear labeling and too little room for 1/16
  inch type, may use 1/32 inch. The check can read only the area, so on a package that may be that small, type
  from 1/32 to 1/16 inch gets no verdict.
- **A tabular display waiting on its vertical space.** While the Nutrition Facts display check waits for the
  continuous vertical space (101.9(d)(11)(iii)), the tabular display's lower minimums may not be the label's. Type
  that meets them but not the vertical display's gets no verdict until the space is stated.

**101.2(c)(1), soft drinks in bottles, does not reach a label this tool draws.** It exempts information blown,
lithographed or formed onto a bottle made before October 31, 1975, and lets a bottle with no paper, plastic foam
jacket or foil label, or a reusable bottle with its label lithographed onto it, carry its information on the
closure at 1/32 inch. A bottle with a paper, plastic foam jacket or foil label keeps "all required information in
the specified minimum type size" ((c)(1)(ii)(A)). If your information is formed onto a bottle, lithographed onto a
reusable one, or printed on a closure, the 101.2(c) check here does not describe it.

### A package that owes both second columns

Two paragraphs of 21 CFR 101.9 can each require a second column of nutrition information. 101.9(b)(12)(i)
requires one for the **entire package** where a package sold individually holds 200 to 300 percent of its
reference amount. 101.9(b)(2)(i)(D) requires one **per individual unit** where a unit weighs 200 to 300 percent of
it. A package can owe both at once only when the package is itself one such unit, so the two columns would carry
the same figures.

This tool draws one second column, and you say what it counts. Neither paragraph, nor 101.9(e)(6), which sets out
how each two-column presentation looks, says whether one second column can serve as both, or whether such a
package needs three. That is our reading of the eCFR text, read on 2026-10-08.

So where both apply and your panel draws a second column that counts the package or the unit, or does not say
which, the report gives **no verdict** on that column. It explains why under "checks that did not run", marked
as a limit of this tool, with nothing to fill in, and says that the limit is not a fault found in your label.

Where you have said what that column counts and the panel is one this tool draws, its form is still checked:
what it carries, how it is headed and separated, and whether its type is as prominent as the first. Where you
have not said, the report asks you to, because the form rules turn on it. A panel presented beneath an egg
carton's lid is not drawn here, so its form is not checked either way.

Two things to know:
- **Where your panel draws no second column at all, it is still reported**, because both paragraphs ask for one
  and no reading is satisfied by none. The same goes for a second column that counts something else, such as
  per 100 g, which is neither column on any reading. It also goes for a package whose contents differ from its
  unit's: the two columns would then carry different figures, and one column cannot carry both.
- **How such a package should be labelled is a question for the regulation's own guidance**, not for this tool.
  Treat the notice as a reason to check that before you print, not as clearance.

### A second column you are not required to carry

If your package is obliged to show a second column — 200 to 300 percent of its reference amount, or an
individual unit in that band — this tool checks its form: that both columns are filled, separated, headed and
equally prominent.

**If you add a second column nobody requires, none of that is checked**, and the reason is that no provision
governs it. 21 CFR 101.9(e) permits dual labeling for four things — two or more forms of the food, common
combinations, different units, and RDI groups — and its requirements are the terms on which *those*
permissions are exercised. A per-container or per-unit column your package does not owe is none of them, and
101.9 says nothing about how it must look.

So the checks stay silent rather than reporting your label against a paragraph that does not reach it. A column
of fourteen rows carrying one figure will draw no finding. It is still worth a second look before you print:
a reader will compare the two columns whether or not a regulation requires them to agree.

The way to bring the checks back is to state what the tool needs to know — the reference amount, what the whole
package holds, and whether it is packaged and sold individually. The report asks for those under **"checks that
did not run"**. With them supplied, either the column is required and its form is judged, or it is not and this
paragraph is why you hear nothing.

**Two silences, and the report tells them apart.** Where your label has not said enough to decide whether the
column is required, the checks appear under "checks that did not run" with the fields to fill in. Where it has
said enough and the answer is no, you hear nothing at all — there is no question outstanding and nothing to
supply. Only the first is something you can act on.

### Where the "% Daily Value*" heading sits on a two-column panel

On a panel with two columns, this tool prints that heading right-aligned over the second column. Whether that
matches the sample display in 101.9(e)(6)(i) **has not been checked against the illustration**.

This is listed as an open question rather than a known limitation, and the distinction matters. FDA's sample
labels are illustrations, not the regulation, and this project does not let an illustration create a
requirement. Until someone reads the source, the honest statement is that nobody has looked — not that the
placement is wrong, and not that it is right.

---

## Allergens

### The food source name is matched as the Act writes it

A declaration counts where it uses the name FD&C Act § 201(qq)(1) gives the allergen ("peanuts", "soybeans",
"milk") or, by James's decision of 2026-10-17, its singular ("peanut", "soybean"). **"Soy" and "soya" are
reported as undeclared.** FDA's allergen guidance accepts them, but it is nonbinding, and the statute's own word is
"soybeans"; if your label uses "soy", add "(soybeans)" or a Contains statement. For a tree nut, fish or Crustacean
shellfish, the specific type you give is the name (§ 403(w)(2)), and a type that is only the category's own name,
such as "tree nuts", "nuts", "fish" or "shellfish", or a collective name such as "mixed nuts" or "seafood", is
reported as not specific. That test matches those words
whole, with case, spaces and punctuation set aside: it does not check that what you typed is a real species or
nut, so "pecan nuts" passes, and so would a misspelling or a collective name the list lacks, such as "party mix".

**A single-ingredient food with nothing listed gets no allergen check.** The check reads the allergen you tag on
each ingredient, and with no list there is none to read. If the one ingredient is, or contains, a major food
allergen, list it with its allergen tag and the check runs; the ingredient-list check's passing message says so.

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

### Whether a US label's pictograms are the ones its classification requires

On a label for the US market, the check that the pictograms match the hazards gives no verdict. It appears
under "checks that did not run" as a limit of this tool, with nothing for you to fill in, and says that the
limit is not a fault found in your label.

The reason is the source. 29 CFR 1910.1200 Appendix C.2 says a classified chemical's label shall include the
pictograms "specified in C.4 for each hazard class and associated hazard category". This tool holds no
verified copy of C.4's tables, and the hazard classes it offers are those of the EU's CLP Regulation, which do
not line up one to one with OSHA's: OSHA lets eye irritation Category 2 be split into 2A and 2B (Appendix
A.3.2.1), and it has no aquatic hazard class at all. Judging a US label against the EU table, which is what this
check used to do, told US labels their pictograms were wrong under a regulation that does not govern them.

Two related checks still run on US labels under OSHA's own text: pictogram precedence (Appendix C.2.1), and that
each pictogram is one of OSHA's eight symbols (C.2.3.2). Where the tool works your pictograms out from the
classification, it leaves out the environment pictogram, which is not among OSHA's eight symbols (C.2.3.2) and
which this tool reports if a US label prints it, and it works out the rest
from CLP's table. That table has not been checked against C.4, so on a US label check each pictogram the tool
draws against C.4 yourself. The editor says so beside the classification.

### On a label you describe or photograph: pictogram symbols and type sizes

Packwright draws no pictogram artwork. No verified copy of the specimen symbols was available, and an
approximation would look compliant without being so, so every pictogram it draws is an empty frame. **On a label
this tool draws, that is reported**: an empty frame is what an exported PDF carries, OSHA forbids one outright
(29 CFR 1910.1200 Appendix C.2.3.1, "A square red frame set at a point without a hazard symbol is not a pictogram
and is not permitted on the label"), and CLP requires the symbol (Annex I, 1.2.1.2).

**On a label printed elsewhere, it is not.** Checking a label through the `check_label` tool, or auditing one from
a photograph, judges a label that already exists, and Packwright's drawing of it is a reconstruction. The symbols
are on your label, where this tool cannot see them, so the symbol check gives no verdict either way. Each pictogram
is listed under "cannot be checked", and the check itself appears under "checks that did not run" as a limit of
this tool — unless the label also carries a pictogram its regime does not recognise, which is reported, and then
the "cannot be checked" list is where it says so. A small container's check stands down the same way where the
unseen symbols are all it cannot confirm. On an EU label, a pictogram smaller than CLP's minimum is still reported, though none is passed for its size,
since a pictogram whose symbol nobody has seen is not one this tool can clear. OSHA sets no minimum.

**Type sizes are the same kind of gap.** A GHS label's description carries no type sizes, so Packwright sets its
text at sizes of its own choosing. On a label it draws, text that runs off the edge at those sizes is reported as
not printed, because on the export it is not. On a label printed elsewhere it is listed as a fact about
Packwright's layout instead, and whether your own text fits your label is not checked. Pictograms are treated
the same way, because Packwright sets them in one row of its own spacing and your label may not — except a
pictogram larger than the label itself, which is listed as not fitting, since no arrangement could fit it.

**And no rule checks a GHS label's type size.** CLP sets no minimum today. Regulation (EU) 2024/2865 replaces
Table 1.3 with one that adds a minimum x-height, from 1.2 mm on a package of up to 0.5 litres to 2.0 mm above 50
litres, and adds Annex I section 1.2.1.5 on line spacing, typeface and colour. Regulation (EU) 2025/2439 put both
back to **1 January 2028**. This tool will not check them before then, and on a label you describe it could not
check them at all until the description can carry type sizes. Read from the EU Publications Office on 2026-10-11:
the consolidated CLP text in force (02008R1272-20260701), 2024/2865 Annex I points (2) and (3), and 2025/2439
Article 1(c).

### Whether an EU label's supplier is established in the Union

Since 1 July 2026 a substance or mixture may not be placed on the EU market "unless a supplier established in
the Union, which shall be identified on the label, … fulfils the requirements set out in this Regulation" — CLP
Article 4(11), added by Regulation (EU) 2024/2865 and applying from that date under its Article 2(2), as
Regulation (EU) 2025/2439 replaced that paragraph. A label naming only a supplier outside the EU, a UK one
included, does not meet it.

**No check here reads where your supplier is.** The supplier is free text, and whether an address lies in the
Union is not something this tool can read from it reliably; the only supplier check it makes is that a small
container's reduced label names one with a telephone number. A clean report says nothing about Article 4(11), so
check it yourself: the supplier on the label should be an EU manufacturer, importer, downstream user or
distributor — the EU importer, where the product is made elsewhere — alongside any non-EU company you also name.

### A mixture's UFI

Information on a mixture classified as hazardous for its health or physical effects is submitted, before it is
placed on the market, to the bodies Member States appoint under CLP Article 45 to receive information "relating
to emergency health response", and the submitter creates a unique formula identifier for it (Annex VIII, Part A, 3.1 and 5.1). Where one has been
created, CLP Article 25(7) puts it in the label's supplemental information, preceded by "UFI:" (Annex VIII, Part A, 5.2).
Part A, 5.3 allows it on the inner packaging beside the other label elements instead, on the outer packaging
where the inner is too small, and, for a packaged mixture supplied for use at an industrial site, in the safety
data sheet in place of the label.

**This tool has no field for a UFI and checks for none.** Whether your mixture needs one turns on its
classification and its notification, which the label document does not carry. If your product is a hazardous
mixture placed on the EU market, check the UFI yourself.

### Supplemental hazard statements (EUH) cannot be printed

CLP Article 25(1) says supplemental statements "shall be included" on the label of a substance or mixture
classified as hazardous that has the properties listed in Annex II, Part 1, and that a substance listed in Part 3
of Annex VI carries "any supplemental hazard statements given therein" — EUH066, "Repeated exposure may cause
skin dryness or cracking", for acetone among them. Annex II, Part 2 adds further statements for certain mixtures.

**This tool holds none of these statements and has nowhere to put one.** It prints the H- and P-statements it
holds verified texts for, and no EUH statement at all, so a label for a product that needs one is incomplete
however clean its report. If your product needs a supplemental statement, add it to the printed label yourself.

These three readings are from consolidated CLP text 02008R1272-20260701, the version in force on 2026-10-10, and
Regulations (EU) 2024/2865 and 2025/2439, all read from the EU Publications Office on 2026-10-10. The
consolidated text is a documentation aid; the Official Journal is the authentic version.

### Precautionary statements are printed in Annex IV Part 2's wording

CLP gives each precautionary statement's English text twice, in the selection tables of Annex IV Part 1 and in
the per-language tables of Part 2, and for 18 statements the two differ. Article 22(4) says the statements "shall
be worded in accordance with Part 2 of Annex IV", so this tool prints Part 2's. Some of Part 1's texts are newer:
Commission Regulation (EU) 2019/521 reworded P103 in Part 1 as "Read carefully and follow all instructions." and
left Part 2's "Read label before use." as it was. Annex IV's introduction allows "minor textual variations" where
"the safety advice is not diluted or compromised", so a label carrying Part 1's wording is not reported by this
tool either; no check here judges a statement's wording.

**P280 is the one where the difference is more than wording.** Part 1, as 2019/521 replaced it, adds "hearing
protection" to the choices: "Wear protective gloves/protective clothing/eye protection/face protection/hearing
protection/…". Part 2's English text, which this tool prints, has no hearing protection and no "…" to add it. If
your product needs hearing protection named, add it to the printed label yourself.

All 18 differences, with both texts and the act behind each, are in `docs/CLP-P-STATEMENT-TEXTS.md`, read from
consolidated text 02008R1272-20260701 on 2026-10-16.

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

### A Digital Link you describe is judged as printed, and six things about it are not

When a label is checked from its description (through `/mcp`'s `check_label`), its Digital Link is given exactly as
printed and judged as written: a URI that is not a conformant GS1 Digital Link is reported against GS1 Digital Link
URI Syntax 1.7.0 §4, a GTIN written in fewer than 14 digits among them, since §4.5 writes `gtin-value = 14DIGIT`, and
one using the removed convenience alphas, `/gtin/` in place of `/01/`, against §4.1. Six things stop the link's pass
without a finding, and the report says each as a limit of this tool: under "checks that did not run", or in the
finding's own words where the link has a finding too:

- **The link carries a GTIN other than the barcode's.** No GS1 clause saying the two must match has been read for
  this project, so the tool does not judge it. Check that the link identifies the same product.
- **The link carries a key or Application Identifier this tool cannot place,** such as a primary key other than a
  GTIN, (235) after the GTIN, an AI its tables do not hold, or an AI repeated or out of its place in the query. The
  standard permits some of these (a GTIN followed by (235) is a UPUI path), so the tool does not call them faults.
  What no path in the standard allows, an expiry date's (17) after a GTIN say, is a fault.
- **The link has no host name,** as in `https:///01/…`. URI Syntax 1.7.0 §4.11 allows an empty host, and no
  resolver can serve one, so the tool says so rather than citing the standard against it.
- **A GS1 value in the link carries a double quote,** in the lot, the serial or any other. §4.2 writes one unencoded
  and RFC 3986 allows one only as `%22`, so no form satisfies both, and the tool passes neither. The same holds for
  a lot or serial entered in the editor.
- **A query key is written encoded and decodes to digits,** as in `?%31%37=999999`. URI Syntax 1.7.0 §4.10.1's
  grammar admits it as an extension key, since `extensionKey` takes percent-encoded characters, while its prose says
  extension keys "SHALL NOT use all-numeric keys", and a resolver that decodes the key reads AI (17). The two readings
  disagree, so the tool neither faults it nor passes it.
- **The link ends in a well-formed fragment,** as in `https://id.example.com/01/…#top`. The grammar of URI Syntax
  1.7.0 §4, which governs, has no place for one, while its informative §3 describes a fragment as an optional part of
  any Web URI, and none reaches a resolver. The tool neither faults it on a reading the standard does not plainly
  support nor passes it. A fragment RFC 3986 §3.5 does not allow is a fault, since the link is then no web address.

The link's stem may hold anything, segments that look like a GS1 key included: the tool judges the one reading of the
path the grammar allows. `https://x.com/414/1234567890128/01/…` is a stem and a GTIN, since a GLN's path cannot go on
with a GTIN. A resolver that reads such a link differently would not be following the standard, and the tool does not
guess at that.

A query parameter that is not GS1's, `?x=1` say, is checked as URI text only: it must be text RFC 3986 allows and have
an "=", but URI Syntax 1.7.0 §4.10.1's narrower grammar for such a key, and its reserved keywords `linkType` and
`context`, are not judged. A pass names such parameters and says so.

---

## A label you describe rather than draw

When you check a label through the `check_label` tool, Packwright judges a label that already exists from a
description of it. (The photo audit reads only chemical labels, whose limits are under GHS above.) It draws its own version to measure, filling in anything the
description leaves out — and **nothing is passed on what it filled in.** Before 2026-10-11 these checks passed on
Packwright's own defaults, which are compliant by construction: a request carrying only a GTIN came back with
its magnification, bar height and quiet zones passed.

**Checks that wait for a value you can give.** A barcode's magnification and bar height, and whether its digits
are printed, are design values you can read off the artwork. Leave one out and its check appears under "checks
that did not run", naming the field; give it and the check runs on your figure.

**Checks no description can answer.** These appear under "checks that did not run" as limits of this tool, and
give no verdict either way:

- **The Nutrition Facts type sizes** (21 CFR 101.9(d)). They are given in points, and a description can only
  scale Packwright's own sizes, not state the ones your panel is printed at.
- **The "Contains" statement's type size and place** (FD&C Act §403(w)(1)(A)), which the statute measures
  against the ingredient list beside it: how close the two print is where Packwright stacked them.
- **Every other US food type size**: the net quantity (101.7(i)), the information panel (101.2(c)) and a unit
  container's statement. The regulations measure the height of the printed letters — "it is the lower case letter 'o' or its equivalent that shall meet the minimum
  standards" (101.7(h)(2)) — and how tall a type size's letters print depends on the typeface, which a description
  does not carry and Packwright measures in its own. A bound was considered and dropped: type designers make no
  rule that a letter fits within its type size, and some faces exceed it, so not even a very small figure fails in
  every typeface.
- **Where the net quantity sits, and how far it is from the printing around it** (both under 101.7(f)): these
  are positions Packwright chose, not ones measured on your label.
- **A barcode's quiet zones**: the clear space is measured against every mark printed around the symbol, and a
  description carries only the barcode and one block of artwork. Check the printed symbol with a barcode
  verifier.
- **A dual-column panel's form**: its headings and cells are checked, but its pass also certifies the line
  between the columns and equal prominence, which are matters of printing and type size.

**A label described without its size.** The size can be left out of a `check_label` request. Nothing is assumed
in its place: everything that does not depend on it is checked, and every check that does waits for it under "checks
that did not run". That covers the label's own size against CLP's Table 1.3, and on a US food label any format,
small-package exemption or excused second column that turns on how big the package is. A claim the principal display
panel alone already rules out is still reported, since a label can only add area. And **whether the text fits on the
label is not checked at all**: with no size there is no edge to run off, so nothing is said about fit either way.

On a label Packwright draws — the editor and the export — every one of these is checked, because the drawing is
what prints.

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
