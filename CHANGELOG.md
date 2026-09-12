# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This is a development log first and a release log second — entries accumulate under Unreleased and are cut
into a version only when there is a reason to.

## [Unreleased]

### Added

Phase 5, stage 6 (in progress) — which display a package may use. The selection rule first, because it is
what makes five variants worth having rather than five ways to draw one panel; the reduced displays
themselves follow.

- **They are permissions, and the rule reports accordingly.** 21 CFR 101.9(j)(13)(ii) opens "Foods in
  packages that have a total surface area available to bear labeling of 40 or less square inches **may**
  modify the requirements". So `us-food/nutrition-format` reports a label using a display it is not entitled
  to, and never demands that a small package use one — reading a permission as an obligation is what CLP
  Article 26's "optional" clauses already taught this project.
- **Two thresholds, and only one of them is inclusive.** A tabular or linear display is permitted where the
  area is "less than 12 square inches", or where it is "40 or less square inches and the package shape or
  size cannot accommodate a standard vertical column". Twelve itself falls to the second limb and needs the
  declaration; forty does not.
- **Linear is gated behind tabular.** "Nutrition information may be given in a linear fashion only if the
  label will not accommodate a tabular display" — so a package entitled to tabular is still not entitled to
  linear.
- **The area (j)(13) measures is not the principal display panel.** 101.1 computes the panel for the net
  quantity; (j)(13) measures the whole surface available to bear labeling. Two different numbers answering
  two different questions, and a label now carries both rather than one standing in for the other.
- **The linear display, drawn.** 101.9(j)(13)(ii)(A) puts the information "in a tabular or ... linear (i.e.,
  string) fashion rather than in vertical columns", and that is the whole of what makes it linear — one run
  of text at 35 mm where the vertical panel is 129, which is why a small package can carry it at all. It
  keeps the heading (d)(2) requires and drops the footnote for the abbreviated "% DV = % Daily Value" that
  (j)(13)(i) permits in its place.
- **Per-format type minimums, and the two Calories figures move independently.** (d)(1)(iii) drops the
  Calories *word* to 10 point in **every** tabular display — (d)(11), (e)(6)(ii) and (j)(13)(ii)(A)(1) — but
  the *numeral* to 14 only on the small-package tabular and the linear one. One exception lists three
  paragraphs and the other lists two, so (d)(11)'s ordinary tabular display keeps a 22 point numeral beside a
  10 point word. Both servings lines drop from 10 to 9; the nutrient rows stay at 8 and the small print at 6,
  with no exception stated for either.
- **The tabular display, drawn** — the serving information in a left-hand block and the nutrients in columns
  beside it. 188 x 26 mm against the vertical panel's 64 x 129, which is the whole of what it is for.
- **A second entitlement to it that does not run through (j)(13) at all.** 101.9(d)(11)(iii): "If there is
  not sufficient continuous vertical space (i.e., approximately 3 in) to accommodate the required components
  of the nutrition label up to and including the mandatory declaration of potassium, the nutrition label may
  be presented in a tabular display." A package of any size qualifies, so a rule knowing only the area route
  would have reported a tall thin label squarely within this one. It reaches the tabular display and not the
  linear one, which stays behind (j)(13)(ii)(A)'s areas and its own gate.

- FDA's illustrations annotate the linear display "all type sizes are 6 point", which cannot be squared with
  the 9, 10 and 14 point minimums the regulation states. The regulation governs — the annotation came out of
  a PDF that had to be decoded rather than read, and a fragment is not a reason to disbelieve the text.

- Whether a shape "cannot accommodate" a display and whether a label "will not accommodate" a tabular one are
  facts about a package that no artwork shows, so they are declared and never inferred — the GHS
  small-container call for the fourth time in this phase.

Phase 5, stage 5 — the Nutrition Facts panel drawn. The standard vertical display only; the other five
formats are stage 6, on the reasoning phase 2 used for label types.

- **The rule weights are cited, not invented.** `fda/nutritionPanel.ts` carries the ½ pt box, the 7 pt
  section bars, the 3 pt bar under Calories and the ¼ pt hairline between nutrients, each with the FDA
  sentence it came from. They survive to the PDF exactly — a 7 pt bar measures 2.469 mm in the exported
  file, a hairline 0.088 mm.
- **The footnote is quoted.** 21 CFR 101.9(d)(9) states it verbatim, so it is looked up like an H-statement
  and never composed, with both variants the paragraph gives: 1,000 calories for a food for children 1
  through 3, and the first sentence alone for a food that may bear the §101.60(b) calorie-free terms.
- **Every nutrient row is its own element**, so a finding about Added Sugars outlines the Added Sugars line.
  Ten finding sites were anchored to the whole principal display panel until this stage, which is the GHS
  pictogram lesson repeating: a finding pointing at an id nothing resolved sets the selection and draws
  nothing.
- **The form rail for the panel**, and it is where the fact/print split earns itself. The amounts are what
  the food contains; the rail shows beside each what will actually be printed, rounded by 101.9(c) and
  percented by (d)(7)(ii) or (c)(8)(iii) as the nutrient requires — so the rounding is visible as it happens
  rather than arriving later as a finding. Behind one toggle sit the overrides that let the panel print
  something else, which is the only way the rounding and percentage rules can be reached from the editor at
  all.
- A sixteenth rule, `us-food/nutrition-type-size`, for the sizes 101.9(d) *does* state — 22 point heading,
  16 point Calories, 10 point serving size, 8 point nutrient rows. It measures in **points, not letter
  heights**: every other type-size rule here converts through `glyphHeightMm` because 101.7(i) and 101.2(c)
  state a letter height and 101.7(h)(2) says which letter, but 101.9 states a *type size* and never mentions
  a letter, so converting would answer a question the paragraph does not ask.

Phase 5, stage 4 — the Nutrition Facts panel as content: what is declared, in what order, rounded how, and
against which Daily Value. Four rules and the reference table they are measured against. The panel's geometry
is stage 5; these rules read the document, because whether 8.7 grams of fat was rounded to 9 is a fact about a
number rather than about where ink lands.

- **Two different rounding rules share the one % Daily Value column**, which is the trap in 21 CFR 101.9.
  **(d)(7)(ii)** rounds a nutrient with a DRV "to the nearest whole percent"; **(c)(8)(iii)** rounds a vitamin
  or mineral "to the nearest 2-percent increment up to and including the 10-percent level, the nearest
  5-percent increment above 10 percent and up to and including the 50-percent level, and the nearest
  10-percent increment above the 50-percent level". Applying either to both is wrong in a way nobody notices,
  because the two agree often enough to look correct — iron at 8 mg of an 18 mg RDI is 44.4 percent, which is
  **44** under one rule and **45** under the other, and only one of those is what the label prints.
- **The regulation works four examples and they are the strongest golden vectors available.** 101.9(d)(8)
  prints "(e.g., Vitamin D 2 mcg 10%, Calcium 260 mg 20%, Iron 8 mg 45%, Potassium 235 mg 6%)". The last is
  the useful one: 235 of 4,700 is *exactly* 5.0 percent, halfway between the 4 and the 6 that the 2-percent
  banding allows, and nothing in the text says which way a tie goes. The printed 6 does. Round half down and
  that example breaks, which is why it is a test.
- **Order comes from the regulation, not from the sample label.** 101.9(c) requires the nutrients "in the
  following order", so the order is (c)(1) through (c)(8) and their subparagraphs; (c)(8)(ii) fixes the four
  vitamins and minerals separately as "vitamin D, calcium, iron, and potassium in that order".
- **Trans fat and total sugars carry no Daily Value and their cells stay blank.** Neither appears in the
  (c)(9) DRV table, and inventing a figure would fill a cell the regulation leaves empty.
- **Either basis is permitted for the percentage, and they often disagree.** 101.9(d)(7)(ii): "The percent
  shall be calculated by dividing **either** the amount declared on the label for each nutrient **or** the
  actual amount of each nutrient (i.e., before rounding) by the DRV". 8.7 g of fat declared as 9 g is 11
  percent one way and 12 the other, and both are proper. A rule computing one of them would report a violation
  against a label that took the other.
- **Protein's percentage is not checked**, and that is recorded rather than quietly skipped. The same
  paragraph says it "may be omitted", and where it is given, (c)(7)(ii) corrects the amount by a digestibility
  score no label carries.
- The conditional exemptions inside (c)(2)(i), (c)(3) and the two sugars paragraphs are **not applied**: each
  relieves a nutrient below a threshold "if no claims are made" about it, claims are 21 CFR 101.13, and this
  label carries none — so the condition cannot be evaluated and the relaxation is not taken.

- `DESIGN.md` calls these "13 mandatory nutrients". The regulation produces **fifteen** declared lines, and
  fifteen is what ships — the count in the plan was a recollection and this is the section.

Phase 5, stage 3 — the nine major food allergens. Two rules, from a statute rather than from 21 CFR 101.

- **`fda/allergens.ts`, the §201(qq) table**, in a module named for the regulator the way `gs1/` and `ghs/`
  are. The nine names are the Act's own words and are looked up, never composed: "Crustacean shellfish" is
  capitalised as the Act capitalises it, "tree nuts" and "soybeans" are plural there and singular nowhere. A
  label reading "Contains: Shellfish" has not declared what the Act asks for, so the table may not quietly
  normalise them.
- **§403(w)(2) is the trap, and three of the nine fall into it.** The food source name is §201(qq)(1)'s name
  — except "in the case of a tree nut, fish, or Crustacean shellfish", where it means "the name of the
  specific type of nut or species of fish or Crustacean shellfish". So "Contains: tree nuts" declares
  nothing and "Contains: almonds" does, while milk, egg, wheat, peanuts, soybeans and sesame are named by
  their category. `foodSourceName` returns **undefined** rather than falling back to the category when no
  specific type is given, because inventing "almonds" for an unspecified tree nut would be this engine
  composing the regulated string it exists to check.
- **The rule reads the printed label, not the document**, and that collapses four clauses into one
  measurement. §403(w)(1)(A)'s "Contains" statement, (B)'s parenthetical, (B)(i)'s ingredient whose own name
  carries the source — `buttermilk` for milk — and (B)(ii)'s source appearing elsewhere in the list are all
  just "the name is printed", and the statute treats them as equally sufficient. The one place they differ is
  (B)(ii)'s caveat, that the appearance must not be "part of the name of a food ingredient that is not a
  major food allergen": coconut milk contains no dairy, so non-allergen ingredient names are struck out of
  the list before it is searched.
- **The first *relative* type-size requirement in the project.** §403(w)(1)(A) sizes the "Contains" statement
  against the ingredient list rather than against a figure in a table, which is why it needs the letter
  heights `text/metrics` generates: comparing `fontSizeMm` to `fontSizeMm` would be right only while both
  blocks shared a typeface, and would stop being right the moment one did not. Adjacency is measured too, with
  an allowance taken off the list's own line advance rather than guessed.
- Four clauses **deliberately not modelled**, recorded as decisions: §403(w)(3)'s finding that labeling may
  substitute for the label, §403(w)(5)'s power to modify the two forms by regulation, and the §403(w)(6) and
  (7) petition and notification exemptions. All four are facts about a Federal Register docket rather than
  about a label.

Phase 5, stage 2 — what the food is made of, and who is answerable for it. Four rules from 21 CFR 101.4 and
101.5, and one from 101.2 that turned out to be the bridge between this stage and the next.

- **21 CFR 101.2(c) is the keystone, and it was not in the build list.** It sets the floor for everything on
  the panel — "in no case may the letters and/or numbers be less than one-sixteenth inch in height" — and
  then says "The requirements for conspicuousness and legibility shall include the specifications of
  §§ 101.7(h)(1) and (2)". That second sentence incorporates the casing rule stage 1 built for the net
  quantity, so the same function answers which letter is measured for the ingredient statement and the
  responsible firm. `netQuantityGlyphBasis` is `regulatedGlyphBasis` now, because it never was specific to
  the net quantity — it only looked that way from where it was first needed.
- **Ingredient order is checked against declared weights, not asserted.** A list of names in an order is a
  claim about predominance that nothing can test, so `UsFoodIngredient` carries a weight share and
  101.4(a)(1) becomes a rule with something to run on. The engine draws the order it is given and never
  sorts: a list sorted on the way to the canvas is a defect that cannot be drawn, and therefore one that
  cannot be reported.
- **The 101.4(a)(2) grouping is a closed set of four figures** — "2 percent, or, if desired, 1.5 percent,
  1.0 percent, or 0.5 percent" — and nothing behind the quantifying statement may exceed the one chosen.
  Both halves are checked, and the API rejects a fifth figure at the boundary rather than drawing it: an
  impermissible threshold is a defect in the request, not a label this engine should render.
- **Two facts about the world are declared, never inferred**, following the GHS small-container precedent.
  Whether the named firm actually made the food decides whether 101.5(c) demands a qualifying phrase, and
  whether its address appears in a current city or telephone directory decides whether 101.5(d) demands a
  street address. Neither is answerable by looking at artwork. §101.100's ingredient exemptions are the same
  shape and get the same treatment.
