# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This is a development log first and a release log second — entries accumulate under Unreleased and are cut
into a version only when there is a reason to.

## [Unreleased]

### Added

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

### Fixed

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

### Fixed

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

### Changed

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