- 101.5(c)'s qualifying phrase is **free text and deliberately not an enum**. The regulation gives
  "Manufactured for" and "Distributed by" as examples and then permits "any other wording that expresses the
  facts", so a closed list would reject compliant labels.
- 101.5(b) is **deliberately not enforced**, recorded as a decision. Whether a string is a corporation's
  actual registered name is a question about a companies register, and a rule guessing at it from the
  presence of "Inc" or "Ltd" would report confident nonsense about sole traders.

Phase 5, stage 1 — the net quantity of contents declaration. The first thing in this project to call
`geometry/pdp.ts`, written in phase 1 and unused by any label since.

- **Four rules, each measuring the declaration as drawn.** Type size against the panel area
  (`21 CFR 101.7(i)`), placement within the bottom 30 percent (`101.7(f)`), separation from other printed
  label information (also `101.7(f)`), and the inch/pound-plus-SI declaration (`15 U.S.C. 1453(a)(2)`).
  Six known-bad fixtures between them, each asserting code, severity and the exact citation string.
- **A fifth rule, `us-food/net-quantity-present`** — 21 CFR 101.7(a), "The principal display panel of a food
  in package form shall bear a declaration of the net quantity of contents." Added during the stage-1 review,
  for the reason under Fixed: the other four each decline when nothing is drawn, and four honest declines add
  up to a clean bill of health unless one rule owns the missing element. It reports `blocking`, the severity
  reserved for non-compliant as drawn.

- **The label stock and the package are now different geometries.** Earlier templates had one. A 120 × 170 mm
  label can sit on a carton, on a bottle or on a wedge of cheese, and 21 CFR 101.1 computes a different panel
  area for each — the full face, 40 percent of height × circumference, or 40 percent of total surface. The
  type-size band comes from the container and the placement zone from the drawn panel, so `UsFoodLabelData`
  carries both and the two are not interchangeable. A fixture makes the gap concrete: a 60 × 90 mm wrap on a
  200 mm bottle is 8.37 in² of label around a 37.20 in² panel, and sizing type to the label understates the
  requirement by a third.
- **The compliant type size is derived; the wrong one has to be stated.** With no `netQuantityFontSizeMm` the
  engine computes the em that meets 101.7(i) for this panel, this marking method and this casing, so the
  default label passes — and the suite asserts that rather than the comment claiming it. Supplying the field
  draws that size instead, which is the only way an undersized declaration reaches the rule. Same shape as the
  GHS engine deriving a pictogram set unless one is stated.
- **The editor, the rail and the export route, for a third label type.** `UsFoodFormRail.vue`, a third
  branch in `EditorFormRail`, a `POST /api/labels/us-food/export` route and a `us-food` arm on the store.
  The rail shows the panel area and the letter height the table demands as the container is typed, both read
  from `label-core` rather than restated — the same discipline that has the GHS rail read its small-container
  threshold from the rule that enforces it.
- The container reaches the API as a **discriminated union**, not one object with every dimension optional.
  A request carrying a circumference *and* a panel width describes two packages, and Zod rejects it at the
  boundary rather than letting the engine choose which one was meant.

- Vertical font metrics. `FaceMetrics` gains `lowercaseOHeightEm` and `capHeightEm`, generated from the
  embedded TTFs alongside the advance widths that were already there, with `glyphHeightMm` and
  `fontSizeMmForGlyphHeight` in `text/measure` to convert. The generator now fails rather than emits if the
  cap height taken from the `H` outline disagrees with the font's own `OS/2.sCapHeight`, or if the `o` does
  not exceed `OS/2.sxHeight` by a small overshoot — two bounds against tables it did not produce.

Phase 4, stage 6 — small containers, which are two different rules rather than one.

- `29 CFR 1910.1200(f)(12)` and CLP Annex I 1.5, both read from source. They are not the same provision with
  different numbers: OSHA sets a **requirement** — at 100 ml or less, a reduced but mandatory minimum set —
  while CLP grants a **permission**, allowing statements to be omitted at 125 ml or less for listed hazard
  categories. Different thresholds, different contents, and only OSHA names a statement pointing at the outer
  package.
- **Neither applies on capacity alone, so the supplier declares it.** OSHA's applies only where the
  manufacturer "can demonstrate that it is not feasible to use pull-out labels, fold-back labels, or tags", and
  CLP's hangs on Article 29. Both are determinations about packaging and process that no inspection of a label
  can settle. A rule switching on capacity would be enforcing a provision nobody invoked — so a 50 ml label
  that has not invoked it is still judged in full, and the rail says only that a lighter path exists.
- The telephone number is checked, because both regimes name it explicitly and it is optional everywhere else
  on the label — the element most easily left off.
- The 3 ml tier in (f)(12)(iii) is **deliberately not encoded**. It turns on whether "any label interferes with
  the normal use of the container", and encoding the relaxation without its condition would let a label drop
  its pictograms on a capacity check alone.

### Changed

- Form controls are both nested in their label and associated by `for`/`id`. The accessibility lint requires
  both, and it is right to: the two associations are handled differently by different assistive technologies,
  and nesting alone is the one that silently degrades.

Phase 3, stage 2 — the rule engine. Six GS1 retail rules, each citing a clause that was read rather than
recalled, each shipping with a label that provokes it.

- `rules/` — a registry of rules, each a pure function from a resolved label to findings. It is the only place
  in the system permitted to say something is non-compliant. The `/rules` catalogue in phase 6 is generated
  from this list, so a rule that ships is a rule whose citation a user can go and read.
- The six: GTIN check digit, magnification against the 0.8–2.0 range, bar height against the minimum for its
  X-dimension, quiet zone against measured clear space, human-readable digits, and Digital Link URI syntax.
  Every citation traces to a phase 1 module where it was verified against a source — none is new research and
  none was written from memory.
- **Findings inherit their citation from the rule that produced them.** Hand-writing it at each `return` is
  how a quiet-zone message ends up carrying the bar-height clause: invisible in review, survives any test that
  only checks the code, and makes the whole report untrustworthy. `finding()` also refuses a code the rule
  does not declare, because the catalogue is generated from those declarations and an undeclared code would be
  invisible to a user browsing them.
- **An empty result means the rule did not apply, and that is not a pass.** No symbol to measure because the
  GTIN could not be encoded, no Digital Link configured, no quiet-zone figure verified for the symbology — in
  each case the rule says nothing rather than something reassuring. A check that could not run has not cleared
  anything.
- Eight known-bad fixtures asserting the exact code, severity **and citation string**, plus a conformant
  control that must produce nothing but passes. The defects are the ordinary ones — a transposed check digit,
  a brand block that took the quiet zone for artwork, a symbol scaled past what the specification allows — not
  contrivances chosen to make a test go red.
- The quiet-zone rule reads `clearSpaceLeftMm`, not `requiredQuietZoneLeftMm`. Comparing the requirement
  against itself is the shape this bug takes, and it passes every label put to it.
- Measurements are formatted through one place, and it discards representation error first. A UPC-A centred on
  60 mm stock leaves exactly 14.325 mm either side; in binary the two straddle the boundary two-decimal
  rounding turns on, so the rail read "14.33 mm / 14.32 mm" for a label symmetric to the micrometre. X-dimensions
  get three places, since the permitted range spans 0.264 to 0.660 and two places cannot tell 0.264 from 0.26.
- **Two rules deliberately not shipped, recorded here so they read as decisions rather than oversights.** A
  distinct `GS1_SYMBOL_CLIPPED_BY_TRIM`: the quiet-zone rule already catches it — clipped bars measure as
  negative clear space and the message says so in millimetres — and no clause has been confirmed that treats
  bars running off the trim as separate from a quiet-zone failure. And the Sunrise 2027 2D-placement notice:
  the symbol adapter rejects two-dimensional symbologies outright, and the guidance needs a verifiable GS1
  reference before it can carry one.
- `rules` added to both export guards. Neither is a sweep — they are hand-maintained checklists, which is
  exactly why the manifest subpath was missed twice before; the barrel guard was confirmed to fail, naming the
  dropped symbols, before being relied on.

Phase 3, stage 1 — making a label able to be wrong. The rule engine has nothing to catch unless the layout
engine will draw a non-compliant label, and it would not.

- **The engine resolves; it no longer refuses.** It used to throw when a symbol's quiet zone would not fit the
  stock, or when the magnification fell outside the 0.8–2.0 the specification permits. The reasoning was
  sound — silently shrinking a symbol produces a label that looks right and does not scan — but refusing is
  worse, for a reason that only surfaces a layer up: a label that cannot be resolved cannot be measured, so
  the quiet-zone rule had nothing to run against and could never fail. Every rule in this project ships with a
  known-bad fixture, and there were no known-bad labels to write one from. The engine now draws what it was
  asked for, off the edge of the stock if that is what the inputs describe, and `rules/` says what is wrong.
  What still raises `LayoutError` is input that describes no drawing at all: a magnification of zero, stock
  with no area, a GTIN that is not twelve digits.
- **`ResolvedSymbol` now separates the requirement from the measurement.** `quietZoneLeftMm` was
  `9 * xDimensionMm` — a restatement of the specification, true of every UPC-A ever drawn — under a name that
  read like a measurement. A quiet-zone rule written against it would have passed every label put to it. It is
  now `requiredQuietZoneLeftMm`, alongside `clearSpaceLeftMm`, which is what this label actually leaves blank.
  Only the second can fail.
- `layout/clearSpace.ts` measures that blank space to the nearest encroaching element or to the trim edge,
  whichever is closer, and goes negative when the bars themselves run off the label — "the quiet zone is 0 mm"
  and "the symbol is 1.35 mm off the edge of the stock" are different problems and the caller has to be able
  to tell them apart. It excludes the symbol's own boxes, because an EAN/UPC prints its first digit in the
  left quiet zone and its check digit in the right; counting those fails every conformant label.
- **`ResolvedLayout.elements` — the box the engine allocated to each element.** Primitives are for drawing;
  boxes are for measuring. It exists because a `TextPrimitive` has no width: deriving one needs font metrics,
  which `label-core` deliberately does not carry, so measuring encroachment primitive-by-primitive would be
  guesswork for exactly the elements most likely to encroach. The engine knows what box it set aside, so it
  says so once instead of every consumer guessing. It also gives the finding-to-canvas highlight something to
  outline and the text-equivalent view something to enumerate.
- **`ResolvedLayout.omissions` — anything the engine could not draw, and why.** bwip-js rejects a UPC-A whose
  check digit is wrong (`upcAbadCheckDigit`), and it is right to: a UPC-A's twelfth digit *is* the check
  digit, so such a barcode cannot exist. Rather than throw, or quietly encode a corrected GTIN the user never
  asked for, the engine omits the symbol and records why. The rest of the label still resolves. An omission is
  a fact; the verdict and the citation belong to `rules/`.
- **`UpcALabelData.gtin` takes the full twelve digits as printed**, replacing the eleven-digit `gtinPayload`
  whose check digit was computed. Computing it sounds like a feature and is in fact the removal of a check:
  the commonest real defect in a supplied GTIN is a transposed digit, and an engine that recomputes the check
  digit silently accepts the wrong product. `completeGtin` remains for minting a new identifier.
- An artwork block with a nine-position anchor, and the same anchoring for the symbol. A brand block crowding
  a barcode is the ordinary way a real quiet zone gets lost, and without a second element on the label the
  only thing that could ever violate one was the trim edge. Nothing is clamped: a box larger than the panel is
  drawn hanging off the stock, because nudging it back inside would hide the defect.
- `digitalLink` on the label data — held as data rather than a finished URI, so the rules can hand it to
  `buildDigitalLinkUri` and report what that rejects instead of a second implementation of the same syntax
  drifting away from the first.
- The print-test sheet's sabotaged control now emits its obstructions as elements as well as ink, so the sheet
  states in millimetres what it is asking the phone to fail on.

Phase 2, stage 3 — design tokens, IBM Plex and the canvas. The label now reads as paper on a work surface,
and the type in the export is the type on the screen.

- Design tokens in `apps/web/src/assets/main.css`: warm-neutral graphite chrome — ink rather than blue-black,
  so paper-white reads warm against it and the high-chroma severity colours sit still instead of shouting —
  plus a true paper-white canvas and the IBM Plex scale.
- **The severity scale is derived from the ANSI Z535 signal words, not taken from the standard.** Z535.1
  specifies safety colours in Munsell and CIE coordinates and is paywalled; even the Pantone equivalents that
  circulate are described by the standard itself as reference-only and not valid for compliance. So these are
  hues chosen to read as DANGER / WARNING / CAUTION / NOTICE / safety-green against this chrome. They are
  interface colours, they are not a claim about what the standard prints, and nothing generated onto a label
  may take its colour from them. A test asserts the file says so.
- Contrast is measured rather than assumed. `theme.test.ts` parses `main.css` and checks every severity
  against every surface it can sit on — all clear 4.5:1 — and the palette is declared once, in the CSS, so
  the test reads what ships instead of a second copy. Two results worth recording: `chrome-500` fails as body
  text at 3.01:1 and is a hairline token only, and warning and pass differ in luminance by a factor of 1.06,
  which is near-identical in greyscale and exactly why colour never carries meaning alone here.
- That guardrail is enforced, not just documented. Writing the rule in a comment did not stop `chrome-500`
  being used for the citation lines on the landing view, so a test now scans the components for it — and was
  verified to fail, naming the offending file, before being relied on.
- IBM Plex Sans and Mono vendored from IBM's own releases under the OFL, in `assets/fonts/` — woff2 for the
  browser, TTF for the PDF. Deliberately outside `packages/`, which is an npm workspace glob.
- **The PDF embeds Plex rather than substituting Courier.** Type is geometry too: a different face means
  different advance widths, so preview == print was true of the bars and only approximately true of the
  digits. Both paths now draw from the same four font files.
- `LabelCanvas` renders the label true-scale on the field, with crop marks at the corners, a dimension
  callout with tick ends, and a live readout in tabular figures. Verified in a real browser at 100%: a 60 mm
  label measures 227 px, which is 60 mm at 96 dpi.
- The landing view renders a real label through the real engine in the browser — the same `layOutUpcALabel`
  the API export calls — rather than showing a picture of one, and no longer uses placeholder styling.

Phase 2, stage 2 — the PDF renderer and export path. The second consumer of a `ResolvedLayout` now exists,
and with it the property the phase was built to establish: preview and print are the same drawing.

- `toPDF`, and the `PdfCanvas` interface it draws through. `label-core` never imports PDFKit — it runs in the
  browser too — so the canvas is described structurally and injected. A real `PDFDocument` satisfies it
  without knowing the interface exists, and a recording stub satisfies it in tests, which is what lets the
  renderer be verified without producing a PDF at all.
- A test that reduces both renderers to the geometry they were handed and compares them directly. If SVG and
  PDF ever disagree, one of them is doing arithmetic it should not be.
- `POST /api/labels/upc-a/export`. The API computes no geometry: it validates, calls the same engine the
  browser preview uses, and streams the result. A request that is well formed but impossible — a 2x symbol on
  stock too small to carry its quiet zone — is a 422 with the measurements that did not fit, not a 500.
- Assertions against a real exported PDF, read back out of the content stream: the MediaBox equals the stock,
  every bar lands within a micrometre of its resolved position, the bar pattern measures 31.35 mm in the file
  itself, and the digits are embedded as text rather than outlines so the export stays selectable.
- `npm run print-test --workspace @packwright/api` writes an A4 sheet carrying the same GTIN at 0.8x, 1.0x
  and 2.0x, plus a control whose quiet zone is deliberately obstructed. The control is the point: if every
  symbol scans including that one, the phone is being generous and the test proved nothing. Only the control
  failing means the spine is correct.
- Human-readable digits scale with magnification on the sheet. A fixed type size left the 2x symbol wearing
  digits sized for the nominal one, which misrepresents what a printed pack carries.

- npm workspace scaffold: `@packwright/label-core`, `@packwright/web`, `@packwright/api`
- Toolchain — TypeScript 6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4 with
  v8 coverage, ESLint 9 flat config, Prettier with the Tailwind class-sorting plugin, EditorConfig
- ESLint rule enforcing that `label-core` imports no framework — verified to fire, not just configured
- `Finding`, `Citation`, `Measurement` and `Severity` contracts, with severity mapped to the ANSI Z535.4 signal-word scale
- `ExtractionResult<T>` contract, defined ahead of any extraction producer so that the photo-audit path, a
  future SDS path, and an eval harness are all additive rather than refactors
- GS1 check digits — `calculateCheckDigit`, `appendCheckDigit`, `isValidCheckDigit`, `normaliseToGtin14`,
  covering GTIN-8/12/13/14 and SSCC-18
- GS1 Application Identifier table with charset, length and predefined-length rules, plus `validateAiValue`
- Element strings — `encodeElementString` (FNC1 separation, brackets never encoded), `formatHumanReadable`,
  `parseHumanReadable`
- GS1 Digital Link URI builder — numeric-AI paths, automatic GTIN-14 widening, normative qualifier ordering,
  attributes in the query string
- Geometry — unit conversion, PDP area for rectangular/cylindrical/other containers, FDA net-quantity minimum
  type size by panel area, X-dimension ↔ magnification, quiet zones
- Symbology constraints ported from `barcode-crud` — payload lengths, numeric-only flags, check-digit
  behaviour and pharmacode value bounds, with `validatePayload`
- `apps/api` — Express 5 app with a `/health` endpoint shaped for the ALB target group, JSON 404 and error
  handlers, and startup-time environment validation via Zod
- `apps/web` — Vue 3 + Vite 8 + Pinia + Tailwind 4 skeleton with the route inventory stubbed out
- GitHub Actions CI running lint, format check, `vue-tsc` typecheck, tests and build
- 146 tests; full CI sequence green locally
- `README.md` and `docs/DESIGN.md` — the design document now lives in the repo rather than outside it,
  so it is version-controlled alongside the code it describes and discoverable without a path

Phase 2, stage 1 — the rendering spine. A layout engine now produces a `ResolvedLayout`, a flat list of
primitives positioned in millimetres, and the SVG renderer consumes it without doing arithmetic of its own.
That is what makes preview == print structural rather than something two code paths have to keep agreeing on.

- `ResolvedLayout` and the `LayoutPrimitive` union — `rect`, `line` and `text`, every field in millimetres.
  Each primitive carries an `elementId`, so phase 3's findings can point at geometry rather than at intent.
  `ResolvedSymbol` records each barcode's measured position and quiet zones, so a rule can ask what was drawn
  instead of what was requested.
- bwip-js adapter. Two things had to be established by probing the library rather than trusting its
  documentation. At `scale: 1` one bwip-js unit is exactly one module, so a UPC-A comes back spanning exactly
  the 95 modules GenSpec figure 5.2.3.5-1 implies — which lets every millimetre trace to our own verified
  X-dimension. And its `height` option is in millimetres but converts at 72 units per inch, treating a unit as
  a point while horizontally a unit is a module; two unit systems in one call, so its vertical output is
  discarded and bar heights come from the specification instead.
- The symbol is requested with `includetext: false` and the human-readable digits are drawn separately. Not a
  stylistic choice: bwip-js's text metrics feed back into its bar positions, so supplying different metrics
  moves the bars. With text off the bar pattern is byte-identical regardless of font.
- Module-count and nominal-height tables for the EAN/UPC family, and the symbol structure — start guard 101,
  six characters, centre guard 01010, six characters, end guard 101. That composition sums to 95, closing
  against the specification's 113-module total less two 9X quiet zones, so guard bars and digit groups are
  positioned from arithmetic rather than measured off a rendering.
- `layOutUpcALabel` and the UPC-A template. A symbol that will not fit its stock is refused rather than scaled
  down, because shrinking it silently breaks the quiet zone and produces a label that looks right and does not
  scan.
- `toSVG` — pure string building, no DOM. Pairs `width`/`height` in millimetres with a bare-unit `viewBox` so
  one user unit is one millimetre, which is what makes a browser print at 100% produce a scannable symbol.
- A barrel-export guard. Checks what a consumer can actually import rather than what a regex finds in a file,
  and is verified to fail when an export is removed. It only sees runtime values, so type-only exports remain
  unguarded — stated in the test rather than left to look more complete than it is.

- `POST /api/labels/upc-a/export` takes `gtin` rather than `gtinPayload`, and no longer rejects a
  non-compliant label. A 2.5x symbol or a quiet zone lost to artwork is a finding, not a malformed request;
  refusing here would mean the export path and the preview disagreed about what a label is, which is the one
  thing this architecture exists to prevent. A magnification of zero is still a 400.

- Retargeted from Node 22 to **Node 24** (Active LTS; 22 is in maintenance)
- Prettier now owns formatting outright — added `eslint-config-prettier` after
  `eslint-plugin-vue`'s stylistic rules started arguing with it over the same lines
- CI actions bumped to `actions/checkout@v5` and `actions/setup-node@v5`. The v4 pair targets
  Node.js 20, which GitHub has deprecated on its runners and was force-running on Node 24.
- CI now runs on pushes to `dev` as well as `main`. `dev` is the integration branch — everything is cut from
  it and merged back to it — but the push trigger still named only `main`, so the branch carrying all the work
  was the one branch CI never watched. Pull requests were always covered; direct pushes were not.

### Fixed

Phase 5, stage 6.

- The format rule's **pass cited the rule's own paragraph rather than the one that granted the permission**,
  so a label entitled under (d)(11)(iii) was cleared under (j)(13)(ii)(A). `finding.ts` records this exact
  mistake shipping once before — a passing GHS signal-word check reporting under the EU regulation on a US
  label — which is why `passed()` takes a citation at all.
- The tabular display was held to the vertical one's 2.5 inch width and **stacked into a single column**,
  which is the shape it exists to avoid. The reduced displays take the whole panel now.

- The linear display was drawn without the heading 101.9(d)(2) requires, **and a comment beside it claimed
  the heading was there**. The reduced displays are excused from setting it "the full width of the
  information provided under paragraph (d)(7)" — not from carrying it. A comment asserting what the code
  does not do is the same defect the box-rule comment had one stage earlier.
- The type-size rule reported "0 parts of the panel meet the type sizes" as a **pass** on a linear display,
  where one undifferentiated run leaves no servings line, serving size or Calories element to measure. A rule
  with nothing it can identify has declined, not cleared.
- A mutation escaped: putting the tabular Calories numeral back to 22 point left the suite green, because
  nothing tested the tabular column of the minimums table at all. It is pinned now, along with the property
  that every reduced figure is lower than its vertical counterpart and none is higher.

- **A "shall" the panel was not drawing.** 101.9(d)(1)(v): "A hairline rule that is centered between the
  lines of text **shall** separate 'Nutrition Facts' from the servings per container statement and shall
  separate each nutrient and its corresponding percent Daily Value ... from the nutrient and percent Daily
  Value above and below it." One sentence, two places, and the panel drew the second and not the first —
  which is exactly why it went unnoticed: the half that was present made the half that was missing look
  handled. Found while reading (j)(13) for something else.
- The test guarding the hairline placement said "no rule above the first nutrient row", which was true when
  written and too broad the moment a required rule appeared higher up. It is scoped to the gap it meant.

Phase 5, stage 5 review. Nine findings, and the two worth naming first are both cases of a *shall* and a
*may* being treated alike.

- **Fat under half a gram must be declared as zero, and was being rounded up to 0.5.** 21 CFR 101.9(c)(2):
  "If the serving contains less than 0.5 gram, the content **shall** be expressed as zero." The gram
  nutrients at (c)(6) and (c)(7) get a *may* for the same threshold, and the two were implemented alike — so
  0.4 g of fat came back 0.5, a compliant "Total Fat 0g" was reported as a violation, and a derived panel
  printed the figure the regulation forbids. A test asserted the wrong answer, which is how it survived.
- **The heading was enforced at 22 points under a citation that says nothing of the sort.** 101.9(d)(2) is a
  *relative* requirement — "no smaller than all other print size in the nutrition label except for the
  numerical information for 'Calories'" — and the 22 points comes from FDA's nonbinding illustrations. A
  panel scaled down in proportion complies and was being reported. The relative requirement is now not
  checked either: this engine always draws the heading largest, so a rule for it could never fail — the same
  call 101.7(f)'s "lines generally parallel to the base" already gets.
- **The percentage finding printed the Daily Value where it meant the declared amount**: "12% is what 78 g
  gives". 78 g is the Daily Value, which gives 100%.
- **The percentage pass counted nutrients it never checked.** A declared percentage with no amount behind it
  could not be recomputed, so it was neither reported nor verified — and the pass said it matched.
- **The panel printed a protein percentage the rule deliberately declines to check.** 101.9(c)(7)(ii)
  corrects protein by a digestibility score no label carries, and (d)(7)(ii) says the percentage "may be
  omitted" — so printing an uncheckable figure was the worst of the three options.
- Clearing the type-scale field set `typeScale` to **zero** — `'' / 100` — and drew the whole panel at
  zero-size type.
- The order rule walked the *expected* entries rather than the listed ones, so everything past the end went
  uninspected and a duplicated trailing nutrient passed.
- `'food-nutrition-row-'` was spelled out in three files. It is exported from one now; drift would have had
  the 101.2(c) rule reporting every compliant 8 point nutrient row.
- A comment said the box rule is "drawn last" where `unshift` draws it first. The code was right and the
  comment would have talked a reader into breaking it.

Phase 5, stage 5.

- **The row elements existed and no rule used them.** Stage 5 gave every nutrient its own element to pay off
  the debt stage 4 recorded, and the four nutrition rules went on anchoring their findings to the principal
  display panel — so clicking a finding about Iron outlined the entire label. The web test that clicks it is
  what caught it, which is the argument for driving the editor rather than asserting on rule output alone.
  Findings about one nutrient point at that nutrient now; findings about the panel point at the panel.
- **21 CFR 101.2(c) does not govern the Nutrition Facts panel, and applying it would have condemned every
  compliant label in the country.** 101.2(b) does list 101.9 among the sections whose information belongs on
  these panels, so a literal reading puts the 1/16 inch floor over the nutrition label too. It cannot be the
  reading: 101.9(d)(7)(iii) sets the nutrient rows at "no smaller than 8 point", and 8 point of IBM Plex puts
  the lowercase "o" at 1.52 mm against a 1.59 mm floor. The specific provision governs, and 101.2(d)(1)
  already defers to 101.9 by name elsewhere. The panel is excluded, and stage 5's own rule checks the sizes
  101.9 sets.
- **The default stock could not carry a compliant label.** The panel alone is 129 mm tall, so on the previous
  120 × 170 mm stock everything below it ran off the substrate — caught by the overflow omissions added in
  the phase 5 review rather than by anyone noticing. It is 120 × 240 mm now, still 44.64 in² and still in the
  same 3/16 inch band. That the old stock was too small is the sort of thing only drawing it reveals.
- **A prefix collision made the panel fail its own rule.** Generated row ids read `food-nutrition-<id>` and
  the fixed ones `food-nutrition-heading`, `-servings`, `-footnote`, so a rule selecting "the nutrient rows"
  by prefix picked up the 6 point footnote and reported it against the 8 point row minimum. Rows are
  `food-nutrition-row-*` now.
- **A rule was drawn where no printed label has one.** The hairline between nutrients was keyed off the loop
  index, and Calories occupies index 0 while being drawn in its own block further up — so a hairline landed
  under the "% Daily Value" heading. It counts rows actually drawn.
- **The separation rule counted one block of ink sixteen times.** Both the panel box and its fifteen rows
  were neighbours, so the pass read "stands clear of the 24 other elements" on a label carrying five printed
  blocks, and a single crowding could have produced a finding per row. The box stands for its contents.
- **`typeScale` was unreachable through the API**, and it is the only way to draw a panel under the minimums
  — so the type-size rule could not be exercised from there at all.
- **The §101.9(j) exemption had shipped in stage 4 with no test.** It appeared in the suite only as *setup*
  for a separation case, which is how a documented branch ends up uncovered while every code it emits looks
  accounted for. It is asserted now, including that claiming it does not excuse a panel printed anyway.

Phase 5, stage 4 review.

- **One blank ingredient row undeclared every allergen on the label.** §403(w)(1)(B)(ii)'s caveat is
  implemented by striking non-allergen ingredient names out of the printed list before searching it, and
  `split('')` splits between every character — so a single empty name turned the list into spaced-out letters
  and nothing was ever found in it again. The rail's "Add an ingredient" button inserts exactly that row, so a
  label printing `whey (milk)` reported milk undeclared the moment a user clicked it, and went back to clean
  when the row was filled in.
- **A nutrient the panel held but did not print was reported by nobody.** The order rule narrows its
  expectation to what `order` lists and leaves omissions to the completeness rule; the completeness rule was
  reading `amounts`. A panel listing 14 of 15 came back "All 15 mandatory nutrients are declared" beside
  "14 nutrients run in the order 101.9(c) sets" and no failures at all. Completeness judges what is printed
  now — where an order is stated, that order is the panel.
- **The example label declared an allergen the food does not contain.** The seeded document marked
  `whole grain rolled oats` as wheat, so the first label anyone opens printed `whole grain rolled oats
  (wheat)` and `Contains: wheat.` Oats are not wheat and are not one of the nine. On a tool whose only value
  is being right, the demo being wrong is the worst place for it to be. The example is oat and almond granola
  now, which is true and exercises §403(w)(2)'s specific-type requirement into the bargain.
- The fixture carried **two copies of the ingredient list** — a `BASE_INGREDIENTS` const and an inline array
  inside `BASE` that was never switched over — so the corrected allergen data landed in one of them and not
  the other, and a test written to catch exactly that caught it. Collapsed to one.
- Renaming the example's nut ingredient to `almonds` made two fixtures stop provoking their rules, because an
  ingredient whose own name carries the food source satisfies §403(w)(1)(B)(i) by itself. They use a name that
  says nothing now, which is the case worth testing anyway.

Phase 5, stage 4.

- **I invented the rounding increments for the vitamin and mineral weights, and the regulation's own worked
  example caught it.** The (c)(8)(iv) table sets units and Daily Values but no increments, and I filled the
  gap with 0.1 mg and 10 mg figures that looked reasonable. 101.9(c)(8)(ii) actually says the amounts use "the
  levels of significance given in paragraph (c)(8)(iv) ... except that zeros following decimal points may be
  dropped, and **additional levels of significance may be used**". So whole units is a baseline and not a
  requirement, 235 mg and 235.4 mg of potassium are both proper declarations, and no single value can be
  demanded. The invented 10 mg increment turned 101.9(d)(8)'s printed "Potassium 235 mg 6%" into 240 mg — the
  conformant fixture disagreeing with the regulation is what surfaced it. Those weights are no longer checked
  for rounding; their percentages still are.
- **Zod 4 makes a record over an enum key exhaustive**, so the API demanded all fifteen nutrients and answered
  400 to a panel declaring fourteen — the boundary refusing the very label the completeness rule exists to
  judge. It also rejected any single-nutrient override. `z.partialRecord` is the one that means what was
  meant.
- **Two mutations escaped, both on clauses I had gone to the source to get right.** Accepting only one basis
  for the percentage, and forcing the mineral weights to a single value, each left the suite green — the code
  was correct and nothing held it there. The subtle clause and the untested clause turn out to be the same
  clause, because subtlety is what makes a case easy to leave out of a fixture.
- A script asserted only that it had changed the file, so a two-replacement edit passed while one half of it
  silently missed its anchor and a value import was never added. Each replacement is asserted separately now.
- **A golden vector that could not fail.** The sodium rounding test asserted 148 mg rounds to 150, and its own
  comment said the point was to prove the band above 140 mg is 10 rather than 5 — but 148 rounds to 150 under
  either, so the vector proved nothing. A mutation collapsing the three sodium bands into one left the suite
  green. It asserts 163 → 160 and 145 → 150 now, which the 5 mg band cannot produce. The comment had described
  the right test and the assertion had not implemented it.

Phase 5, stage 3 review.

- **The relative type-size comparison failed the most ordinary layout there is.** §403(w)(1)(A) sizes the
  "Contains" statement against the ingredient list, and each block was converted through *its own* casing —
  an all-caps list on cap height, a mixed-case statement on the "o" — so two blocks set at an identical 4 mm
  em came out 2.79 mm against 2.16 mm and a typesetter who set both to one size got a violation. A comparison
  between two blocks has to use one basis on both sides or it is not measuring type size.
- **The engine composed an allergen declaration the recipe did not support.** A `containsStatement` id left
  behind after its ingredient's allergen was cleared still printed `Contains: milk.` on a food containing only
  sugar, because the source name fell back to the category. Nothing reported it either — the allergen rule
  returns early when no ingredient bears one — so the label came back with nine findings, all passes. An
  orphaned id now draws nothing and records an omission.
- **Two tree nuts could never both be named.** The statement was composed per allergen *id*, taking the
  specific type from the first matching ingredient, so almonds and walnuts drew `Contains: almonds.` and the
  rule then reported walnuts undeclared with no route through §403(w)(1)(A) that could fix it.
- **The form fabricated a food source name.** Changing an ingredient's allergen kept the specific type
  belonging to the old one, so fish/"cod" followed by tree-nuts produced `walnut pieces (cod)` — which the
  rule accepted, because as far as it could tell a source had been declared. And an allergen cleared from an
  ingredient lost its "Contains" checkbox while staying in the statement, leaving no way to untick something
  the label went on naming.
- **A duplicate import dropped a whole test file and the run still read green**: 585 tests passed with no
  failing test, because the 65 that could not load counted as nothing. `Test Files 1 failed | 34 passed` is
  the line worth reading. Checking `Tests` alone is how a suite quietly stops covering what it claims to.
- **Every phase 5 entry under this heading was written and silently lost, twice over.** The insert anchored on
  `"### Fixed\n\nPhase 4, "` where the file reads `"Phase 4 review."`; `str.replace` returns the string
  unchanged when it matches nothing, and every later anchor depended on the first having landed. Two commits
  shipped with their Added entries and none of their Fixed ones, and one entry described a code fix that had
  itself failed to apply. This changelog already records the same class of defect twice — "the patch to the
  shared text helper silently failed to apply and was never checked". Third time. Every edit here now asserts
  that it changed the file.

Phase 5, stage 3.

- **A rule that could not fail, caught before it shipped.** The engine appended §403(w)(1)(B)'s parenthetical
  wherever it knew an allergen, so an undeclared allergen was undrawable and `FDA_ALLERGEN_NOT_DECLARED` was
  unreachable — a check that clears every label put to it, the shape `ResolvedSymbol` was restructured to
  avoid and the reason 101.7(h)(1) was not shipped at all. Whether the parenthetical prints is stated on the
  ingredient now, the way both GHS signal words can be ticked.
- **The adjacency allowance was guessed and was wrong.** Measuring "immediately after or adjacent to" against
  the statement's em alone made it narrower than the gap the engine leaves between any two blocks, so every
  conformant label came back non-adjacent. It is measured off the ingredient list's own line advance now.
- The allergen table's lookup copied an `Object.hasOwn` guard out of habit and allocated a fresh nine-key
  object on every call to prevent nothing: a `Map` does not walk a prototype chain. That guard belongs on the
  plain-object tables in `text/metrics` and `ghs/statements` and nowhere else.
- The reference module is `fda/`, not `usFood/`, after `packageExports.test.ts` rejected the camelCase
  directory. The guard was right and the name was wrong — top-level modules are named for the body whose data
  they carry, which is what `gs1/` and `ghs/` already do.

Phase 5 review — findings across stages 1 and 2.

- **A quantifying statement covering the whole list produced a false pass.** With the grouped count at or past
  the length, the order rule sliced its list to nothing and reported "0 ingredients run in descending order of
  predominance by weight" — a pass, with a citation, about a list it had not looked at. The engine drew
  `INGREDIENTS: . Contains 2 percent or less of …` beside it. The form never lowered the count on removal and
  the API set no upper bound; all three are fixed, and the API refuses rather than clamping silently.
- **The 101.2(c) floor was read from one line of a wrapped element.** A statement breaking to an all-caps
  first line and a lower-case second was judged on the first and cleared at 2.5 mm of em while the responsible
  firm at the identical size failed at 1.35 mm. 101.7(h)(2) asks whether upper and lower case "are used" — of
  the text, not of a line of it.
- **Content ran off the stock and nothing said so.** Four hundred ingredients put two mandatory elements at
  509 mm and 516 mm on a 170 mm label with zero omissions recorded. This is the phase 4 defect repeating,
  where a product identifier set 88.9 mm on a 74 mm label ran off the substrate and was recorded nowhere.
  Blocks now record a detail omission when partly cut and an element omission when they start past the bottom
  edge, which gates the export.
- **Rounding reintroduced the em/letter-height defect one decimal place down.** The stage 1 review fixed the
  type-size override to seed from `fontSizeMmForGlyphHeight`; `toFixed(2)` then rounded 6.823066 to 6.82,
  0.002 mm short and past the tolerance, so ticking the box still reported a compliant label too small. A fix
  that is right to six places and wrong at two is still wrong.
- **The §101.100 exemption was excusing more than it grants.** Claiming it short-circuited the rule while the
  engine went on drawing the list, so a printed statement in the wrong order went unchecked. It relieves a
  food of having to *bear* a list, not of ordering one it prints.

Phase 5, stage 2.

- **A mutation escaped the suite and the gap it found was real.** Fixing the 101.2(c) rule's glyph basis at
  cap height instead of reading the casing left every test green, so nothing pinned the one clause that makes
  the rule correct. An all-lowercase ingredient statement measured on capitals clears type 23% under the
  floor.
- Two stage 1 tests asserted a literal pass count, which stage 2 made wrong the moment it shipped a fourth
  rule. They count against `US_FOOD_RULES.length` now — a total that has to be edited every time a rule lands
  is a test nobody trusts by the fourth edit.
- The "nothing else on the panel" separation test was passing for the wrong reason a second time, by the same
  mechanism: it cleared the statement of identity while the panel had since gained two more elements.

Phase 5, stage 1 review.

- **A label with no net quantity declaration reported three passes and no findings.** The engine drew an empty
  text primitive; the type-size rule measured the empty string, found it 4.76 mm "on capital letters", and
  passed it with a real CFR citation. Blank text now draws nothing, so all three measuring rules decline, and
  `netQuantityPresent` reports what is actually wrong. **Four rules declining is not four rules clearing.**
- **An absent statement of identity still occupied 7.8 mm of the panel.** `wrapTextMm('')` returns one empty
  line, so the engine pushed an invisible primitive and an element for it, and the separation rule measured
  the declaration against ink that will never be printed.
- **The form rail reintroduced the em/letter-height conflation this stage exists to remove.** Ticking "set the
  type size by hand" seeded an em with a 101.7(i) letter height, so taking control of the size on a compliant
  label wrote 4.76 mm and instantly produced a violation.
- **The rail authored half of a regulated statement.** The SI declaration was a checkbox that wrote `(340 g)`
  whatever the inch/pound half said, so `NET WT 5 LB (340 g)` passed with a conversion that is simply false.
  It is a typed field now, and empty means absent.
- **The metric exemption claimed a declaration "stands alone" when it did not.** Both exemptions are
  permissions, so a label can carry both and still be exempt.

Phase 5, stage 1 — found by reading 21 CFR 101 from the eCFR before building on `geometry/pdp.ts`.

- **`21 CFR 101.105` does not exist, and this project was about to cite it.** It is the number this same
  section carried until **81 FR 59129**, 29 Aug 2016, redesignated it as **101.7** — out of subpart G, where
  FDA noted it had never belonged because it "contains no information pertaining to when a food is exempt".
  Paragraph letters survived unchanged, and the 2016 edition of §101.105 is word-for-word identical to the
  current §101.7 on the type-size table. Much of the secondary literature still points at the dead number.
- **The measured letter depends on the casing, and `pdp.ts` said it was always the "o"**, citing 101.7(i),
  which is only the table. The measurement rule is **101.7(h)(2)**: capitals are the default and the "o" is
  the exception. `NET WT 12 OZ` is judged on its capitals, and assuming otherwise over-demands type by a
  third.
- **The em-to-letter ratio was assumed at about a half and is 0.540.** `text/metrics.ts` carried advance
  widths only, so the ratio was not measurable and `layout/types.ts` carried a standing prohibition on judging
  type size from `fontSizeMm`. An em is 1.852 lowercase "o"s and 1.433 capitals; comparing a requirement
  against `fontSizeMm` directly clears type at **54 percent** of the legal minimum.
- **The "o" is not the x-height**, and `OS/2.sxHeight` would have been wrong by 4.7 percent: a round letter
  overshoots at top and baseline. The rejected reading is kept as a test.
- **Dual metric/US units is not in 21 CFR 101.** FDA proposed SI declarations in 1993 and never took final
  action. The requirement is **15 U.S.C. 1453(a)(2)**, with exceptions cited to their own paragraphs rather
  than to the general clause.
- **101.7(i)'s closing sentence was missing entirely**: a declaration blown, embossed or molded into a glass
  or plastic surface needs a sixteenth of an inch more type. The CFR's own cross-reference in that sentence
  points at "(h)(1) through (4)" where it means (i)(1) through (4) — an error in the official text, now noted
  in a comment so a later reader does not "correct" it.
- **Two rules deliberately not shipped, recorded as decisions.** 101.7(h)(1)'s 3:1 cap, because
  `TextPrimitive` has no horizontal scale so the rule could not fail; and 101.7(h)(3)'s half-height allowance
  for fraction numerals, because the declaration is set as one run. The engine records an omission for the
  second.
- **Three comments denied a capability the tree now has**, written before phase 4 added the advance-width
  table and never updated when it did.
- **A fixture that proved nothing**, caught by inspecting what the rules actually returned: the molded-bottle
  case was sized on the reasoning that 6.823 mm gives capitals of exactly 4.7625 mm, but its declaration reads
  `NET WT 12 OZ (340 g)` and that lowercase `g` puts the run on the "o" basis, so it failed the *printed* band
  too and would have passed with the marking-method code deleted.

Phase 4 review. Fifteen findings from a full pass over the branch, and the most serious is about how the
regulatory data was checked rather than about any single line of it.

- **The duplicate-heading defect came back.** `## [Unreleased]` had accumulated seven `### Fixed` headings and
  two `### Changed` ones, because each stage's entry was inserted above the last rather than merged into the
  section that already existed. This changelog records fixing exactly that once before — "Duplicate `### Added`
  and `### Fixed` headings under one `## [Unreleased]`, created by an earlier insert". Same cause, same file,
  a second time. Consolidated to one heading per category in Keep a Changelog's order, with the content
  verified line-for-line against the previous version.

- **Twelve statements carried corrupted regulatory text, and the verification could not have caught it.** The
  check was "every extracted string appears verbatim in the source PDF" — computed with the same extractor on
  both sides, so any artefact it introduced matched itself. That proved the parser was self-consistent, not
  that the text matched the regulation, which is the shape `CLAUDE.md` explicitly warns against. EUR-Lex
  typesets the degree sign as a raised letter `o` that the text layer emits as a separate character, so `P412`
  stored *"50 o C/122 o F"* and would have printed that on a label; six more had a line break after a slash
  welded into a space, giving *"vapours/ spray"*. Each was corrected by rendering that row of the PDF at
  300 dpi and **reading it**, which is independent of the text layer in the way the original check was not. Two
  apparent defects turned out to be real and were left alone: `P250` and `P401` genuinely set a space before
  the closing full stop, and `P410 + P412` genuinely reads *"Do no expose"* where `P412` reads *"Do not
  expose"* — the regulation's own typo, pinned by a test so nobody tidies it away.
- **A mistyped hazard id produced a green pass.** `hazards` was accepted as free strings and unknown ids were
  silently discarded, so an id one character off drew *no pictograms at all* and the rules reported
  "every pictogram on the label is required by a declared hazard class" as a pass. The schema now validates
  against `label-core`'s own list, as it already did for signal words and pictogram codes. It is a 400.
- **A prototype key crashed the layout engine.** `hazardStatementText(regime, 'constructor')` returned a
  function rather than `undefined`, sailed past the `!== undefined` guard and threw on `text.split` — a 500
  from a well-formed request. The same defect class sat in the font metrics table and in the PDF exporter's
  face allowlist, which its own comment calls a security boundary. All three use `Object.hasOwn` now.
- **`pictogramSet` reintroduced the disagreement stage 5 removed.** It compared the drawn set against
  `requiredPictograms` rather than `applyPrecedence`, so it raised "GHS07 is required and is not on the label"
  for sets this tool had itself derived as Article 26-compliant.
- **Only statements were wrapped.** The previous entry claimed text wrapping was in place; it was in place for
  statements and nothing else, because the patch to the shared text helper silently failed to apply and was
  never checked. A realistic product identifier — mandatory under CLP Article 18 — set 88.9 mm on a 74 mm
  label and ran off the substrate with no omission recorded and no rule measuring it.
- **The label-size finding pointed at an element that did not exist.** It anchored to `label-border`, which
  neither engine ever put in `ResolvedLayout.elements`, so clicking it set the selection and drew nothing —
  the same silent break this engine records having fixed for pictograms. The label is now an element in its
  own right.
- Several omissions shared one element id, which `LabelTextView` keys its list on.
- The export button's explanation read `omissions[0]` while the button itself filtered on scope, so a disabled
  button could explain a non-blocking omission.
- Three copies of "which omissions block an export" and two of the download-filename sanitiser are now one
  each, in `label-core` beside the types they interpret. The small-container thresholds are read from the rule
  that enforces them rather than restated in the form — a regulatory figure written twice is one that drifts.
- `runRules` fell off the end of its switch for a label type `LABEL_TYPES` already declares, returning
  `undefined` where every caller expects an array. An exhaustiveness check makes that a compile error.

- `docs/DESIGN.md` described the small-container provision, and was wrong in four ways: it had the rule
  backwards (a permission to use fold-out labelling, where the regulation applies when fold-out labelling is
  *not feasible*), used "under 100 mL" where the text says "less than or equal to", omitted two of the five
  required elements — the manufacturer's phone number and the outer-package statement — and never mentioned
  the second tier at 3 ml. CLP's own derogation, a different rule at a different threshold, was absent
  entirely. Corrected against both sources.

Phase 4, stage 5 — precedence applied, not only reported.

- **The editor's own default output was non-compliant.** Deriving pictograms from a classification returned the
  raw Annex V set, so a chemical classified for serious eye damage and skin irritation produced the corrosion
  pictogram *and* the exclamation mark — and the precedence rule immediately flagged it. The form produced a
  label its own rules rejected. `docs/DESIGN.md` asks that overlapping hazard classes "resolve to the correct
  pictogram set"; they now do.
- **Article 26 lives in one place, and both consumers read it.** The derivation needs it to build a compliant
  set and the rule needs it to judge one, and two implementations are how a form comes to disagree with its own
  checker. `ghs/precedence.ts` returns the clauses that apply; the rule turns them into findings and the
  derivation removes what they forbid. A test pins the consequence: a set the derivation produced has no
  mandatory suppression left for the rule to find, across both regimes.
- **Clauses that make a pictogram optional are deliberately not applied.** "Shall be optional" means a supplier
  may omit it, not that they must, and silently removing a hazard symbol would be this tool making a labelling
  decision on someone else's behalf — while hiding a hazard while doing it. They stay on the label and the rule
  raises them as guidance.

- **Two precedence clauses reported a violation on labels that were correct.** Article 26(1)(c) and (d) were
  checked against the corrosion and health-hazard pictograms being present and against the *classification*
  that would require the exclamation mark — but never against the exclamation mark actually being on the
  label. So a label that properly omitted GHS07 was told that GHS07 may not appear on it. Reachable from the
  editor as soon as the derivation started removing it, and shipped in the stage 2 rules commit. Found by
  writing the test that asserts the derivation and the rule cannot disagree, which is the only thing that
  would have looked.
- The precedence fixtures now state their offending pictogram set explicitly rather than relying on the
  derivation to produce one. That makes each a genuinely wrong label rather than a reflection of the engine's
  own bad default — which is what a known-bad fixture is supposed to be.

Phase 4, stage 4 — text that stays on the label.

- **Statements wrap, and they wrap at layout time.** Measured against the embedded typeface, 58 of the 199
  statements were wider than the panel they were drawn on and ran off the edge, the worst nearly four times its
  width. Every drawn line now fits: across all 70 hazard statements, zero lines exceed the panel, with the
  widest at 65.74 mm of 66.
- **A shared advance-width table, not a measurer injected per renderer.** The obvious fix — let each renderer
  measure with what it has — would have the browser using canvas metrics and the server using PDFKit's, and two
  measurements that agree today and diverge on one character tomorrow move a line break in the preview and not
  in the print. `text/metrics.ts` is generated once from the TTFs by
  `npm run generate:font-metrics`, and both consumers read identical numbers. Line breaks are geometry, and
  this engine computes geometry once.
- Checked against what will actually be drawn rather than assumed: the table agrees with PDFKit's own
  measurement of all 199 statements to within 0.28% at worst, and is the wider of the two in 190 of them.
  Kerning is deliberately excluded — it narrows a pair, so omitting it overestimates and wraps marginally
  early, which is the safe direction to be wrong in.
- A single word wider than the line overflows rather than being hyphenated. Hyphenation is language-specific,
  and breaking a hazard statement in the wrong place would read wrong rather than merely look wrong.
- Element boxes grow to the wrapped height, so a rule measuring a statement block measures what was drawn
  rather than what one line would have been.

Phase 4, stage 3 — the GHS form rail, and the end of free-text regulatory strings.

- **Classification is the input; the pictograms follow.** The rail asks what the substance *is* — its hazard
  classes, from CLP Annex V — and derives the pictograms. Asking a user to choose pictograms directly is asking
  them to apply Article 26 by hand and then checking their arithmetic. The 44 classifications are grouped by
  Annex I part so they read as four lists rather than one.
- **Statements are chosen by code and never typed.** The dropdown shows `H225 — Highly flammable liquid and
  vapour.`; what is stored is `H225`, and the text is looked up. There is no longer any path by which a
  paraphrase can reach a label.
- `GhsLabelData` now carries `hazardStatementCodes` rather than statement text. Stage 1 held these as free
  strings and said the lookup would replace them once the tables existed; this is that replacement, and it
  closes the last route by which regulatory text could be authored rather than retrieved.
- **A code with no verified text for the label's market is omitted, not substituted.** Asked for H225 on a US
  label, the engine draws nothing and records why — the OSHA wording is untranscribed, and printing the EU
  wording would produce a label that looks complete and is not. The rail does the same thing visually: it
  offers no statement dropdown for that market and says why, rather than presenting an empty one.
- The form rail split by label type, with `EditorSection` — which owns half the finding ↔ form link — staying
  common to both. A rail per type with its own section wrapper would let the signature interaction work on one
  label type and silently not on the other, which is exactly the defect the stage 2 verification found.
- The signal word is still chosen rather than derived, and **both words can be selected at once**, so a label
  violating Article 20(3) can be drawn and reported. Deriving it needs CLP Annex I Parts 2–5 — 28 tables across
  157 pages — which stays deferred. Enforcing it by rule rather than by disabling the control is the right way
  round anyway: a form that cannot express a wrong label leaves the rule with nothing to catch.

Phase 4, stage 2 — the GHS rules. Six of them, each citing a clause that was read rather than recalled, and
each shipping with a label that provokes it.

- **Pictogram precedence, enforced properly rather than approximately.** Three of CLP Article 26's five rules
  turn on *why* a pictogram is on the label, not merely that it is: 26(c) suppresses the exclamation mark under
  the corrosion pictogram only where it is there for skin or eye irritation, and 26(d) only where the health
  hazard pictogram is there for respiratory sensitisation. A rule firing on "GHS05 and GHS07 are both present"
  would report a violation on a label whose exclamation mark came from acute toxicity category 4 — a false
  verdict under a real citation. Reading the classification is what makes the difference, and the rule
  **declines** when a label lists pictograms without hazards, because without the cause the article is
  unanswerable.
- Two of Article 26's clauses say a second pictogram "shall be optional", not that it is forbidden. Those are
  **guidance**, not violations. Flattening all five into violations would misstate the law in the stricter
  direction, which is no more correct than missing them.
- Signal-word precedence, label dimensions against Table 1.3, pictogram dimensions, pictogram integrity, and
  the regime's recognised pictogram set. Each cites the regulator it actually judged against — the dimensional
  rules **decline entirely under OSHA**, which sets no minimum size anywhere, because nothing to measure
  against is not a pass.
- **An empty frame is not a pictogram**, and the engine currently draws nothing else. OSHA C.2.3.1 forbids a
  frame without its hazard symbol outright, so every US label this engine produces now carries a blocking
  finding saying so. That is the honest state of things while the Annex V specimen artwork is unverified, and
  far better said by a rule than left implicit in a source comment.
- Eight known-bad fixtures asserting the exact code, severity **and citation string**, plus a conformant
  control. The precedence fixtures classify each label so the exclamation mark is present *for the right
  reason* — a fixture that merely listed two pictogram codes would pass against the broken rule this project
  nearly shipped.

- **Clicking a pictogram finding set the selection and then drew nothing.** The signature interaction —
  click a finding, see the offending element outlined — was extended to a second label type without anything
  ever pointing it at one. GHS findings carry element ids like `ghs-pictograms-GHS05`, but the engine recorded
  only the pictogram *strip* in `ResolvedLayout.elements` and left the individual pictograms in
  `layout.pictograms`, which is not where the canvas, the text-equivalent view or the form ring look for a box.
  So the store held the right element id and the canvas silently had nothing to draw. Each pictogram is now an
  element in its own right. Found by driving the real editor rather than by reading, which is the only way this
  class of defect surfaces.
- **A label could contradict its own classification and be reported as passing.** The precedence rule judges
  the pictograms that were *drawn*, which is correct, but nothing compared that set against the hazards the
  document declared. A label declaring serious eye damage and skin irritation while drawing the flame came back
  with precedence "met" — a green tick on a pictogram set no declared hazard justifies. A new rule compares the
  two: firm where it can be certain (a pictogram nothing requires is a violation) and deliberately soft where it
  cannot (a missing pictogram is an advisory, because Article 26 legitimately removes some and this rule does
  not model which).
- **Two of CLP's own pictogram minimums fail CLP's own one-fifteenth rule, and the rule as first written
  reported them as violations.** The regulation states the requirement twice — a dimension per capacity band in
  Table 1.3, and in 1.2.1.3 a floor of one fifteenth of the label's information area. Checking both looked
  obviously right. They are the same requirement written twice: the tabulated dimension is
  `sqrt(labelArea / 15)` rounded to the nearest millimetre, and all four bands match. Two of those roundings go
  *down*, so applying the fraction as well made a 32 mm pictogram on a 200 litre drum miss by 12 mm² — 1.2%,
  entirely an artefact of rounding, and reported against the regulator's own tabulated figure. The dimension
  check now enforces both provisions, and the arithmetic is pinned by a test so it cannot quietly stop being
  true.
- **Every OSHA citation in the tree was written from memory and has now been verified.** Twelve subsection
  references across the rules and the reference data — C.2.1.1 through C.2.1.4, C.2.3.1, C.2.3.2, C.2.3.4 and
  C.2.4.7 — were read from the eCFR API on 2026-09-12 against title 29 as issued on 2026-09-09. All twelve are
  correct, including a quotation of C.2.3.1 that claimed to be verbatim and is. Getting them right from memory
  is not the same as having sourced them, and `CLAUDE.md` is explicit that an unverifiable citation is worse
  than no rule; the provenance is now recorded beside them.
- **The rules were dead code.** Four rule files were written, compiled and committed to a branch while
  `GHS_RULES` remained an empty array and nothing exported them, so the suite stayed green at 436 tests with
  nothing being checked. Worse, two tests asserted the emptiness — pinning the broken state as though it were
  the specification. They now assert the opposite, and the count rose to 458 the moment the rules were wired.
- `passed()` could not carry a citation, so a *passing* signal-word check on a US label was reported against
  the EU regulation. It takes the same override `finding()` already had.

Phase 4, stage 1 — a GHS chemical label that draws. No rule ships in this stage: the point is to make a
chemical label able to be **wrong**, the same way phase 3 stage 1 had to make a barcode label able to be wrong
before the rule engine had anything to catch.

- **A path primitive, and both renderers grew a fourth case.** Rectangles and lines drew a barcode label
  completely; a GHS pictogram is a red square set at a point around a glyph, and no composition of rectangles
  makes one. `PathPrimitive` carries **structured commands in millimetres**, not an SVG `d` string — the plan
  said `d` and PDFKit's parser, and that was wrong. It would have made preview == print depend on two
  independent SVG path parsers agreeing, which is the trade this project already declined once when it threw
  away bwip-js's vertical output rather than let a library's metrics feed back into bar positions. Each
  renderer emits its own form from the same numbers. The cross-renderer equivalence test was extended to cover
  paths and confirmed to fail when the PDF side skipped its millimetre conversion.
- `ghs/` — CLP label and pictogram dimensions, and the nine Annex V codes with their symbol names, read from
  the consolidated regulation rather than recalled. **Every figure traces to `02008R1272 — EN — 01.09.2025 —
  029.003`**, retrieved 2026-09-11.
- **The pictogram dimension was ambiguous in the source, and the source resolved it.** Table 1.3 says "not
  smaller than 10 × 10" and §1.2.1.1 says a pictogram is "a square set at a point" — so is 10 mm the square's
  edge or its bounding box? They differ by a factor of two in area. §1.2.1.3 sets a floor of 1 cm², and a
  10 mm edge is exactly 100 mm² while the bounding-box reading gives half that. Only one leaves the regulation
  consistent with itself. The rejected reading is kept as a test so the decision stays visible rather than
  becoming folklore.
- `layOutGhsLabel`, a sibling of `layOutUpcALabel` rather than a branch inside it. It takes no barcode encoder,
  because a chemical label has no symbol to encode. It resolves rather than refuses: an undersized pictogram
  or undersized stock is drawn as asked, because a label that cannot be resolved cannot be measured.
- `ResolvedPictogram` keeps `drawnSideMm` and `requiredSideMm` apart, for the reason phase 3 learned the hard
  way — `quietZoneLeftMm` was a restatement of the specification under a name that read like a measurement,
  and a rule written against it passed every label put to it. Only the drawn figure can fail.
- **The pictogram glyphs are deliberately not drawn.** CLP Annex V requires conformance to specimen artwork
  published with the standard, and no verified vector of it could be retrieved. Each frame is drawn to its
  resolved size and each missing glyph records a `LayoutOmission` saying so. An approximated flame would look
  compliant without being so, which is the failure this project exists to prevent.
- `LayoutOmission.scope` distinguishes an **absent element** from a **missing detail**. The export gate was
  "any omission is a 422", which was correct while one label type existed and would have made every GHS export
  a 422, since every GHS label omits its glyphs. A UPC-A with no symbol is still refused; a GHS label with
  frames and no glyphs still ships.
- **The label-type seam.** `RuleContext` is now a discriminated union and every rule declares `appliesTo`, so
  `runRules` narrows on the type and hands each rule set a context it already matches — no cast anywhere. The
  alternative was one widened context and an assertion at the dispatch, and this project has been bitten by
  exactly that: the export route's `as never` switched off the only check that the request schema and
  `UpcALabelData` still described the same thing.
- `POST /api/labels/ghs/export`, and the editor renders either label type. Both enums in the request schema are
  derived from `label-core`'s own lists rather than restated.

- **The signal word would have printed in a different typeface than it previewed — and the first fix moved the
  bug instead of closing it.** Worth recording in full, because it took three attempts and the first two both
  looked correct.

  The GHS template first asked for `IBM Plex Sans Bold`, which the PDF exporter does not embed, so its
  allowlist quietly substituted the regular weight in print while the browser rendered bold. That was caught
  and "fixed" by renaming to `IBM Plex Sans SemiBold` — a face the exporter *does* embed. But the browser
  declares one family at two weights, not two families, so there is no `@font-face` by that name at all: the
  preview fell back to the system sans instead, and the divergence simply changed sides. The word `DANGER` on
  a hazard label, in a different typeface in preview than in print, through a fallback designed not to
  complain.

  The reason it survived a fix is that the only guard read the exporter's allowlist. A font is a contract
  between the layout and **two** renderers, and a test that reads one of them cannot see a mismatch with the
  other. `TextPrimitive` now carries `fontWeight`, which is what both renderers actually understand — SVG
  emits `font-weight`, and the exporter resolves family plus weight onto its registered face — so the layout
  never names a bold family again. Weight is expressed as intent and satisfied differently by each renderer,
  exactly as `anchor` already was.

  Two tests now, one per side, and the new one was confirmed to fail on the flagged state **while the old one
  passed it**, which is the whole point. Verified in a real export: the PDF embeds `IBMPlexSans-SmBld` and uses
  it for the signal word alone, and the SVG asks for `IBM Plex Sans` at `font-weight="600"`.
- `PathCommand` and `PathPrimitive` were declared but never re-exported from the layout barrel, so a consumer
  authoring pictogram artwork could not name either without deep-importing `layout/types`. The barrel guard
  sees only runtime values and types are erased before it runs — a limit it documents about itself, and the
  second time that limit has let something through.
- The pictogram strip computed its own width and each frame's position from two separate expressions of one
  formula, so a change to the spacing could have moved the frames without moving the box that measures them.
  Its `length - 1` was also non-negative only by grace of the guard above it. One expression now, used by both.
- `docs/DESIGN.md`'s OSHA compliance dates were wrong and superseded. It gave "substances 19 Jul 2026,
  mixtures 19 Jan 2028"; 29 CFR 1910.1200(j) as of the 2026-09-09 eCFR issue gives 19 May 2026 and 20 Nov 2026
  for substances and 19 Nov 2027 and 19 May 2028 for mixtures — manufacturers and employers respectively, a
  distinction the old summary lost entirely. The first has already passed.
- `docs/DESIGN.md` summarised CLP Article 26 as two suppression rules. There are five, and two of them make
  the second pictogram **optional** rather than forbidden — a rule engine built on the summary would report
  violations that do not exist.

Phase 3, stage 3 — the editor. Three panes, and the link between them that is the whole point.

- `/labels/new` — the form rail, the canvas and the findings rail, on an in-memory document. `/labels/:id` and
  persistence are a later phase; inventing an id now would mean either a fake route parameter or a
  browser-storage layer built to be thrown away, and the route shape is the cheaper of the two to change.
- **Click a finding and the offending element outlines on the canvas and its form section rings. Focus a field
  and the same element outlines.** One piece of store state carries both directions, so the two halves cannot
  drift into disagreeing about what is selected. It is tested by driving the real components rather than the
  store alone — the store holding the right element id proves nothing about whether the canvas draws anything
  — and the test was confirmed to fail when the outline was disabled.
- Findings grouped by the ANSI Z535.4 signal-word scale, passes collapsed at the bottom. Every severity
  carries an icon and a word; `theme.test.ts` already pins why, since warning and pass are within 1.06 of each
  other in luminance on this chrome and all but identical in greyscale.
- The rail announces through a **polite** live region carrying a summary, not `role="alert"` per finding. The
  findings recompute on every keystroke, and an assertive region per item would interrupt a screen-reader user
  continuously while they typed a GTIN. The summary is what changed; the detail is there to navigate to.
- Overlays drawn into a second SVG sharing the label's `viewBox`, so an annotation sits in the same millimetre
  space as the thing it annotates and stays registered at any zoom: hatched quiet-zone bands, symbol dimension
  callouts, and the selection outline. Selection is dashed and inset so it cannot be read as a severity —
  it is transient interface state and says nothing about the label.
- "Label contents as text" — every element with its position and size, and every omission with its reason. An
  accessibility requirement for an SVG canvas that turns out to be the fastest way for anyone to see what the
  layout engine actually produced.
- Export warns rather than refuses when a blocking finding is present. "Non-compliant as drawn" is what that
  severity means, and exporting anyway is the user's call — the confirmation only makes sure the finding was
  seen.
- A half-typed GTIN reads as a form state, not a compliance verdict. Inventing a finding for it would fire on
  every keystroke.

Phase 3, third review. Four findings, all in the web layer — and the notable result is where they are *not*.
The second round's fixes were the least-reviewed code in the phase and the ones with the worst track record,
since the first round's fixes had introduced a regression. This pass found nothing wrong with them: the
narrowed overprint suppression, the vertical-containment measurement, the font allowlist, the number
validation and the 422 export path all came through clean, as did every rule and citation in `label-core`.

- **Focusing a field could clear the highlight the user had just set.** `EditorSection` emitted its `select`
  event on every `focusin`, passing an element id that Stock and Digital Link do not have — so the emit
  carried `undefined` and the store read it as "nothing is selected". The cost lands on the one interaction
  this phase exists for: click a quiet-zone finding, see the symbol outlined, then tab into Stock to widen the
  label and fix it, and the outline showing what needs to move vanishes mid-edit. The canvas and the rail stop
  agreeing about what is selected at exactly the moment it is being acted on. Only a section that owns an
  element now speaks for the canvas, and the emit is typed `string` rather than `string | undefined` so the
  invariant is stated rather than remembered. The existing test only ever focused a field that *did* own an
  element, which is why it passed throughout.
- The overlay checkbox ids were hardcoded, reintroducing the exact collision the hatch pattern had just been
  fixed for — three lines below the comment explaining why hardcoding them was wrong. Two canvases on a page
  bound both sets of labels to the first one's checkboxes, leaving the second's overlays untoggleable by their
  label. Both ids are now seeded from `useId()`, like the hatch beside them.
- The uncertifiable-symbol notice hand-rolled `.toFixed(2)` instead of the shared `mm()` helper. This is the
  third instance of that pattern and the second time it has been recorded as fixed; `mm()` exists precisely
  because raw `toFixed` skips `collapseFloatNoise`, which is what produced the "14.33 / 14.32" readout on a
  label symmetric to the micrometre.
- The live region announced "All 1 checks passed" — `findings` and `symbols` were both pluralised on the
  neighbouring lines and `checks` was not. Small, but it is read aloud to the users least able to ignore it,
  on a tool that will not paraphrase a single character of a regulated statement.

Phase 3, second review. Fifteen findings from a full multi-agent pass, including a regression the first round
of fixes had introduced — which is the argument for reviewing each stage rather than a whole phase at once.

- **The overprint fix from the first round had manufactured a second false pass.** Suppressing the whole
  symbol when artwork crossed it also suppressed real, measured violations: a brand block anchored bottom-left
  produced a quiet zone of 0.00 mm against a required 2.97 mm with every verdict reading "pass". The rule now
  withholds only the **pass**, never the finding. Two mistakes compounded: the overprint band was the symbol's
  full drawn height, so artwork merely level with the printed digits — which touches no bar — tripped the
  suppression. `PlacedSymbol.guardBarHeightMm` now gives the bar ink its own extent.
- **Nothing measured vertical containment.** `measureClearSpace` was only ever told the label's *width*, so a
  symbol drawn off the top and bottom of its stock reported six passes and no findings. The changelog's
  justification for not shipping a clipped-by-trim rule — "clipped bars measure as negative clear space" — was
  true horizontally and silently false the other way. `ResolvedSymbol.verticalOverflowMm` records it, and the
  quiet-zone rule declines to certify a symbol that is not entirely on the label.
- **A quiet zone exactly at the minimum was reported as a violation.** The comparison had no tolerance, unlike
  the bar-height rule beside it, so on stock exactly one symbol footprint wide the two sides reached 2.97 mm
  by different arithmetic and one landed a fraction under: *"The right quiet zone measures 2.97 mm; UPC-A
  requires 2.97 mm"* — a violation contradicting its own message under a real GS1 citation. The tolerance is
  now declared once and shared.
- **`artwork.fontFamily` was an arbitrary local file read.** It reached PDFKit's `document.font()`, which
  resolves an unregistered name as a filesystem path — `'Arial'` returned a 500, and a real path was opened by
  the server process. The API now accepts only the faces the exporter embeds, and the renderer passes
  everything through that allowlist before it reaches PDFKit.
- **The export handed out blank PDFs.** A GTIN with a bad check digit — newly reachable, since the check digit
  is supplied rather than computed — returned 200 and 1,145 bytes of empty page, with the reason recorded only
  in a field no HTTP client reads. It is now a 422 carrying the omission, and the editor does not offer the
  button.
- **A Digital Link with no valid resolver passed.** `buildDigitalLinkUri` never inspects the domain, so "it did
  not throw" was being read as conformance: an empty string, `not a url` and `javascript:alert(1)` each came
  back as a green pass under a GS1 citation. It also emitted a `pass` and an advisory for the *same* URI when
  the convenience alphas were used, so the rail counted a check as cleared that the rule had just faulted.
- **Blank and negative numbers corrupted the layout instead of being refused.** A cleared margin field arrived
  as `''` and string-concatenated through every coordinate — `symbol.xMm` became `"11.3552.97"`, the rail
  printed "the left quiet zone measures NaN mm" under a real citation, and the renderer threw on a coordinate
  that was not a number. A negative bar height inverted the band used to detect encroachment, turning a real
  violation into two passes. The engine now validates every number it is given.
- **The quiet-zone hatch was invisible.** `currentColor` inside a `<pattern>` inherits from the pattern's own
  ancestors — `<defs>` — never from the element referencing it, so the overlay resolved to the body text
  colour and rendered at roughly 1.1:1 on paper. Ticking "Quiet zones" appeared to do nothing. The pattern id
  is also unique per instance now, rather than colliding as soon as two canvases share a page.
- The canvas caption hand-rolled `.toFixed()` and reproduced the exact `14.33 / 14.32` asymmetry
  `collapseFloatNoise` had just been written to kill — while the rail three inches away, formatting through
  the shared helper, printed 14.33 for both. Both now use the same helper.
- Smaller: a finding with no geometry is no longer a button, since clicking it *cleared* the canvas highlight
  instead of setting one; findings use phrasing content, as `<p>` and `<dl>` are not permitted inside a
  `<button>` and ARIA flattened them into one unreadable name; only the first form section owning an element
  scrolls, so a shared selection no longer races two `scrollIntoView` calls; and an API test asserting
  `expect([200, 422]).toContain(status)` — which no behaviour could fail — now asserts one status.
- `scripts/verify-build.sh` still posted the removed `gtinPayload`, so CI was red on this branch. It was the
  only surviving reference and it sat in a shell script, which a `--include='*.ts'` sweep never looked at.

**Reviewed and not changed.** `measureClearSpace` ignores artwork lying entirely outside the trim. That was
raised as a dropped obstruction; it is the correct answer, because ink outside the trim is never printed and so
obstructs nothing. Artwork straddling the edge still counts, via its right edge landing inside. Also left
alone: re-encoding the symbol on every magnification change. It is 92% of the keystroke pipeline and the
pipeline is 0.4 ms, so caching it would add state to a pure module to buy nothing measurable.


Phase 3 review. Four defects, two of them false passes — the failure class this project exists to prevent.

- **A label with artwork printed through the barcode reported six passes and no findings.** `measureClearSpace`
  only considered elements extending past the left or right edge of the bar pattern, so a block sitting
  entirely inside it was neither and got skipped; both quiet zones measured clean. Reachable from the editor in
  two clicks. `ResolvedSymbol.overprintedBy` now records it, and the quiet-zone rule **declines to certify**
  such a symbol rather than passing it — a pass would be true in the narrow sense and gravely misleading in
  every other. No violation is raised either: no clause covering overprinting has been verified against a
  source document, and this project does not ship rules it cannot cite. The editor states the fact in words
  instead, under "Cannot be checked", and suppresses the all-clear banner while it stands.
- **The findings rail claimed "Every check passed" when no check had run.** The guard tested only that nothing
  had failed. With a half-typed GTIN there is no resolvable layout, so there are no findings at all — and the
  rail rendered a green tick beside a live region correctly announcing that no checks had run. It now requires
  a check to have actually passed, and says so plainly when none has.
- **The landing page drew hatched quiet-zone bands over the label with no way to remove them.** The overlay
  defaulted on regardless of whether the toggles were offered, so the one page whose entire point is "this is a
  real label, not a picture of one" covered it in apparatus. The default is now seeded from whether the
  controls are shown.
- **The Digital Link rule blamed the URI for a fault in the GTIN.** `buildDigitalLinkUri` validates the check
  digit and throws, so a transposed digit produced two findings for one cause — the second of them
  misattributed to a Digital Link that was perfectly well formed. It now declines when the key it builds from
  is unsound, and leaves that defect to the rule that owns it.
- The API export route no longer casts past its own type checker. `z.enum(ANCHORS)` widened to `string`, which
  forced an `as never` on the engine call — and that cast switched off the only check that the request schema
  and `UpcALabelData` still describe the same thing. `Anchor` is now derived from `ANCHORS` so the enum stays
  typed, and the nested Zod optionals are reconciled with `exactOptionalPropertyTypes` by construction rather
  than by assertion.

Findings from the stage 3 review.

- **The production build's PDF export was completely broken.** `renderPdf.ts` resolved the font directory four
  levels up, which is correct from `src/labels/` and wrong from the tsup bundle at `dist/server.js` — where it
  pointed outside the repository altogether. `node dist/server.js` answered the first export request with a 500
  and `ENOENT`. All 283 tests passed throughout, because every one of them runs from source. Two changes
  close it: the resolver now checks explicit candidates and fails with the paths it tried, and tsup copies the
  fonts beside the bundle so a `dist`-only container has them.
- CI now builds the server and exercises the export against the artifact (`npm run verify:build`). Unit tests
  could not have caught the above and still cannot; only running what ships can.
- `toSVG` interpolated `fill` and `stroke` without escaping, unlike every other value. Unreachable today since
  fills are literals — but the browser renders that string through `v-html`, and the suppression there
  justified itself by claiming the renderer escapes everything it interpolates. The claim is now true, and
  tested: the fix originally shipped without one, which made the invariant true and unverified rather than
  false. The tests were confirmed to fail with the escaping removed.
- The `vue/no-v-html` suppression was a `disable-next-line` above the opening tag, while the rule reports at
  the `v-html` attribute two lines down — so it suppressed nothing and the warning stood. Replaced with a
  block disable, which is also stable under Prettier's reformatting.

Findings from the stage 1 + 2 review, each reproduced before being fixed.

- **Bar height did not scale with magnification, so a 2x symbol was drawn half as tall as the specification
  requires.** GenSpec figure 5.12.3.1-1 tabulates a minimum symbol height against each X-dimension — for
  UPC-A, 18.28 mm at X = 0.264, 22.85 at 0.330 and 45.70 at 0.660, which are exactly 22.85 multiplied by the
  magnification. The engine took the nominal 22.85 mm regardless. Nothing about the result looks wrong: the
  bars are the right width, the quiet zones are right, the symbol merely reads as slightly squat. It is
  non-conformant at point of sale, and the print-test sheet's "2.0x" block was printing a symbol that was not
  a 2x symbol. The table had been extracted during stage 1 and only its middle column used.
- The guard extension scaled while the bar height did not, so the guard-to-data ratio drifted with
  magnification too. Both now derive from `nominalBarHeightMm`, and a test pins the ratio across 0.8x, 1x
  and 2x.
- The same unscaled height was computed a second time in the layout engine, so the stock-fit check accepted
  stock that could not carry a conformant symbol. Both sites now share one helper rather than each doing the
  arithmetic.
- A non-numeric GTIN reached `normaliseToGtin14` and raised `Gs1FormatError` instead of `DigitalLinkError`.
  `'ABCDEFGH'` is a valid GTIN *length*, so it passed the length guard added in the phase 1 review — and a
  caller catching this module's documented error type would have missed it.
- `layOutHri` returned early when a declared digit group had no matching data area, skipping the cursor
  advance and silently mis-slicing every later group and the trailing digit. Unreachable today, but a silent
  wrong-digits path is precisely what this engine may never produce; it throws now.
- The human-readable type size scaled only in the print-test sheet, not in the engine the API export and the
  browser preview both use. The previous entry claimed this was fixed; it was fixed in one of the two places.
  Scaling now lives in the template as `upcAHriFor`, and both consumers call it.
- The export route restated the payload length, the magnification bounds and the default stock rather than
  importing them from `label-core`. Each side was tested against its own copy, so the two could drift apart
  without a single test failing.

Findings from the stage 1 review, all reproduced before being fixed.

- **The human-readable digits printed 1.3 mm into the guard bars.** The baseline sat a fixed gap below the
  bars, but glyphs rise *above* their baseline rather than hanging below it — so the digits overlapped the bar
  pattern, which is a scanning failure. The style now reserves a vertical *band* and puts the baseline at its
  lower edge, so glyphs grow upward into space set aside for them. The band must be at least the font's
  ascent, which is the caller's to know because the caller chose the font. The old test asserted only the
  baseline position, so it passed while the output was wrong.
- **EAN-13 inherited UPC-A's digit grouping.** It rendered `5 | 90123 | 412345 | 7`, splitting eleven digits
  by a half that truncated to five and pushing the check digit into the 7X right quiet zone — the one place a
  digit must never go. An EAN-13 prints `5 901234 123457`: one digit left, six under each half, nothing to
  the right. The grouping is now part of each symbology's structure rather than hardcoded, and a mismatch
  between grouping and digit count throws instead of silently dropping a digit.
- **The label was not vertically centred** — 6.075 mm above the artwork and 8.825 mm below. The engine added
  the HRI font size as though text hung below the baseline, while the symbol's own footprint excluded the
  digits it had just emitted. The footprint now includes the band, and the same error also refused stock that
  was in fact large enough.
- **`npm run typecheck` was failing and reported green.** `bwip-js` does not resolve under
  `moduleResolution: bundler` — its `exports["."]` has no `default` condition — and `import.meta.glob` is
  untyped under the deliberate `"types": []`. Both are fixed: tests import `bwip-js/generic`, the
  platform-neutral build, which also means they exercise what `label-core` actually ships rather than the
  node build Vite was silently selecting; and the barrel guard now uses explicit imports. The failure was
  missed because the verification piped `npm run typecheck` to `tail`, and npm continues to the next
  workspace after one fails, so a clean-looking ending hid three errors.
- `exports` omitted `./layout`, `./render` and `./templates` — the same omission as `./symbology` in phase 1.
  A test now pins the manifest, which the barrel guard could not do: that one checks *within* a module, this
  one checks the manifest that makes a module reachable at all.
- The bar collector treated any `line` callback as a vertical bar. ITF-14 draws horizontal bearer bars
  through the same callback, and counting one would corrupt the module span the entire millimetre calibration
  is measured against.
- `UPC_A_HRI` documented that its type size was "deliberately not defaulted" and then defaulted it, with no
  way for a caller to override. Renamed `UPC_A_HRI_DEFAULT`, still defaulted because a label needs digits,
  but now overridable and honest that the size is legible rather than regulated.
- `GUARD_BAR_EXTENSION_MODULES` shipped without a citation — the only constant in that file without one. It
  comes from the bwip-js reference rendering, which measures an implementation rather than reading a
  specification. Recorded as unverified, and no rule may judge against it until a source is confirmed.
- `TextPrimitive.fontSizeMm` was documented as cap-to-baseline but emitted as SVG `font-size`, which is the
  em. Roughly a third apart, and 21 CFR 101.7(i) sets the net-quantity minimum by the height of a lowercase
  "o" — so a rule comparing the two directly would have passed type well under the legal minimum.
- `"No verified metrics for EAN-8"` sent you to the wrong table when the metrics existed and the structure
  entry did not. The two are now reported separately.
- The symbol was encoded twice per layout, once to measure and once to place. Every figure needed for the
  footprint is already tabulated, so the measuring pass cost an encode and told us nothing.
- Duplicate `### Added` and `### Fixed` headings under one `## [Unreleased]`, created by an earlier insert.

- `isNetQuantityZoneRequired` and `NET_QUANTITY_ZONE_EXEMPT_MAX_SQ_INCHES` were added during the phase 1
  review but never re-exported from `geometry/index.ts`, so they were unreachable from
  `@packwright/label-core`. Their tests imported from `./pdp` directly, which is why nothing failed. The same
  class as the missing `./symbology` export, and now caught by a test rather than by a manual scan.
- `totalSymbolWidthMm`'s test passed `37.29` as the bar-pattern width. That figure is GenSpec's 113-module
  total *including* both quiet zones, so the test added quiet zones a second time and asserted a symbol
  43.23 mm wide. It passed only because it was tautological. The bar pattern is 95 modules — 31.35 mm — and
  the layout engine was about to consume the wrong number.
- `docs/DESIGN.md` claimed bwip-js offers "both SVG and PDFKit output". It does not; there is no PDFKit
  export. What it ships is a pluggable `DrawingContext` and a reference PDFKit implementation in its examples,
  which suits this architecture better than the built-in would have.

Findings from the phase 1 review, each confirmed against a primary source rather than inferred.

- **AIs 410 and 414 were marked variable-length, corrupting every element string containing a GLN.** The
  predefined-length table is keyed on the AI's first two digits and the `41` prefix is in it, so a GLN takes no
  separator. `encodeElementString` was emitting `4109506000134352<GS>…`; a conformant decoder has already
  consumed exactly 13 digits by then and reads the FNC1 as the start of the next AI. Source: the `*` flag
  ("pre-defined length AI not requiring FNC1 separator") on both AIs in the GS1 Barcode Syntax Dictionary.
- **The quiet-zone fallback understated three of the four GS1 symbologies that relied on it.** EAN-13 requires
  11X on the left, ITF-14 and GS1-128 10X on both sides; all three were getting the general 7X floor. Because
  the fallback was *less* strict than the real requirement, it produced a confident pass on a label that will
  not scan — the exact failure the fallback was reasoned to prevent. All four are now recorded with citations
  (GenSpec 25.0 figure 5.2.3.4-1, §5.3.2.2, §5.4.6.3), and the floor is documented as a floor.
- **Digital Link URIs were built with convenience alphas by default, which are no longer part of the
  standard.** They were deprecated in Digital Link URI Syntax 1.2.0 and removed in 1.3.0 — `gtin` cannot be
  used in place of `01`. Numeric AIs are now the default; the alphas remain behind an opt-in flag, marked
  deprecated, for reading URIs generated before the removal.
- **A Digital Link would accept a GTIN of any length.** Left-padding with zeros cannot change a check digit,
  since the 3/1 weighting is anchored to the right and a leading zero contributes nothing at either weight — so
  a five-digit key widened into a well-formed GTIN-14 and the check-digit guard had nothing to catch.
  `{ai: '01', value: '12348'}` resolved to `/01/00000000012348`. Length is now checked against the key as
  printed, before widening, and non-GTIN primary keys are validated against their AI spec.
- **`parseHumanReadable` accepted anything before the first AI.** The pattern is unanchored and only trailing
  data was checked, so `junk(01)09506000134352` consumed to the end of the input and returned a clean
  single-element list. Each match must now begin where the previous one ended.
- **Alphanumeric AI values were never checked against a character set.** Only the numeric branch validated
  characters, so a lot number could carry a space, `#`, `$`, `@`, or — the dangerous case — a literal
  separator, which encoded without complaint and truncated the field at the decoder. GS1 character set 82 is
  now enforced, transcribed from GenSpec 25.0 figure 7.11-1.
- **Digital Link qualifiers and attributes bypassed validation entirely.** An empty lot produced a dangling
  `/10/` segment, `17=not-a-date` reached the query string, and a repeated AI produced `/10/A/10/B` — which
  names two lots at once and resolves by sort stability. All three are rejected; the same values were already
  rejected on the element-string path.
- **`PORT` and `NODE_ENV` still crashed on a declared-but-blank value.** The blank-as-absent preprocessing was
  applied to the two secrets but not to these, so `PORT=""` coerced to 0 and failed `.positive()` — the same
  ECS crash-loop, in the same file that documents it. `PORT` also gained an upper bound: `PORT=80800` used to
  pass validation and fail later inside `listen`, where the error no longer names the config that caused it.
- **`dotenv` was a declared dependency that nothing imported**, so a local `.env` was silently ignored and
  every optional secret read as absent. Now loaded in `server.ts` before anything reads `process.env`.
- `exports` omitted `./symbology`, making `@packwright/label-core/symbology` a hard resolution error while
  every sibling subpath resolved.
- The net-quantity placement helper cited nothing, and sat under a file header citing 21 CFR 101.1 next to a
  function citing 101.7(i). The rule is 21 CFR 101.7(**f**). Its exemption for panels of 5 square inches or
  less is now modelled as `isNetQuantityZoneRequired` — without it a rule reports a violation against a small
  package that is fully compliant.
- `pdpAreaSqMm` applied the 40 percent rule to every otherwise-shaped container, dropping 21 CFR 101.1(c)'s
  exception: where the container presents an obvious principal display panel — the regulation's example is the
  top of a circular package of cheese — the area is the entire top surface. Understating the panel understates
  every type-size minimum keyed off it.
- Severity was cited to ANSI Z535.1 in both `types/index.ts` and `CLAUDE.md`. Z535.1 is the safety *colour*
  standard; the signal words that make up the scale are defined in **Z535.4**. Both now name the right one.
- **No element string ever verified a check digit, so an invalid GTIN encoded into a symbol.** This was first
  logged as a narrow gap in GLN handling; it was not narrow. `validateAiValue` checked charset and length
  only, so `09506000134353` — fourteen numeric digits, wrong final digit — passed every rule and encoded
  cleanly. The resulting symbol prints, scans, and decodes to an identifier that does not exist, which is the
  precise failure the check digit exists to prevent. All five AIs the GS1 Barcode Syntax Dictionary marks
  `csum` (00, 01, 02, 410, 414) are now verified via the existing `isValidCheckDigit`, and a test pins the
  flagged set so a new AI cannot be added without one.
- `CLAUDE.md` still required Node ≥ 22 after the project retargeted to 24.
- Phase 1's "no UI exists yet" gate in `docs/DESIGN.md` was unsatisfiable as written — a workspace scaffold
  needs a bootable app to prove it boots. Reworded to what was actually meant: no *product* UI, with the one
  scaffold screen scoped to proving the wiring.
- Digital Link qualifier validation ran inside the `sort` comparator, which JavaScript never invokes for a
  zero- or one-element array — a single invalid qualifier passed through silently and was only rejected once a
  second one appeared. Validation now runs in its own pass.
- An environment variable that is **declared but blank** crashed startup. `.optional()` means absent, and `''`
  is present, so `ANTHROPIC_API_KEY=""` failed the non-empty check and took the process down. An ECS task
  definition with an empty value produces exactly this, so the container would have crash-looped on a config
  that looks correct in the console. Blank now reads as absent.
- Removed `baseUrl` from the web tsconfig — deprecated in TypeScript 6 and an error under `vue-tsc`.

### Notes

Phase 5 research, 2026-09-12 — recorded because two of these are decisions rather than findings, and a later
session would otherwise redo the search.

- **FDA's front-of-package "Nutrition Info box" is still proposed.** 90 FR 5426 (16 Jan 2025), comment period
  extended by 90 FR 19664 (9 May 2025), no final rule twenty months on. `DESIGN.md` said to build it behind a
  forward-looking flag; it is now deferred outright instead. A proposed rule changes before it is finalised,
  so a UI built against this one is work that will need redoing, and the deferral reverses the day it lands.
- **Corrected 2026-09-12, same day:** the entry below concluded the bar weights were stated nowhere. They are
  stated, in FDA's own illustrations — [Examples of Different Label
  Formats](https://www.fda.gov/media/99151/download): "All labels enclosed by ½ point box rule within 3 point
  of text measure", "7 pt rule", "3 pt rule", "¼ pt rule centered between nutrients (2 pt leading above and
  below)". That PDF was fetched while reaching the original conclusion and came back as unreadable binary, and
  **"I could not read it" was written down as "it does not say it"**. The figures are transcribed into
  `fda/nutritionPanel.ts` with the quotation beside each. Nothing else changes: the document is guidance, so
  the renderer follows it and no rule judges a bar weight.
- **The Nutrition Facts bar weights are not stated numerically in any *binding* source**, and four were
  checked:
  21 CFR 101.9 defers to the graphic fifteen times; Appendix B to Part 101 — the "graphic specifications" 101.9
  points at — is two images and 55 words of boilerplate; the 292,000-word preamble to the 2016 final rule
  (81 FR 33742) mentions "hairline" once and defines it as "a thin line"; and the 2018 technical amendment
  (83 FR 65493) gives type sizes only. 101.9 also says FDA "strongly recommends" Appendix B, which is a
  recommendation and not a requirement. So the renderer will follow the recommended geometry as a documented
  house default, the way `GHS_TYPE_DEFAULT` and `UPC_A_HRI_DEFAULT` already are, and no rule will judge a bar
  weight. The type *scale* is a different matter and is binding — 101.9 states it in points.
- **21 U.S.C. 343(w) carries a type-size requirement**, which was not expected: a "Contains" statement must be
  "in a type size no smaller than the type size used in the list of ingredients". Measurable with the glyph
  metrics stage 1 added. 343(w)(2) also requires the specific type of tree nut or species of fish or
  Crustacean shellfish, not the category.
- Out of scope but current law, so worth not rediscovering: the "healthy" nutrient content claim definition
  was finalised at 89 FR 106064 (27 Dec 2024).

- Requires npm ≥ 11. npm 10.9.2 fails to resolve this dependency graph, crashing in arborist with
  `Cannot read properties of null (reading 'edgesOut')` while walking Vitest 4's peer set.
- The phase 1 review resolved most of the outstanding `TODO(verify)` markers against General Specifications
  25.0. Confirmed correct as written and now cited in place: the EAN/UPC nominal X-dimension (§5.2.3.1,
  0.330 mm), the 0.8–2.0 magnification bounds (figure 5.12.3.1-1, X from 0.264 to 0.660 mm), the UPC-A and
  UPC-E quiet zones, the GTIN qualifier sequence `22,10,21`, the Pharmacode range 3–131070, and all three
  check-digit vectors — each recomputed by hand from §7.9.1 rather than by running the implementation.
- Quiet zones for CODE128, CODE39, MSI and PHARMACODE remain unencoded. They are not GS1-governed, their
  requirements come from their own ISO/IEC symbology specifications, and none has been confirmed against a
  source document — so they fall back to the general floor and report `hasVerifiedQuietZone === false`. Any
  rule that reports a pass/fail must gate on that flag rather than consuming the floor blind.
- Every finding from the phase 1 review is now closed, including check-digit verification, which was
  initially deferred as a design call and turned out to be the most serious item of the lot.
