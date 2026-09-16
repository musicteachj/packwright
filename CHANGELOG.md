# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This is a development log first and a release log second — entries accumulate under Unreleased and are cut
into a version only when there is a reason to.

## [Unreleased]

### Added

Phase 7, stage 3 — the engine judges. Everything before this was reading and confirming; `/audit` now runs the
rule set over the confirmed document and shows what `rules/` says about it, which completes the phase.

- **Every finding comes from `rules/`, and there is no second source of them.** The report lays the confirmed
  document out and hands it to `runRules` — the same call the editor makes. Nothing on this path authors a
  verdict, a citation or a severity. On the sample label that means the Article 20(3) conflict it was built to
  carry, reported by a rule written in phase 4, with the CLP reference that rule declares.
- **The report says what it did not judge, above the findings rather than beneath them.** Three things are
  true of every audit this build produces and each would mislead if it sat in a list looking like a finding.
  The engine judges a label rebuilt from what was confirmed, not the photograph. Every GHS pictogram glyph is
  a layout omission here, because the Annex V artwork was never verified, so the "cannot be checked" block is
  populated on every audit that has pictograms. And under `us-osha` no statement code has verified text at
  all.
- **A rule that cleared because its field was never confirmed has not cleared.** Decline to confirm the signal
  words and `ghs/signal-word-precedence` says *nothing* — the conflict finding simply disappears, leaving one
  fewer check and no reason for it. That is a false clearance produced by the interface rather than by a rule,
  which is the shape this project keeps finding, so the report names every field that was read and left alone.
- **An incomplete document is not a failed audit.** The report waits for a market, a confirmed product
  identifier, a package capacity and a measured label before it says anything. Without the measurements the
  engine is handed a stock of zero and refuses it, correctly — and telling somebody halfway through a form
  that their label cannot be drawn is blaming them for not having finished.
- **The confirmed label opens in the editor, unsaved.** Saving and naming stay the editor's act; a second way
  to write a record is a second place for the rules about writing one to be got wrong. It arrives dirty, so
  both leave guards stay awake over work somebody did with a camera in their hand.

### Fixed

- **Two GHS passes certified pictograms whose symbols were never drawn, and now decline to.**
  `GHS_PICTOGRAM_SET_MATCHES` named the strip while omissions are recorded per pictogram, and
  `GHS_SMALL_CONTAINER_COMPLETE` named no element at all, so the guard in `runRules` could withhold neither.
  Both are requirements on what the label carries, and a frame with no symbol is not a pictogram (29 CFR
  1910.1200 App. C.2.3.1). Each rule now asks for itself: the set is certified only when every member
  pictogram printed in full, and the small container only when everything its regime lists did — the
  product identifier, each pictogram and the supplier, plus the signal word and outer-package statement
  under OSHA. Withheld, not reported: `GHS_PICTOGRAM_SYMBOL_MISSING` and the omission already say what did
  not print.

  **While no glyph artwork is verified, neither pass can clear on any label carrying a pictogram**, and that
  is the correct answer rather than a regression. The sweep's floor for GHS rules that clear drops from five
  to four accordingly. The small-container tests that exercise what each regime lists now run as if the
  glyphs had printed, and say so, so they still test the list rather than failing on the pictogram.

  Every entry on the small-container gate is pinned separately, each mutation-tested: without the gate on
  the product identifier, the pictograms, the supplier, the signal word or the outer statement, a named
  assertion fails, and a control shows the pass still clears when everything printed. The supplier and
  statement gates are reached by hand today, because `layOutGhsLabel` records no omission for text drawn off
  the stock; that is the next entry in `docs/BACKLOG.md` to close.

- **A `us-osha` label's statement codes were validated against the EU table.** Both arrays in `GhsRequest`
  were `z.enum(knownHazardStatementCodes('eu-clp'))` whatever the `regime` field three lines above them said,
  so the saved-label and export routes judged a US label against CLP. Latent only because H- and P-numbers are
  UN GHS codes both regimes adopt — and the reason it was latent is the reason it could not be fixed as an
  enum: `US_OSHA_HAZARD_STATEMENTS` is empty, a regime-correct enum would therefore be empty, and `z.enum`
  cannot express that. The `as [string, ...string[]]` cast was what hid it.

  It is a refinement now, asking what `apps/api/src/audit` and the confirm screen already ask: is there
  verified text for this code under this regime. Four validation sites, one mechanism. The message names the
  code and the regime rather than reading “invalid enum value” against a field a caller cannot edit their way
  out of, and an empty table is reported once for the field instead of once per code — eleven identical
  sentences read like eleven defects on the label rather than one gap in this build.

  **It makes a sentence the audit endpoint already prints true.** `GHS_STATEMENT_TABLE_EMPTY` tells a user
  that “the saved-label and export routes admit only codes with verified text”, which under `us-osha` was
  precisely what this defect made false.

  Two things had to be split to do it. `.omit()` throws at runtime on a Zod object carrying an object-level
  refinement while still type-checking, so `GhsRequestShape` is the plain object and the check is applied to
  it twice — once for `GhsRequest`, once after `LabelDocumentInput` omits `stock`. `UsFoodRequestBase` was
  already split this way for the same reason.

- **Codes are canonicalised on the way in, so the spellings every other layer accepts now reach storage.** The
  enum admitted only the tables' exact keys, so `P337+P313` or `h225` — both taken by the extraction endpoint
  and the confirm screen — came back 400 from the routes beside them. They go through
  `canonicalStatementCode` in the schema, which is also what the refinement reads, so the two cannot disagree
  about what a code is. The engine looks these up by exact key, so storing the canonical form is the point:
  a confirmed `p337+p313` would otherwise draw nothing and blame the label for our punctuation.

  **They are deduplicated in the same breath**, which is the half of `extract.ts`'s `resolvable()` that had to
  come with the canonicalising and nearly did not. The engine draws one statement per entry, so `H225` twice
  is the statement printed twice on the exported PDF — something the old enum already allowed for an exact
  repeat, and which canonicalising alone would have extended to `h225` beside `H225`.

  The doc block explaining why a lookup never falls back to another regime — the sentence this whole change
  rests on — was sitting above `canonicalStatementCode` rather than above the lookups, which had none. Moved.

  Two things about what the rejection *says*, both found reviewing it. The issue path names the field rather
  than an index, because after canonicalising and deduplicating the position no longer lines up with what the
  caller sent — `['H225', 'h225', 'H999']` reported `hazardStatementCodes.1`, pointing a client at its own
  valid `h225`. The code is named in the message, which is the part that locates it. And an entry of pure
  whitespace has a length, so it passed `.min(1)` and canonicalised to nothing, producing ““” has no verified
  text” — a complaint about a code the caller cannot go and look for. It is `.trim().min(1)` now, and the
  regime check skips an empty code rather than complaining about it twice.

- **`canonicalStatementCode` rewrote one of the table's own keys.** CLP keys an entry
  `'P370 + P380 + P375 [+ P378]'`, where the `+` inside the bracket is the regulation's notation for an
  optional component and sits against it. Spacing every `+` alike turned that into `'[ + P378]'`, so
  canonicalising the key produced something the table does not contain. Latent while the schema used an enum
  that took the key verbatim; the moment validation started canonicalising first, the one code the editor's
  dropdown offers for that entry was refused on export and on save. It also means the audit paths, which have
  canonicalised before looking up since phase 7, have been warning that code as unrecognised all along.

  `statements.test.ts` now pins the invariant that makes this checkable rather than remembered: **every key in
  every table canonicalises to itself.** That is the assertion that would have caught it, and it is derived
  from the tables rather than from a list someone typed.

  It does not close the wider bracket problem in `docs/BACKLOG.md`, and checking it turned up that **that
  entry's premise is false** — a claim this changelog repeated once before it was checked.
  `'P370 + P380 + P375'` is its own key with its own text, so a label that did not use P378 resolves already.
  What resolves to nothing is a label that *did* use it and printed it without the regulation's bracket
  notation. The correction matters because the obvious fix for the entry as written — map the un-bracketed
  code onto the bracketed key — would append “[Use … to extinguish].” to a label that never carried P378.
  One key in 199 has a bracket, which is the count that entry asked someone to establish.

- **The editor captioned a code on a US label with the EU wording for it.** `GhsFormRail`'s `textFor` read
  `EU_CLP_HAZARD_STATEMENTS` directly rather than going through the regime, so a `us-osha` label carrying
  `H225` displayed “Highly flammable liquid and vapour.” beside it — the cross-regime substitution
  `ghs/statements.ts` exists to prevent, printed in the editor next to the code it misdescribes. **Three
  clicks away**, and not by way of a stored record: choose EU, pick a statement, change Market. Nothing clears
  the codes on a regime change, which is now its own `docs/BACKLOG.md` entry, and the test drives exactly that
  path rather than assembling the end state — an earlier version assembled it and justified itself with a
  stored record that `GET /labels/:id` would in fact refuse to serve. The options list went the same way, from
  a `regime === 'eu-clp'` ternary to
  `knownHazardStatementCodes(regime)` — which behaves identically today and stops behaving identically the
  day Appendix C.4 is transcribed, without anybody having to remember this file.

- **`own()` was an untested guard, and this change made it load-bearing again.** It exists because
  `table['constructor']` returns a function rather than `undefined` on a plain object literal, which once
  sailed past a `!== undefined` check and crashed the layout engine on `text.split` — a 500 from a
  well-formed request. Widening the schema from an enum back to free strings points that surface at it again.
  Removing `Object.hasOwn` broke nothing in the suite, including the API-level case written for it here:
  every caller canonicalises to upper case first, and nothing on `Object.prototype` is spelt in capitals, so
  an accident was doing the work. `statements.test.ts` now puts the raw names in, where the accident cannot
  help, and the comment above `own()` says which callers it is about rather than “the API” — a sentence that
  has been true, then false, then true again as the schema changed underneath it.

- **Detaching a saved label absorbed the unsaved edit it was carrying.** `detach()` rebased the baseline onto
  the document in front of it, beneath a comment saying that document “is still worth defending” — and
  rebasing is precisely what stops defending it, because every edit made before the detach is folded into the
  new baseline and stops counting as unsaved. Reproduced in a browser, which is the only place it showed:
  open a saved label, edit a field, switch the label type. Leaving the page then raised no prompt at all, and
  closing the tab would have lost the edit without a word from `beforeunload` either.

  **The two leave guards are what this restores, which is less than everything a user sees.** The
  “Unsaved changes” indicator is gated on being attached to a record, so a detached document shows nothing
  whether it is dirty or not — unchanged by this fix, and already true of the audit hand-off, which
  `e2e/the-label-audit.spec.ts:139` pins deliberately. Recorded in `docs/BACKLOG.md` rather than changed here,
  because flipping it means flipping two assertions that were written on purpose.

  The baseline is now left exactly where it is, because it records what was last *written* and detaching
  writes nothing. One caller needs more than that: a type switch moves `snapshot` to the new type, so
  comparing it against a baseline recorded for the old one reports “edited” however untouched the label was.
  The type watcher therefore asks whether the document carried unsaved work **on the type it is leaving**,
  using a new `snapshotFor(type)`, and rebases only when it did not — so a saved label somebody merely looked
  at still leaves quietly, and one they had typed into does not.

  **That rebase stays restricted to attached documents, and the restriction is load-bearing.** Widening it to
  detached ones looked right — whether a document is attached says nothing about whether it has anything to
  lose — and it closed a real false positive: switching type away from an untouched saved label and straight
  back strands the baseline on the other type, so two clicks and nothing typed leave both guards firing. But
  `loadUnsaved` deliberately leaves an audit hand-off's baseline describing a *different* type, and that
  mismatch is the whole of what keeps an audited label dirty. A widened rebase reads it as “nothing to lose”
  on the way back and writes the confirmed audit data into the baseline: `handover=true away=false
  back=false`, a false clearance on the path phase 7 exists to protect. Trading a nuisance prompt for a silent
  loss is the wrong way round, so the false positive is in `docs/BACKLOG.md` instead, with the trap written
  down beside it. `savedLabelAttachment.test.ts` now pins the hand-off round trip, which is the test that
  would have caught it.

  This subsumes the phase 7 guard below. `detach()`'s `if (savedId === null) return` existed so the route
  watcher could not rebase an audited document on mount; with nothing rebasing anything there is no longer a
  rebase to prevent, and restoring the old body fails that phase's own test as well as the two new ones.

- **~~Whether the same rebase could lose work at `/labels/new` without an audit was unestablished.~~
  Settled, and the answer is no.** Walked in a real browser rather than probed in jsdom: edit at
  `/labels/new`, leave, come back, leave again — prompted every time, because `savedId` is null throughout and
  the watcher's `detach()` had nothing to let go of. `e2e/the-unsaved-editor.spec.ts` carries that walk, and
  reverting the fix above leaves it passing while the case beside it fails, which is the evidence that the
  two are different defects.

  What the walk did find is the one above, next door. It also found that the route to `/labels/new` was
  laundering edits in the same way and getting away with it: the watcher clears the name a line after
  detaching, and *that* difference kept the guards awake. Put the name back and the document read clean while
  still holding the edit. `EditorSaveView.test.ts` asserts through the restored name for that reason —
  anything else passes on the name's own dirtiness and never touches the edit underneath it.

  The original reproduction “did not hold” because of a trap `EditorSaveView.test.ts` already documents: the
  test router's initial navigation is a promise, so a probe that mounts without awaiting `isReady()` runs the
  route watcher against the empty starting route first. That is worth recording as the reason, rather than
  leaving “it proved nothing” as the last word.

- **A label handed to the editor from an audit stopped being unsaved work the moment it arrived.**
  `loadUnsaved` keeps the document dirty on purpose, so both leave guards stay awake over an audit somebody
  did by hand — and `EditorView`'s route watcher called `detach()` on mount at `/labels/new`, which rebased
  the baseline and made it clean again. Reproduced by mounting the editor over a handed-over document: dirty
  before, clean after. `detach()` now does nothing when there is nothing attached, which is what it always
  meant. Asserted where the two meet rather than in the store's own test, which passes either way because it
  never mounts anything — and that gap is exactly how this survived.

  Whether the same rebase could lose work at `/labels/new` without an audit in the picture was left **not
  established** here. It has since been walked in a browser and settled — see the two entries above.

### Changed

- **The nutrition panel's passes rest on the artwork, and so do both claimed exemptions — one of them
  reversed on reading the regulation it rests on.** Completeness, order, rounding, the percentages, serving
  size, type size and both dual-column passes are requirements on the printed panel. 101.9(c) says the
  nutrients "shall be presented" in its order and each amount "expressed" to its increment. (d) sets the type
  the panel is printed in, and (b)(12)(i) and (e) are about a column and its form. The rules read the
  document's figures as a means. The module header that called rounding "a fact about a number … the same
  distinction that has the GTIN check-digit rule read the document" now says why it is not: a check digit
  belongs to the number whether or not it prints, and a rounding does not.

  **`FDA_NUTRITION_EXEMPT` and `FDA_INGREDIENTS_EXEMPT` rest on the artwork, and the second was committed
  the other way one commit ago.** Neither module recorded a reading of the provision it cites, so both were
  read from the eCFR before deciding. Most of 101.9(j)'s exemptions turn on the seller, the food and the
  setting, but not all of them. (j)(13)(i)(A) puts "an address or telephone number" on the label of a small
  package using its exemption, and (j)(15) holds only where each unit "is labeled with the statement 'This
  Unit Not Labeled For Retail Sale'". §101.100(a)(1) excuses an assortment only "on the condition that the
  label shall bear" a statement naming the ingredients that may be present, and (d)(3) needs a caution tag on
  each container. Neither rule records which exemption was claimed, so neither pass is true whatever
  printed. The previous commit had stamped the ingredient exemption `document` on the strength of a phrase
  in its own module, "facts about the product and its packaging rather than on anything drawable", which
  the section does not bear out. The format entitlement and the second-column exemption stay on the
  document: (j)(13)(ii)(A) and (b)(12)(i)(A)–(C) turn on the package alone.

  **Pinned, and mutation-tested.** One test adds the omissions an exempt label cannot produce and asserts
  both exemptions are withheld. Another lays a dual-column label on stock too short for its panel and
  asserts all seven panel passes the suite did not hold are withheld; each of the seven fails it when
  stamped `document`. Both exemption messages also told the user applicability was "a fact about the
  product, not about the label", which the reading disproves, so they now say which things are unchecked;
  the first test fails on the old wording. The serving-size pass is the eighth, and it is out of reach. It names its own row, the
  engine records omissions against the whole panel, and on a 25 mm label the row prints wholly below the edge
  while the pass reports a serving size declared. A live false clearance, recorded in `docs/BACKLOG.md`
  with the exemption conditions no rule checks. The `high` review of the pull request found one more of the
  same shape and it is recorded beside them: the allergen pass names the ingredient list, so it survives a
  Contains statement that carried the only declaration and never printed.

- **The SI exemption now survives an omission; the other fourteen passes outside the nutrition panel stay on
  the artwork, and say why.** `FDA_NET_QUANTITY_METRIC_NOT_REQUIRED` rests on the document: a random package
  and a food packaged at retail are facts about the package, and stay true whatever the engine managed to
  draw. (This entry first named `FDA_INGREDIENTS_EXEMPT` beside it; reading §101.100 reversed that — see the
  entry above.) Every other pass here is about the panel: 101.3(a) and 101.7(a) say what it "shall bear", 101.7(f)
  and (i) place and size the printed declaration, 101.5(a) says the label "shall specify" the firm, 101.2(c)
  bounds printed letters, and §403(w) is satisfied by what the package prints.

  **The SI exemption's message had to change with it.** It read "The label carries an SI declaration, …" or
  "The inch/pound declaration stands alone", and a pass that survives a declaration drawn off the stock
  cannot say either. It now states the entitlement: "No SI declaration is required, because this is a random
  package", naming a carried SI declaration as permitted all the same. That keeps what the "stands alone"
  test was written to protect.

  **`FDA_NET_QUANTITY_ZONE_NOT_REQUIRED` looks like an exemption and stays on the artwork.** It is keyed on
  panel area, but 101.7(f)'s proviso applies only "when the declaration … meets the other requirements", a
  condition on the printed declaration. `docs/BACKLOG.md` already records the rule applying it
  unconditionally, and a `document` stamp would have deepened that.

  **Each answer is pinned, not just the flip.** The flip has a fixture showing the pass survives. Every
  artwork answer was then flipped in turn against the whole suite — thirteen at the time, the ingredient
  exemption still being stamped `document`; it is pinned in the entry above — and five of the thirteen —
  the proviso, ingredient order, the threshold, allergens and the Contains statement — changed nothing. One
  new document now covers all five: a 50 × 50 mm package on 20 × 60 mm stock, whose declaration, list and
  Contains statement all run off the label. The panel type-size pass is the thirteenth, and it cannot be
  observed, because it names an element the engine never omits. That is the live false clearance
  `docs/BACKLOG.md` already records.

  Two module headers argued that reading the document meant judging it. `netQuantityDualDeclaration` even
  cited the check digit as its precedent, which now rests on the document for a reason that does not carry
  over. Both headers now say the reading is a means.

- **All seven GHS passes rest on the artwork, and now say why.** Each provision governs what the label
  carries. Article 20(3) says a second signal word "shall not appear on the label". C.2.3.1 says a pictogram
  "shall include a black hazard symbol". Annex V and Article 26 decide which pictograms appear. Table 1.3 and
  1.2.1.3 size the label and the printed pictogram. And both small-container provisions list what the
  container's own label must still carry. None is an entitlement or a fact about the chemical. Each call site
  carries the note.

  **Nothing reappears in the audit report, though that was the effect this rule set was expected to show.** The
  expectation was that some pictogram passes would rest on the document and survive the glyph omission every
  audit carries.
  The only GHS pass that omission withholds is `GHS_PICTOGRAM_SIZE_MET`, and it must stay withheld: a frame
  with no symbol is not a pictogram, and on the audit path `pictogramSideMm` is never measured, so a pass on
  the document would clear a size nobody measured on every audit carrying a pictogram.

  **That answer was the only one of the seven a verdict turns on, and nothing tested it.** Stamped `document`,
  the whole suite stayed green. `certification.test.ts` now asserts the rule clears the frame and `runRules`
  withholds it, and fails under that mutation. The other six are unobservable today, which is why they carry
  notes and not tests. `GHS_PICTOGRAM_COMPLETE` cannot be reached. The signal word, set and label-size passes
  name elements this engine never omits. The precedence and small-container passes name none.

  The reading settled the two GHS questions `docs/BACKLOG.md` left for it. `GHS_PICTOGRAM_SET_MATCHES` is a
  live false clearance: it judges the pictograms the label carries, but names the strip while omissions are
  recorded per pictogram, so it survives beside a symbol-less frame. `GHS_PICTOGRAM_PRECEDENCE_MET` is not:
  glyph omissions change neither the codes it reads nor the truth of a "shall not appear". Neither is fixed
  by a stamp, so both are recorded rather than fixed. So is what reading turned up: `layOutGhsLabel` records no
  omission for a block drawn off its stock, so a 50 ml container on a 50 × 25 mm label reports that it
  "carries everything the small-container provision requires" with its manufacturer and outer-package
  statement printed below the edge.

- **The GS1 passes say what they rest on because the provisions were read, not because of a default.** Two
  of the six rest on the document. `GS1_GTIN_CHECK_DIGIT_VALID` reports a check digit, which is computed from
  the GTIN's own digits and is true of the number whether or not a symbol printed. `GS1_DIGITAL_LINK_VALID`
  reports that a URI is well-formed under the URI Syntax standard, and this engine prints no carrier for the
  link at all. The other four measure the printed symbol and stay on the artwork: magnification and bar
  height (figure 5.12.3.1-1 and §5.2.3.2), the quiet zone (figure 5.2.3.4-1), and the digits §4.14.2 says
  "SHALL be placed below the barcode". Each call site now carries a note saying which.

  **No verdict the engine can reach changes.** `layOutUpcALabel` records one omission — a symbol that cannot
  be encoded because its check digit is wrong — and on that label no GS1 rule passes. So a GS1 pass never
  sits beside an omission today, and `certification.test.ts` adds one by hand to pin what happens on the day
  one can: omit the symbol, and the check digit survives while the four passes measured off the bars are
  withheld. The assertion is exact, so changing any of those five answers fails it, and each was mutated to
  confirm that.

  **The Digital Link's survival proves nothing, and its test says so.** The pass names no element, so the
  guard has nothing to look up and keeps it whichever answer it gives; stamping it `artwork` again leaves
  every survival assertion green. The test asserts the declaration itself, which is the assertion that failed
  under the mutation. The registry's count of artwork passes naming no element drops from three to two.

  Reading the rules turned up a live false clearance that neither answer reaches, now in `docs/BACKLOG.md`:
  on 20 mm stock a UPC-A runs 3.85 mm past its top and bottom edges, and bar height and the human-readable
  digits both pass with every digit below the edge of the label. Also recorded there: the check-digit and
  Digital Link rules keep no reading of their source.

- **A pass that does not say what it certifies no longer compiles.** `Finding` is discriminated on
  `severity`: the `pass` arm requires `certifies: 'artwork' | 'document'`, and every other severity carries
  `certifies?: never`. `passed` is now `passedOnArtwork`, beside `passedOnDocument`, and both set the field.

  The field used to be optional, and absent meant the artwork, so thirty-seven of the thirty-nine passes in
  the registry took that answer because it was the default rather than because anyone read the provision.
  The distinction is not decorative: a pass on `'artwork'` is withheld when the engine could not draw the
  element it names, and a pass on `'document'` is not.

  **No verdict changes, and that was measured rather than assumed.** Every fixture, plus four documents that
  reach permission branches, was run through `runRules` on `dev` and on this branch with `certifies` stripped:
  833 findings, 743 of them passes, identical once key order is normalised. The order did change — `finding()`
  now builds the two arms separately — which is why a byte comparison is not the evidence.

  **The thirty-seven `passedOnArtwork` stamps preserve the old default. They are not yet decisions.** They
  were renamed in bulk so that no verdict moved in the same commit as the mechanism; the provisions are read
  after this, rule set by rule set, and a judged call site carries a note saying what its provision governs.

  The guarantee is the compiler's. An earlier draft enforced it with a runtime sweep over the fixtures, which
  a `max` review showed could not see what mattered most: an exemption is not a *bad* label, so no known-bad
  fixture reaches one, and the sweep never observed a single `passedOnDocument` pass. `certification.test.ts`
  now carries a `@ts-expect-error` that fails `npm run typecheck` if the type stops refusing an uncertified
  pass — confirmed by loosening the type and watching it report the directive unused.

  The sweep survives as a second check, moved to `rules/fixtures/sweep.ts` and shared with
  `citations.test.ts`. The two had grown separate copies; the newer one dropped the permission documents the
  older had added deliberately, which is how it went blind. It reaches 34 of the 39 pass codes, observes both
  answers, asserts each rule set clears rather than one pooled count, and asserts that every permission
  document reaches a pass no fixture does — because two of the four were dead on the day they were written.
  One kept a panel its rule's exemption branch requires to be absent. The other paraphrased 21 CFR
  101.9(d)(11)(iii) without its condition — the tabular display is permitted where continuous vertical space
  runs short — so it never declared that fact and got a violation instead of the pass its comment named. An
  earlier draft of this entry blamed the rule's docblock for the paraphrase; the paragraph, read from the eCFR,
  says what the docblock says.

  **The guard's own docblock gave a reason that was not true.** It said a pass with no `elementId` is exempt
  because such passes judge the document, citing a check digit — but `GS1_GTIN_CHECK_DIGIT_VALID` names an
  element. The real reason is mechanical: omissions are recorded per element, so a pass naming none has
  nothing to look up. Which means three `passedOnArtwork` passes are beyond the guard whatever they declare.

  What the review found that this commit does not fix is in `docs/BACKLOG.md`, each reproduced first: a panel
  type-size pass that counts a firm printed at 645 mm down a 240 mm label; a small-container pass stating the
  container carries everything required while its only pictogram has no symbol; a pictogram-set pass that
  names the strip while omissions are recorded per pictogram; the five pass codes the sweep does not reach;
  and duplication a reuse review reported between the sweep's documents and the rule tests' own.

- **`FindingsRail` takes its heading id, its title, whether it announces, and whether its findings can be
  selected.** All three default to what it
  All four default to what it did before, so the editor is untouched. It hardcoded `id="findings-heading"`
  and owned the application's only `aria-live` region — two of the first would have collided on the audit
  page, and a second of the second would have undone the care `EditorView.vue` documents in keeping exactly
  one live at a time. The fourth is because the audit report has no canvas: a finding rendered as a
  `<button aria-pressed="false">` that does nothing when activated announces itself as a toggle and is not
  one, which is the same defect the Digital Link finding was fixed for, arriving from the other direction.

Phase 7, stage 2 — `/audit`, where a photograph becomes a label document one accepted field at a time. The
route has been in the router's inventory since phase 3 as the one line without a "done" beside it.

- **Nothing is accepted on the user's behalf, and the code says so structurally.** `confirmed()` in
  `label-core` iterates the accepted set rather than walking the reading and asking whether each field was
  accepted. The two compute the same answer today and fail in opposite directions: losing the set the first
  way produces an empty document, losing it the second way produces a full one. Reverting to the second makes
  six named tests fail.
- **An edit takes back the acceptance it was made under.** What somebody agreed to was the value on screen at
  the time, and carrying an acceptance across an edit is how a value nobody looked at reaches a label.
- **A reading belongs to the photograph and the market it was made under.** A new photograph, or a change of
  regime, puts the previous reading away rather than leaving its rows acceptable under a different picture —
  and a reading still in flight when either changes is discarded when it lands rather than repopulating the
  screen behind it.
- **An edit stops carrying a confidence the model never gave it.** A confidence is the model's account of how
  clearly it read something; over an edit it becomes a number about text the model never saw, sitting beside
  it as though it still meant something. The row says "edited" instead.
- **A field that would contribute nothing cannot be accepted.** A supplier edited down to a name alone parses
  to nothing, and the button used to take the click, record the acceptance and put nothing in the document,
  with no way to tell that from a field that had worked.
- **The screen and the endpoint agree on how a code is spelled.** `canonicalStatementCode` moved into
  `label-core` because both of them have to reach the same answer, and they did not: the server canonicalises
  whitespace and case before it looks anything up, the screen looked up verbatim, and the symptom was a user
  typing `P337+P313` or `h225` — both of which the server accepts — having it marked unusable and dropped
  from the confirmed field without a word. `canonicalSignalWord` moved for the same reason: the endpoint
  folded case and the screen matched exactly, so an edited `DANGER` — which is what labels actually print —
  was rejected under a banner claiming this build had no wording for it. That banner now says something that
  fits the field it is about; one sentence for all four called a rejected pictogram code missing *wording*.
- **Every closed set is checked, not only the statement tables.** A reading straight from the server is
  already validated against them; an edited one was not, so typing `GHS99` confirmed it into the document.
  The pictogram check is regime-aware, because OSHA recognises eight of the nine and a flat membership test
  would have called GHS09 a pictogram on a US label.
- **A statement code this build has no verified wording for is shown and cannot be confirmed.** It really was
  on the label, so hiding it would be a lie; but `GhsRequest` admits only codes with verified text, so
  confirming one produces a label the save and export routes refuse outright — with a 400 naming a field the
  user cannot edit their way out of. Accepting the field takes the remaining codes. Which codes those are is
  asked of `label-core`'s tables rather than parsed out of the server's warning prose.
- **What a photograph cannot show is typed by the user and labelled as theirs.** The market, the package
  capacity and the measured label size, none of them filled in. `DEFAULT_GHS_STOCK` is 74 × 105 mm — the CLP
  minimum for the three-to-fifty-litre band — so a default there would hand `ghs/label-dimensions` a
  guaranteed pass on a label nobody measured. The screen names what is still missing rather than counting it.
- **A file input first, the camera second.** `capture="environment"` opens the native camera on a phone and
  picks a file on a desktop, which is both the simpler path and the better photograph. Both ends meet at one
  normaliser, because `createImageBitmap` takes a file and a video frame alike.
- **The photograph is oriented and capped before it is sent.** Claude receives no image metadata, so EXIF
  orientation is applied to the pixels or a phone photograph is read on its side. The long edge is capped at
  2576 px — the high-resolution tier's own limit, which the API would downscale to anyway — and the long edge
  is pinned to that figure rather than multiplied towards it: scaling both edges and flooring lost a pixel on
  the commonest case there is, an exact 4:3 photograph, where 3024 × (2576 / 4032) is 1932 in arithmetic and
  1931.9999999999998 in binary.

### Changed

- **`ExtractionResult` no longer admits a field that is present with no value.** `fields` is now
  `{ [K in keyof T]?: ExtractedField<NonNullable<T[K]>> }`, so `fields.supplier.value` is a `GhsSupplier`
  rather than a `GhsSupplier | undefined` and the second optional chain every consumer needed is gone.
  Absence was already sayable: the field itself is optional. `docs/BACKLOG.md` said this should land with the
  consumer that would feel it, and nothing else in the repository needed changing when it did.

Phase 7, stage 1 — Claude vision reads a label photograph. `ExtractionResult` has been defined since phase 1
with no producer; `@anthropic-ai/sdk` has been a declared dependency of `apps/api`, imported nowhere. This is
the first thing on the other side of that socket, and it ships with no user interface at all — `/audit`'s
capture, confirm and report are the two stages after it.

- **`POST /api/audit/ghs` returns an unverified reading and no verdict of any kind.** The boundary
  `docs/DESIGN.md` states — the model reads, the engine judges — is enforced by the endpoint returning an
  `ExtractionResult` whose every field is unconfirmed, and by the extraction schema having nowhere to put an
  opinion. The model authors no prose either: not a note, not a warning, values and confidences only. That is
  stricter than the design asked for, and the reason is placement, since a sentence written by a language
  model beside one carrying a CFR citation invites the confusion the boundary exists to prevent.
- **The extractor is injected, so no test touches the network and no test needs a key.** `AppOptions` takes an
  `extract` the way it already takes `webRoot` and `databaseStatus`. Absent, the endpoint answers 503 and the
  rest of the server is untouched — `ANTHROPIC_API_KEY` stays optional in `env.ts`, deliberately, because
  making `MONGODB_URI` required in phase 6 broke every harness that boots the server and this key has an
  external service and a cost per call behind it.
- **The fixture the suite replays is recorded, not written.** `npm run record:extraction` makes one real call
  against a hand-authored label and commits what came back. A written fixture would be this repository's own
  idea of the API checked against this repository's own idea of the API, which is the circularity
  `ghs/statements.ts` already paid for once. The protocol fixtures — refusal, prose instead of JSON, a body
  the schema rejects — are hand-written, and that is a different thing: their shape comes from the API
  specification, and each changes exactly one thing about the recorded reply.
- **The sample label carries a real defect on purpose.** It prints DANGER and WARNING together, which CLP
  Article 20(3) forbids. `GhsLabelData.signalWords` was made plural in phase 4 with a note saying it was the
  honest shape for this path; the recorded reading comes back `['Danger', 'Warning']`, so the field now earns
  its plural, and stage 3's report will have something true to say.
- **Every way the reading can fail is a different sentence.** A declined request, a reply cut short by the
  token budget, a reply that was not JSON, a reply the schema rejected, an image the vision service refused
  and a service that could not be reached are six outcomes, and collapsing them loses the only part a user
  can act on. The first draft had two of them and reported a truncated reply — cut-off JSON — as an
  unreadable photograph, which blames a label for a budget this server set.
- **The reading reports the model that answered it, not the one this server asked for.** Those are different
  facts — `EXTRACTION_MODEL` is the request and `response.model` is the reply — and a provenance field
  echoing the request is a claim dressed as an observation, which is the one kind of statement this
  application exists not to make. The test for it needed a fixture answered by a *different* model, because
  the recorded one answers on `claude-opus-5` and so does the constant: the obvious assertion passed
  whichever of the two the code reported, and survived the mutation that swapped them.
- **A warning that promised something untrue now says what actually happens.** An unrecognised statement code
  was reported as one a drawn label "records as omitted". It does not: `GhsRequest` admits only codes this
  build has verified text for, so confirming one has the saved-label and export routes refuse the *whole*
  label with a 400 — verified by parsing such a label. The warning says that, and the test asserts the schema
  rather than the sentence, so loosening the schema later fails here and sends someone back to the wording.
- **A 400 from the vision service no longer tells the user their photograph is bad.** It arrives as
  `invalid_request_error` whether the image was undecodable or this server asked for a parameter the API has
  stopped accepting, and the two are told apart only by prose in the message — which is the string-matching
  the SDK's own guidance warns off. The first wording said the image "may be corrupt", which blames a
  photograph for a fault that may be entirely ours.
- **One unreadable field costs that field, not the reading.** A reply is validated as a whole, and on a
  violation the offending fields are pruned and it is validated again — so a confidence of 4 on the product
  identifier no longer discards the supplier, the pictograms and every statement code that parsed perfectly
  well, after a call that has already been paid for. Each dropped field becomes a warning naming it, because
  the one thing worse than losing a field is losing it silently. A body with no field to prune — not an object
  at all — is still reported whole. A code printed twice is stored once as well as warned about once; the
  warning deduped and the stored value did not, so a confirmed label would have carried the duplicate and
  drawn it twice, and the test that should have caught it asserted the warning count and never the value.
- **A signal word printed in capitals is still a signal word.** `GHS_SIGNAL_WORDS` is `['Danger', 'Warning']`
  because that is how CLP Article 20 spells them; real labels print DANGER and WARNING, the sample one
  included, and the prompt tells the model to transcribe exactly what is printed. Those two instructions pull
  against each other on this one field, and the loser would have been the most interesting thing on a label
  carrying both. Case is matched without regard to it and mapped to the codified spelling — which is not the
  normalisation the rest of this work refuses to do, because a paraphrased H-statement is different
  regulatory text where "DANGER" and "Danger" are the same word in different type. A word that is neither is
  left exactly as it arrived, and dropped.
- **A combination code is the same code however a label spaces it.** The precautionary table is keyed
  `'P337 + P313'` and labels print it both ways, so a verbatim `P337+P313` warned as unrecognised and lost a
  statement this build has verified text for. Whitespace and letter case are matched without regard to them
  and the resolving spelling is what gets stored, because the layout engine looks these up by exact key — a
  confirmed `P337+P313` would draw nothing and record an omission, which is the printed label being blamed for
  our punctuation. A code that resolves neither way is kept exactly as read, with the warning beside it.
- **The vision call is bounded at two minutes and one retry, and the token budget is sized to fit inside
  it.** The SDK's defaults — ten minutes, two
  retries — are built for a script, and this is a request somebody is holding a phone through: they add up to
  half an hour of a browser waiting to be told the service could not be reached. The timeout and `max_tokens`
  were first chosen separately and could not both be true: 16,000 output tokens cannot be generated inside
  sixty seconds at any rate this model has produced, so the budget was unreachable, `ExtractionTruncated`
  guarded something that never happened, and a long reading became two billed attempts reported as an
  unreachable service. They are now one decision, and a test asserts they still agree — the next person to
  change either will change only one. The client is built by a factory rather than inline in `server.ts` so
  that the bound can be asserted at all, since `server.ts` opens a database and listens on a port and nothing
  in the workspace imports it.
- **The live test needs to be asked for, not merely afforded.** It was gated on `ANTHROPIC_API_KEY` alone,
  which is a variable people export into a shell profile and leave there — so a plain `npm test` would have
  quietly made a paid call for anyone set up that way. It now also needs `PACKWRIGHT_LIVE_EXTRACTION`, and it
  still does not read `.env`. Two ways to spend somebody's money without their saying so, both closed.
- **Statement codes are transcribed, never repaired.** They are extracted as free strings rather than
  constrained to a set, because `US_OSHA_HAZARD_STATEMENTS` is empty and `GhsRequest` keys its own enum to
  eu-clp whatever the regime says — so a closed set would leave a US label with no valid code at all, and the
  model would be pushed to substitute a code it can see for one it cannot. Each code is classified against the
  regime's own table afterwards. One that has no verified text becomes a warning and is still shown; a regime
  with no table at all says so once rather than once per code, because eleven identical warnings read as
  eleven defects on the user's label when the gap is in this application.

Phase 6, stage 8 — saved labels reach the editor. Persistence shipped as an API in stage 6 with no way to use
it; `/labels` and `/labels/:id` have been in the router's inventory since phase 3, waiting.

- **A list at `/labels`**, and an editor that knows which saved label it is editing. Opening `/labels/:id`
  attaches the document, so Save replaces that record rather than duplicating it, and Save as new is the
  separate act it ought to be. The list omits each label's `data` — a list whose cost grows with the size of
  the labels in it gets slower the more useful it becomes.
- **Switching label type lets go of the saved label.** A saved label is one type and its `data` is a
  discriminated union keyed on it. The API would accept the conversion without complaint, which is exactly why
  the client must not offer it: a stored record would change kind because somebody clicked a tab, under a name
  still describing what it used to be. The watcher is synchronous, because a flush on the next tick leaves a
  window in which the type has changed and the attachment has not — and a Save in that window writes the wrong
  kind.
- **Unsaved work does not leave quietly.** `onBeforeRouteLeave` covers navigation inside the application and
  `beforeunload` covers closing the tab, both gated on whether the document differs from what was last
  written. That comparison sorts keys before comparing: the editor builds its document field by field and a
  loaded one arrives through JSON, so a direct string compare reports every freshly-opened label as modified —
  and an indicator that is always on is one nobody reads.
- **The round trip `docs/BACKLOG.md` was waiting for, closed and tested.** A saved label holds `stock` beside
  `data` while the export request takes them flattened and defaults a missing one. Opening a label now restores
  its stock, and a browser test saves at 90 mm, opens, exports and asserts the PDF's MediaBox. Reverting the
  fix reports `[0 0 170.07874 113.385827]` — 60 mm, the default — which is the silent wrong size the entry
  described.

### Fixed

- **An oversized request body reported `500 Internal server error`.** `express.json` throws with
  `status: 413` and `type: 'entity.too.large'`, and the application error handler flattened every error to an
  internal one — so a caller who sent 11 MB was told the server had broken. Verified by posting exactly that
  before the fix and getting the 500 back. No route had previously taken anything large enough to reach it;
  `/api/audit` will, from every phone. The handler now answers the three failures `body-parser` actually
  raises — 400, 413 and 415 — each in this server's own words. A status range with one shared message was
  tried first and was wrong for the third: an unsupported `Content-Encoding` came back as a 415 carrying the
  sentence "Bad request", which is a status about the encoding and a sentence about the body. Anything not on
  that list stays a 500 with its detail in the log, so a library reporting a 5xx of its own cannot borrow the
  server's voice. None of the three is logged: `morgan` already records the request, and a stack trace per
  oversized upload turns the one signal that log carries into noise.
- **A blank `ANTHROPIC_API_KEY` in the environment silently beat `.env`.** `dotenv` will not overwrite a name
  that is already defined, and defined-but-empty counts as defined, so a shell exporting `ANTHROPIC_API_KEY=`
  left a perfectly correct `.env` unread and the server reported vision extraction unconfigured while the key
  sat in the file. Found by running the fixture recorder, which refused to start for exactly that reason.
  Blank now means absent one step earlier, which is the rule `env.ts` already applies through `blankAsAbsent`
  and the reason it gives — a task definition declaring a variable with an empty value has not supplied it.
  Scoped to the names the schema reads, derived from the schema so a new field cannot be forgotten.
- **`/labels/new` kept the last saved label attached, which was a way to overwrite one.** The store is a
  singleton and the editor is the same component at both routes, so arriving at `/labels/new` from a saved
  label — which the header's own Editor link does — left `savedId` set. The document still read "Saved", and
  the next edit followed by Save issued a `PUT` over the record the user thought they had navigated away from.
  The editor reacts to the route now rather than only to being mounted.
- **Both unsaved-work guards were inert for a new label**, which is the case they most exist for: an hour of
  work on something never written is the work most easily lost. `isDirty` was gated on having been saved, so a
  document with no record behind it could never be dirty. The baseline starts at the seeded document instead,
  so an untouched editor is clean and the first edit is not.
- **Two new error lines broke a `v-if` chain they were inserted into.** `v-else-if="cannotExport"` rebound
  onto `loadError`, so a failed open suppressed the only explanation beside a disabled Export button, and an
  export error could show two messages at once. They sit after the pair now rather than between it.
- **A failed open kept complaining after a successful save**, because `loadError` was set and never cleared.
- **A delete that 404s left a row nothing could clear.** A label that is already gone is a delete that got
  what it wanted.
- **A failed list showed "Nothing saved yet".** The request failing leaves the list empty too, so the empty
  state and the error appeared together — telling a reader their work is gone at the same moment as telling
  them the server could not be reached. Found by the test written to prevent exactly that.


Phase 6, stage 7 — the landing page draws all three.

- **Three regimes, rendered live rather than pictured.** `docs/DESIGN.md` has always asked the front door for
  "the three types"; it drew one. GHS and FDA food now resolve through their own engines in the browser
  alongside the retail label, each captioned with what it checks and the source it checks against. The page's
  claim is that it draws labels rather than showing images of them, and drawing one of three was the weakest
  version of that.
- **The food sample declares `marzipan (almonds)`, not `almonds (almonds)`.** `docs/BACKLOG.md` records the
  editor's seed declaring an allergen against an ingredient already named for it — a demonstration that
  demonstrates nothing. An ingredient whose name does not reveal its allergen is the case the parenthetical
  exists for, and the front door is where it earns its place. The showcase documents are declared in the view
  rather than borrowed from the store, because the editor's seeds exist to be edited and these exist to be
  looked at; sharing them would let a change to the editor's starting point silently redraw the front door.
- **The browser test counts three, and reads something the page cannot fake.** It asserted one visible
  canvas, which would have gone on passing if two of the three stopped resolving. Counting them and reading
  each `<title>` was the first attempt and was barely better: the title is a prop the caller passes, so
  pointing all three canvases at one layout drew the same label three times and the titles still read
  correctly. It now asserts the three distinct stock sizes, which `LabelCanvas` derives from the resolved
  layout rather than from anything the view hands it.
- **The showcase documents have a test, which is how the two defects in them were meant to be found.** A "2
  percent or less" statement grouped a 10% sugar and a 5% butter, and eight servings did not reconcile with
  the declared net weight — both found by hand, and neither would have been found again after the next edit.
  They live in `landingSamples.ts` now, because a const inside a `.vue` script block is reachable by no test,
  and both go through `runRules`: nothing against the food label, and exactly the two documented pictogram
  omissions against the chemical one, asserted exactly so a third cannot arrive behind them unnoticed.

### Fixed

- **`README.md` said "Phase 3 of 8 complete", 376 tests, and that the GHS label was next.** GHS shipped in
  phase 4 and the food label in phase 5. The status now says what is true, including the part that is not
  finished: scanning a real product barcode with a phone is still unverified, because a fake camera reading a
  synthetic frame says nothing about focus, glare or a curved pack.

### Added

Phase 6, stage 6 — persistence. Saved labels, as an API. No user interface yet: the list, the `/labels/:id`
route and the save experience are about the editor rather than about storage, and are the stage after this.

- **`LabelDocument`, with `data` stored as `Mixed` and judged by Zod.** The shape of a label is described
  once, in `schemas.ts`, and the persistence routes validate against the same description the export routes
  are built from. Restating three large label-data shapes in a second schema language would be a second
  source of truth for one set of facts — the drift `getSymbologyConstraints` was introduced to end. The trade
  is that nothing at the database level checks `data`; the API is its only writer, and it checks every write.
- **Five routes under `/api/labels`** — list, create, read, replace, delete. The list omits `data`, in the
  query rather than by stripping it afterwards, so the cost of listing does not grow with the size of the
  labels in it. `PUT` rather than `PATCH`, because the editor holds the whole document and merging a partial
  update into a discriminated union is where a `us-food` label still carrying a `gtin` comes from. A
  malformed `ObjectId` is a 404 and not a 500: it is a request for a label that does not exist, and letting
  Mongoose's cast error through reports a server fault for a client's typo.
- **What was validated on the way out is what is served.** Parsing a stored document and then sending the
  original checks nothing a client can see: zod strips keys it does not recognise, so a `data.gtin` left on a
  us-food label by an older shape parsed clean and the unsanitised original went out regardless. That is the
  same defect the replace on `PUT` exists to prevent, arriving from the other direction — and a stale value
  that reaches a client is a value that can be sent back.
- **A document is parsed again on the way out.** A stored document is untrusted input the moment the schema
  moves, and one saved under an older shape that silently deserializes into something the engine mis-draws —
  or that a rule then judges — is the class of defect this project keeps finding by review and never by its
  suite. A label that no longer validates is reported with its id rather than served.
- **`stock` is required on a saved label** where the export request treats it as optional and falls back to a
  default. A saved label records the stock it was designed at; inheriting `DEFAULT_UPC_A_STOCK` would mean
  that changing that constant silently resizes every label already stored against it, and the resize would
  first be visible in a PDF somebody had already sent to a printer.
- **A saved us-food label gets the same cross-field checks a posted one does.** `.refine` returns something
  that is no longer an object and `.omit` is an object method, so the saved shape has to be built from the
  unrefined base — and would have been validated more weakly than the same label sent to the exporter. The
  refinement is named and reapplied, and a test fails if it stops being.
- **`/health` reports the connection, and answers 503 without one.** Phase 8 puts an ALB target group behind
  it, and a task that reports healthy without a database holds a broken instance in service. The status is
  injected rather than looked up, for the reason `webRoot` already is: `createApp` builds the same
  application every time it is called, and importing mongoose into it would make every route test that asks
  about a PDF depend on a live connection.
- **An edit no longer re-dates the label it edits, and still clears what an older shape left behind.** A
  replacement body carries no `createdAt`, so mongoose's replace branch wrote the current time into it and
  every `PUT` reported the label as newly created — unnoticed, because the test for replacing one asserted
  only its name. Updating the known fields with `$set` fixed the date and broke the replacement: a field from
  a schema that has since moved on survived every edit, and would become live label data again the day its
  name was reused. So the replace stands and `createdAt` is carried across it explicitly. Both halves have a
  test that fails without them: drop the carried date and the first fails, swap back to `$set` and the second
  does.
- **A second `mongod` starting alongside the first no longer has its data directory deleted, in either
  direction.** The sweep that
  bounds what a `SIGKILL` leaves behind reads a directory with no recorded owner as abandoned, and the owner
  was only recorded once `mongod` had finished starting — leaving seconds in which a concurrent run would
  delete a directory that was very much in use. The claim is written before the sweep runs and handed to the
  `mongod` pid afterwards. Two wrappers started together now both come up healthy with both directories
  intact.
- **The label list sorts on an index.** An unindexed sort runs in memory against a 32 MB ceiling, which is a
  long way off for a collection of labels and a 500 with no obvious cause when it arrives.
- **A test ties the schema's label types to the ones the model accepts.** The union restates them because each
  arm carries a different `data` schema, so the arms cannot be derived from a list — but the two lists
  agreeing can be asserted, and has to be: a type in one and not the other turns a request the schema accepts
  into a 500 from the Mongoose enum validator. That is the same two-sources-of-truth failure this stage exists
  to avoid, one level up from where it was being avoided.
- **The wrapper's owner file is renamed into place rather than written over.** A plain write truncates first,
  so a neighbour's sweep reading it in that window got an empty string — which parses to zero, fails the
  liveness test, and reaches the one conclusion that must never be reached by accident: that a live database's
  directory is free. The Y4M fixture already writes itself this way for the same reason.
- **`templateId` is not in the model** that `docs/DESIGN.md` sketches. It has no referent — `templates/`
  exports element maps and defaults rather than identified templates, and `labelType` already selects which
  `layOut*` function runs. A field naming nothing gets filled in with something arbitrary and then read as
  meaningful.

### Changed

Phase 6, stage 6 — persistence. The first of two parts: nothing new works yet, and one file learned to share.

- **The server now refuses to start without `MONGODB_URI`, and everything that boots it supplies one.**
  `env.ts` has argued since it was written that reading config at each use site "defers a missing database URI
  until the first request that needs it, which in a container means a task that reports healthy and then 500s
  under traffic" — the variable was only optional because there was nothing yet to store. `blankAsAbsent`
  still wraps it, so an ECS variable declared with an empty value is reported as *missing* rather than as
  failing a non-empty check, which is the difference between looking at the task definition and looking at the
  schema.
- **Making it required exposed four tests that were passing on the wrong thing.** Every case in `env.test.ts`
  built its environment from scratch, so once the URI was mandatory the three asserting `Invalid environment`
  threw on the missing URI rather than on the port or the `NODE_ENV` they name — green, and true with their
  own subject deleted. They now vary one field against a complete base environment. Confirmed by removing the
  TCP upper bound: "rejects a port above the TCP maximum" fails, where before it would not have noticed.
- **`verify:build` and the browser suite start a real `mongod` rather than being handed a stub.** Both boot
  the shipped artifact, so both stopped working the moment it demanded a database — `verify:build` exited 7 on
  a health check that never answered. `mongodb-memory-server` rather than a container, so a clean checkout
  with no Docker still runs the whole suite, and `scripts/serve-with-memory-mongo.mjs` sets one variable and
  imports the built `server.js`, so what is verified is still the artifact. `docker compose up -d`, an
  `apps/api/.env.example` and a README note cover the one case that does want a database outliving its
  process: `npm run dev`, which the required variable had quietly broken. The template sits in `apps/api/`
  rather than the repository root because `dotenv` resolves `.env` against the working directory and npm runs
  a workspace script from that workspace — a root `.env` is read by nothing, which was harmless while every
  variable was optional and a failure to start the moment one was not.
- **The browser suite gets its database from the same wrapper, which is what makes its lifetime simple.** The
  first attempt owned a `mongod` in `playwright.config.ts`, and that config is re-imported in every worker —
  the behaviour the Y4M fixture already works around with an atomic rename — so it needed a guard to avoid
  starting one per worker, a teardown to stop it, and an exception for workers that construct `webServer`
  without ever starting one. Measured, the guard did work: the config loads six times here and one `mongod`
  started. It was still the wrong owner. `--list` started one, a failed `webServer` left one behind, and the
  global teardown ran before the server it was serving had stopped. Started inside the process Playwright
  already manages, all three stop being possible and the guard, the teardown and the exception all go away.
- **The wrapper cleans up after the failures it exists to catch, including the ones that arrive late.** A
  server that throws on the way up is precisely what `verify:build` is for, and letting that take the wrapper
  down orphaned the `mongod` — reproduced, and flatly contradicting the comment above it claiming none was
  left behind. A `try` around the import was not enough either: an error thrown *after* the module evaluates,
  which is what a failed `listen` is, reaches neither the `catch` nor anything Node installs by default.
  `uncaughtException` and `unhandledRejection` now do, and the signal handlers are registered before the
  database is created rather than after. Proven with a deliberate throw 300 ms after listening: no process
  and no directory survive it.
- **The sweep asks whether the `mongod` is alive, not whether the wrapper is.** It asked the wrong process:
  `mongod` is a child that outlives a wrapper killed outright, so a later run would find the wrapper gone and
  delete the wiredTiger files out from under a database still using them — the precise hazard the comment
  claimed to prevent. Each run now records its `mongod`'s pid beside the directory and spares any directory
  whose recorded owner still answers. Demonstrated with three planted directories: a dead owner and an
  ownerless one are removed, a live owner is left alone.
- **`verify:build` notices a server that has already exited.** The health budget was spent in full on a
  process that had died in one, reporting a timeout for a crash — the same misdirection the budget was
  widened to remove, just slower. It checks the pid each time round and now says so in a second.
- **What a `SIGKILL` leaves behind is bounded at the other end.** A graceful stop cleans up after itself —
  verified by signalling the wrapper directly — but Playwright does not always let it finish, and nothing
  survives being killed outright. So each run sweeps the directories left by runs whose process is gone and
  spares any whose process is alive, which is what makes it safe when `verify:build` and the browser suite
  overlap. Demonstrated with a planted dead pid and a live one: the first is removed, the second is not.
- **A connection string has to be one mongoose can dial, not merely non-empty.** `blankAsAbsent` maps only
  the empty string to absent, so `MONGODB_URI="   "` was a *present* value that satisfied a non-empty check —
  booting a server that reports healthy and fails at first connect, which is the precise deferral this change
  was made to prevent. The scheme is checked instead, so `localhost:27017` and a stray `postgres://` are
  refused at startup where the message can still name the variable.
- **`verify:build` waits thirty seconds for health, and says so when it does not get it.** Ten was tight
  enough to expire on a slow start now that a `mongod` comes up before the server listens — seconds, not
  minutes, since `mongodb-memory-server` fetches its binary during `npm ci` rather than at boot. An earlier
  version of this entry claimed that download happened here and budgeted ninety seconds for it; the cache
  directory says otherwise, and a budget padded for something that does not happen only delays a real hang.

- **What a label is now lives in `apps/api/src/labels/schemas.ts`, not inside the export routes.** The three
  request schemas and the `toX` mappers that reconcile Zod's `string | undefined` with `label-core`'s
  genuinely-absent optionals were module-local to `routes.ts`, which was fine while exporting a PDF was the
  only thing that needed to know the shape of a label. Saving one needs the same answer, and writing a second
  description of the same fields is how two sources of truth for one set of facts get created — the drift
  `getSymbologyConstraints` was introduced into this very file to end, when each side carried its own copy of
  the payload length and the magnification range and could disagree without a test failing. `routes.ts` goes
  from 752 lines to 277.
- **The move is a move.** Every declaration is byte-identical to the one it replaced, bar three signatures
  prettier reflowed because `export ` pushed them past the print width, and **no test file was edited** — 918
  tests pass against code that was only relocated. That property is the whole reason this is its own commit:
  a refactor that needed its tests changed to stay green is not a refactor, and the claim is worth being able
  to check at a glance rather than inferring from a diff that also adds a feature.

### Added

Phase 6, stage 5b — the camera. **Done-when #1**, as far as a headless browser can carry it.

- **A scanner in the retail form**, reading through whichever engine the browser has. The read goes to
  `store.applyScan`, so nothing here decides what may become a GTIN-12 — `normaliseScannedGtin` does, and it
  is the only thing permitted to.
- **The ponyfill rather than the polyfill.** The polyfill assigns `globalThis.BarcodeDetector`; a library that
  patches a global is one whose absence is untestable and whose presence is invisible.
- **The `.wasm` ships in the bundle.** zxing resolves it from jsdelivr by default, which would make a label
  editor stop scanning when a CDN has a bad day, put a third party in the path of a shopper's camera, and
  breach the policy the API serves this client under.
- **The Content-Security-Policy gains `'wasm-unsafe-eval'`, and nothing else.** `script-src 'self'` forbids
  `WebAssembly.instantiate`. `'unsafe-eval'` would have worked and would also re-enable `eval` and
  `new Function` for the whole application, which is the grant this policy exists to withhold.
- **A scan-back test, which `docs/DESIGN.md` calls the one that actually matters.** The symbol the camera
  reads is drawn by `layOutUpcALabel` and rasterised into the frames Chromium serves as a camera, so it
  asserts what no unit test can: that what the engine draws is what a reader reads back. The fixture decodes
  its own frame before writing it, because an undecodable one would otherwise surface as a browser test timing
  out with no reason given.

### Fixed

- **The browser's own detector is now trusted only as far as it reads.** `getSupportedFormats()` is a claim,
  not a demonstration: headless Chromium reports `upc_a` and `ean_13` and then returns an empty array from
  every `detect` call, against a frame zxing reads immediately. A user cannot tell that from a camera that
  will not focus — they hold the phone steadier and give up. After eight seconds of reading nothing, the
  frames go to zxing instead. Eight and not the two it started at: a barren frame is usually just aiming, and
  two seconds downgraded a working platform decoder on any device where someone took a moment to line the
  pack up.
- **The camera is asked for 1280×720.** The default stream is 640×480, which puts a UPC-A module at about
  five pixels once the pack is far enough away to fit in frame, and five is under what the reader needs.
- **`ref="video"` bound to nothing.** The composable owned the ref and the component assigned it across, which
  vue-tsc reported as an unused local and Vue never populated: `play()` was called on nothing and the camera
  sat paused with no frames while the status read "scanning". The component owns the element now and hands it
  over.
- **A camera handed in was reported as a browser without one.** `start` checked `navigator.mediaDevices`
  before using the injected stream, so every test in jsdom answered `unsupported`. That check belongs to the
  real implementation, which is the only thing it is knowable about.
- **Two browser tests that passed without scanning.** The editor opens on the GTIN the fake camera carries, so
  "the field contains the scanned value" was true before the camera was opened — both passed in 590ms. Every
  scanner test now moves the field off its default first.
- **One `zxing-wasm` in the tree, pinned rather than ranged — the scanner was running one version's
  WebAssembly under another version's loader.** `detector.ts` resolves the `.wasm` from *this* package and
  hands the URL to `setZXingModuleOverrides`, while the Emscripten glue that loads it comes from whichever
  copy `barcode-detector` resolved; `barcode-detector@3.2.2` pins `zxing-wasm` to an exact `3.1.3`, so the
  root's `^3.1.4` — added for the fixture that rasterises the frames — hoisted 3.1.4 and split the pair. The
  two are not interchangeable and they do not say so: 3.1.3's reader is 1,093,289 bytes against 3.1.4's
  953,527, the import and export names still line up, the module instantiates, and the first `detect()` then
  spins in WebAssembly for ever. No exception, no console output, no failed request — the page's main thread
  simply stops, and it presents as a camera that has gone quiet. Both manifests now pin the version
  `barcode-detector` pins, and `wasmPairing.test.ts` asserts the single copy by resolved path, so the guard
  keeps holding when that pin next moves.
- **A frame that threw did not count as a frame that read nothing.** `barrenTicks` advanced only when
  `detect()` resolved empty; a rejection was swallowed on its own, so a detector that threw on every frame —
  which is what Chromium reports when the platform's barcode service is unavailable — never spent its trial
  window and never lost the camera. The one failure the window exists to rescue was the one it could not see.
  Both outcomes now go through `symbolsIn`, which has read nothing either way.
- **The fake-camera fixture downloaded its reader from jsdelivr.** `assertDecodes` calls `readBarcodes` in
  Node without overriding `locateFile`, and zxing-wasm's default points at `fastly.jsdelivr.net`. It runs at
  `playwright.config.ts` module scope, so the whole browser suite fetched a megabyte from a CDN before the
  first test and died at config load without a network — the client refuses to do this for reasons that apply
  just as well to the fixture checking it. It now reads the bytes off disk with `wasmBinary`, which was
  confirmed by running the config with `fetch` blocked: clean with the override, `Aborted(both async and sync
  fetching of the wasm failed)` without it.
- **"The WebAssembly comes from the bundle" assumed zxing had run.** The test required at least one `.wasm`
  request, which is true only where the platform's own detector failed to read — the same operating-system
  assumption that put `data-scan-engine="native"` in a test that would have failed on `ubuntu-latest`. The
  same-origin assertion holds everywhere and stays unconditional; the premise is now tied to whether `zxing`
  was actually observed on the status element, recorded by a `MutationObserver` because a successful scan
  closes the panel before the test could read it. The scanner spec also gets a 60 s test timeout: a 25 s
  assertion inside Playwright's default 30 s, on a path that spends eight seconds on the native trial, turned
  a useful mismatch into a bare timeout.
- **The fallback's own tests stopped testing it when the window moved.** Widening the trial from two seconds
  to eight left one sleeping a fixed five, so it timed out waiting for a swap that had not happened yet — and
  left the other asserting the detector was *still* native at 2.6 seconds, which it now is whatever the code
  does. That one had been written for the abandoned comparison and claimed a behaviour the scanner does not
  have: the swap is unconditional. Both now walk a fake clock to the near and far edges of the exported
  `NATIVE_TRIAL_MS`, so they track the constant instead of a number typed beside it, and they assert what
  ships — barren at the near edge, swapped at the far one, whether or not zxing reads either. Eight seconds
  of real sleeping per assertion became 504ms for the file.
- **Two recorded causes for that hang were wrong, and are corrected where they were written.** It was first
  read as `WebAssembly.instantiate` hanging, which retired the sharper fallback that offers zxing the frame
  native failed on; then as the Content-Security-Policy refusing a CDN request, which is why
  `setZXingModuleOverrides` was imported statically while the detector beside it was not. Neither survived
  being run: the ponyfill requests nothing until a `BarcodeDetector` is constructed, and that is after the
  override is set either way. Both imports are dynamic again, so the glue and its megabyte are fetched when
  the camera opens rather than on every page load.


### Added

Phase 6, stage 5a — turning what a scanner read into a GTIN-12, or refusing to.

- **`normaliseScannedGtin` in `label-core/src/gs1/`.** A camera hands back whatever the symbol carried and
  the retail form takes twelve digits; those are not the same thing. It narrows the one read GS1 defines as
  lossless — a GTIN-12 *is* a GTIN-13 with a leading zero — and refuses the rest by name rather than by
  truncation. **It never recomputes a check digit**, because the most common real defect in a supplied GTIN is
  a transposed digit and an engine that repairs one silently accepts the wrong product.
- **Paste goes through it.** `maxlength="12"` is right for typing and wrong for a paste: it keeps the first
  twelve characters of a 13-digit read, so the *check digit* is what falls off. Most truncations then fail
  that check — but **about one in ten passes it**, measured at 527 of 5,000, and becomes a structurally valid
  GTIN naming a different article with nothing said. A paste shorter than eight characters is a fragment and
  is left alone.
- **A refused read is announced, not merely shown.** A refusal a screen reader never hears leaves the field
  unchanged and silent, which is the state the feature exists to avoid.

### Fixed

- **Three claims of my own, corrected by measuring them.** The first: a 13-digit scan was described as
  producing a "silent non-check". It does not — the engine refuses to draw and the editor says "A GTIN-12 is
  exactly twelve digits", with zero findings. `findings: 0` means nothing ran, not everything passed, and that
  is the second time this phase the distinction has been got wrong.
- The second: naive truncation was described as producing a plausible wrong product. The check digit catches
  it, and the reason is exact — the dropped digit sits at an odd index counted from the right, so it carries
  weight 1, and the check digit survives truncation **if and only if that digit is zero**, which is precisely
  the lossless case. The refusal exists for the error message, not for safety: `slice(1)` would be caught, and
  reported as a wrong check digit about a barcode with nothing wrong with it.
- The third, and the worst: the test that measured the claim above generated every payload with
  `padStart(12, '7')`, so all 2,000 codes began with a 7 and the one interesting branch never ran. Mutating
  its expectation to a nonsense number still passed, while the docblock cited it as evidence. It now covers
  all ten leading digits and asserts that it does.
- **A regex that had been corrupted into control characters.** `[\s -]` had become `[\s\x00-\x1F]` through a
  shell-escaped mutation command, and every test passed either way. Replaced with `trim`, which is all the
  behaviour that can actually be justified.
- **A vacuous paste test.** jsdom does not insert on paste, so asserting the field equalled the value it
  already held proved nothing — removing the paste handler left it green.


### Added

Phase 6, stage 4 — the responsive collapse. **Done-when #3.**

- **Below 1024px the editor's three panes take turns behind a Form / Preview / Checks control.** They do not
  shrink: the editor is desktop-first because a phone is a bad place to lay out a 100 × 150 mm label, and
  three squeezed columns would be worse than one usable one. `docs/DESIGN.md` names one threshold, and `lg` is
  exactly 1024 in Tailwind v4 — so no `--breakpoint-*` token was added. 375 / 768 / 1024 / 1440 are four
  widths to verify at rather than four breakpoints, which is what the plan had assumed.
- **A tablist, where the zoom control beside it is a group of pressed buttons.** Zoom is a set of independent
  states of one thing and `aria-pressed` says so; this switches which of three regions is displayed, which is
  what `tablist` / `tab` / `tabpanel` describes. Forcing them to match would announce one of them wrongly.
- **Following a finding goes to the canvas it outlines.** Below `lg` the canvas is not on screen when the
  findings are, so without this the interaction the editor is built around silently does nothing on a phone —
  worse than not offering it.
- **The masthead fits 375px.** Found by looking at a screenshot: the label-type select and the export button
  did not fit on one line and "Export PDF" was cut off at the window edge, while every assertion passed,
  because a clipped button is still visible and still clickable by its accessible name.
- **Browser tests at the four widths.** This is the file jsdom could not have written: it has no layout
  engine, cannot evaluate a media query or resolve a `lg:` variant, and would report all three panes visible
  at every width.

### Fixed

- **A required dimension left blank now holds `NaN` rather than the empty string.** `v-model.number` hands
  back the original string when `parseFloat` gives NaN, so clearing a container dimension wrote `''` into a
  field the type declares as `number`.
- **The entry in `BACKLOG.md` calling that a false clearance was wrong, and is corrected rather than
  quietly dropped.** It said the empty string multiplied out to a zero-area panel and cleared every 101.7
  rule. The arithmetic is right — `'' * 240` is `0`, and `isNetQuantityZoneRequired(0)` is `0 > 5` — and the
  path is not: `assertContainerDrawable` reaches the container first and `Number.isFinite('')` is `false`
  because it does not coerce, so the label never resolved and no rule ever ran. It was written from reading
  the predicate rather than running the path, and said so approvingly. Reading a predicate tells you what it
  returns for an input, and nothing about whether that input arrives.
- **A mutation that killed nothing, which was the more useful result.** Removing the `lg:` from the grid's
  column template left all nine collapse tests green, because the panes are shown and hidden by their own
  classes — while the one visible pane sat in a 380px column on a 375px screen and the editor scrolled
  sideways. Visibility and fit are two claims and only one was being made.


### Added

Phase 6, stage 3b — the rule catalogue. **Done-when #2.**

- **`/rules` lists all thirty-four encoded rules, generated from `listRules()`.** Nothing on the page is
  written by hand, which is the whole point: a hand-written catalogue is a second description of the rule set,
  and it goes stale the first time someone adds a rule and forgets the page — leaving a document claiming the
  tool checks something it does not. The page calls the same function `runRules` dispatches through, so a rule
  a user can read about is a rule that runs.
- **Every provision, not just the primary.** Sixteen rules report under more than one paragraph, so the entry
  renders `citationsOf` — 68 distinct provisions across the set. `ghs/signal-word-precedence` shows both CLP
  Article 20(3) and 29 CFR 1910.1200 Appendix C, rather than telling a US labeller their signal-word rule comes
  from an EU regulation.
- **A citation with a reference and no title renders as the reference.** That state is legitimate rather than
  missing data — `untitled()` drops an inherited title rather than composing one, because writing a description
  of a regulated provision would be this project authoring regulatory text — and the page shows what is known.
- **Registry order is preserved within each section.** It is ordered as a person would check a label, and
  sorting it into something tidier would throw that away for nothing.
- **`SiteHeader`, mounted by the reading routes rather than wrapping everything.** A global shell would sit
  above the editor too, and the editor is a full-height three-pane application with its own header and its own
  `h-screen` scroll contract — a band of chrome would push the canvas off the bottom of the window. It sits
  outside `<main>`, so the page has a `banner` landmark and a skip link lands past the nav rather than on it.
- **The button recipe is one constant, and carries no size.** The landing page's call to action and the
  editor's export control had already drifted — `px-4 py-2` against `px-3 py-1.5` — and that difference is real
  rather than drift, since one is a primary action and the other a toolbar control. `BUTTON` holds the border,
  hover and focus treatment; callers add their own scale. Flattening them would have been a visual regression
  dressed as a cleanup. The canvas zoom control deliberately keeps its own: its background is conditional on
  `aria-pressed`, so sharing would mean parameterising away everything that was shared.
- **The tests compare the page against the registry, never against a typed number**, in jsdom and in the
  browser alike. A spec asserting "34 rules" would pass a page that had stopped rendering one and been updated
  to match, which is the hand-written catalogue's failure moved into the test file.

### Fixed

- **`text-chrome-500` reached for the citation lines again.** It measures 3.01:1 on `chrome-900` and the
  guardrail in `theme.test.ts` exists because it was used for the citation lines on the landing view once
  before. It caught the same reach on the catalogue's authority column within a minute of it being written,
  which is the argument for enforcing a palette rule rather than documenting one.


### Added

Phase 6, stage 3a — every provision a rule enforces, declared.

- **`Rule.citations`, and `citationsOf`.** `citation` is the primary a finding inherits, but **sixteen of the
  thirty-four** rules override it per finding. The thirty-four primaries cover **31 distinct provisions**; the
  rules between them cite **68**. So a catalogue generated from `citation` alone would have answered under half
  of the question `/rules` exists to answer. `us-food/dual-column-form` would have shown 101.9(e) and hidden
  (e)(1), (e)(2) and (e)(3); `us-food/nutrition-rounding` would have shown 101.9(c) and hidden twelve nutrient
  paragraphs.
- **`ghs/signal-word-precedence` no longer misattributes its own authority.** It carries CLP Article 20(3) as
  its primary and emits 29 CFR 1910.1200 Appendix C whenever the label's regime is `us-osha`, so a catalogue
  showing the primary alone would have told a US user their signal-word rule comes from an EU regulation. Both
  are listed now.
- **`citations.test.ts` runs every fixture and fails on any provision a finding cites and no rule declares.**
  It found seventeen on its first run — the exact measure of what the catalogue would have hidden. The check is
  a test rather than a throw inside `finding()` because several references are looked up from tables at
  judgement time, and a rule citing a real provision nobody had listed would otherwise crash a user rather than
  fail a build.
- **Derived where a table exists, written out where one does not — and the difference is recorded.** The
  rounding rule's thirteen paragraphs come from `NUTRIENTS` and the SI exemptions from their own table, so
  neither can drift from what the rule reads. `us-food/nutrition-type-size` is written out instead, because
  (d)(7)(iii) is cited from the check body rather than from `minimumsFor` and a derivation would have looked
  tidier while quietly omitting one.


### Fixed

Phase 6, stage 2b — the dual column, corrected on three counts. Source: 21 CFR 101.9(e), (e)(1), (e)(2) and
(e)(3), read from the eCFR on 2026-09-13.

- **A second column is drawn where there are figures to put in it.** `columns.mode === 'dual'` is a request
  and was being read as the answer, so a panel with no second amounts was drawn with both headings above a
  single column of numbers. (e)(1) requires headings "accurately describing the amount per serving size …
  **that are being declared**", and a heading over a column that does not exist describes nothing that is
  being declared; the opening of (e) says it from the other side, since "equal prominence shall be given to
  **both sets of values**" presupposes two sets. Such a panel is now drawn as the single-column panel it is,
  and the engine's omission reports the column that was asked for and not drawn.
- **The first column prints the percentage the label declares.** The dual branch called
  `printedPercentDailyValue` for both columns, which ignores `declaredPercentDv` — so the panel printed the
  *correct* percentage while `us-food/nutrition-percent-dv` read the document and reported the wrong one. The
  artefact and the finding contradicted each other, and the mis-declared-percentage defect was undrawable on
  every dual-column label: the rule could not be right about that panel in either direction. The second
  column derives its own, because nothing in `UsFoodNutritionFacts` declares one for it.
- **`us-food/dual-column-form` reports a column carrying one figure of fourteen** — `FDA_DUAL_COLUMN_INCOMPLETE`
  under **(e)(2)**, which requires the quantitative information "for the form of the product as packaged **and
  for any other form**". The engine emits the second-column band as soon as any single nutrient carries a
  second amount, which is correct, and left the form rule clearing a panel whose second column was a
  fourteenth full. (b)(12)(i)'s mandate satisfied by one number.
- **All four dual-column fixtures were themselves that defect.** Each carried `secondAmounts: { 'total-fat':
  7.5 }` and nothing else, so every fixture proving the dual-column rules work was built on a panel declaring
  a second form for one nutrient. Each is written to provoke one defect in the *form* of the panel, and a
  fixture wrong about anything other than its own defect can pass for the wrong reason.
- **A second-column Calories figure is no longer lost in silence.** The dual branch draws Calories in its own
  block above the nutrient rows, and that block carries one figure — so `secondAmounts.calories`, which the
  rail offers a box for, was accepted, stored and dropped, while the new (e)(2) check scanned only nutrient
  rows and cleared the panel as complete. Whether a dual panel should carry two Calories figures is a question
  for 101.9(e)(6)(i)'s display, which is an illustration rather than a paragraph and has not been read, so the
  engine does not invent the drawing — it records the omission.
- **The engine and the panel now agree about how wide the panel is.** The engine sized it on
  `columns.mode === 'dual'`, the request, while the drawing decides on the figures — so an unfilled dual
  request was drawn as a single column at the width of two. Both ask `willDrawSecondColumn`.
- **An omission that blamed the wrong thing.** Two causes reach "a second column was asked for and not drawn"
  — a tabular panel the engine cannot draw, and any panel given no figures — and one reason was written for
  both, citing (e)(6)(ii)'s unbuilt tabular display at a vertical panel that simply had no amounts in it. An
  omission exists to explain itself, so the wrong explanation is worse than a vague one.
- **The (e)(2) finding said "first column only" about a nutrient declared only in the second.** It counted
  value cells per row and never asked which column the survivor was in, pointing the reader at the one column
  that did carry the figure. The column edges are read off the headings, which are anchored at them.
- **A comment that had been repeated without being checked.** `nutritionPanel.ts` recorded that a dual panel
  with no second amounts is "exactly what the rail's checkbox produces, since it seeds headings and has no
  field for the figures". The rail has had a box per nutrient since the displays were made reachable from the
  editor. The state is reachable for a duller reason — the boxes start empty — and the wrong reason had been
  copied into four further places before anyone looked at the rail. Corrected at all five.

### Added

Phase 6, stage 2a — a browser, at last.

- **Playwright, against the built artifact rather than the dev server.** Six phases of this project have been
  verified entirely in jsdom, which has no layout engine: it cannot say whether an element is visible, what it
  measures, or whether two things overlap. "Preview == print" has therefore held by construction and by
  assertion without anyone having looked. Scoped as `docs/DESIGN.md` scopes it — critical paths, not a suite —
  because a browser test is flaky in proportion to how much of it there is.
- **The Content-Security-Policy question is answered.** `apps/api` mounts helmet at its defaults, and until
  stage 1 it served only JSON, so no browser had ever run a page under that policy. It runs clean: no
  violations, no console errors, no failed requests, and the stylesheet is applied rather than merely served.
  Confirmed to be a real check by adding an inline script to `index.html` and watching it fail with
  `script-src-elem blocked inline`.
- **The dual-column nutrition panel has been looked at.** It draws its two column headings side by side, which
  is the thing jsdom could never confirm — two headings at the same x are one heading on top of another, and
  every resolved-layout assertion passes either way.
- **`e2e/` is type-checked**, which it was not. `npm run typecheck` walks the workspaces and the browser tests
  sit outside all of them, so a type error there would have surfaced only when Playwright ran. It found one
  immediately, in the CSP collector.
- **The CSP collector asserts its own binding.** Had `exposeFunction` failed to bind, it would have reported
  zero violations forever and the assertion would have passed by finding nothing rather than by there being
  nothing — a harness certifying what it never checked, which is the same defect as a rule doing it.

### Fixed

- **A browser test that claimed more than it checked.** `draws the second column beside the first` measured
  the two *headings* and passed on a panel that has no second column of values at all — the rail's checkbox
  seeds headings and has no field for the figures. Renamed to what it checks, and joined by one that asserts
  the engine reports the column as undrawn. A test certifying content that was never drawn is this project's
  signature defect wearing a different hat.

### Removed

- **`cors()`, which was answering every request with `Access-Control-Allow-Origin: *`.** Nothing here makes a
  cross-origin request: Vite proxies `/api` and `/health` in development, and in production this server *is*
  the origin because it serves the client. The wildcard solved a problem neither mode has, and invited any
  page on the internet to call this API from a visitor's browser. It cost little on a stateless endpoint that
  takes JSON and returns a PDF — it stops being cheap at saved labels, which put user data behind these
  routes, and at the vision endpoint, which spends money per call behind a key. Found by a security pass
  before stage 2; closing it now was one line, and closing it after either of those would have been a
  migration. `cors` and `@types/cors` are gone from `apps/api` with it.

### Security

- **`qs` 6.15.3 → 6.16.0 and `morgan` → 1.12.1**, the two advisories reachable from production dependencies
  (a `qs` array-limit bypass and a denial of service via an attacker-controlled `isBuffer`). Both arrive
  through `express@5.2.1`. The three that remain are dev-only — `vitest`, `@vitest/mocker` and `esbuild` —
  and are recorded in `docs/BACKLOG.md` rather than fixed by forcing a test-runner major inside a security
  change.
- A pass over the repository found **no secret ever committed**: no `.env` or key-shaped file in any of the 46
  commits, and no `sk-ant-`, `AKIA`, `mongodb+srv://…@`, `ghp_` or PEM block anywhere in the history. The
  browser bundle carries no secret either, which is one of phase 8's done-when items confirmed early.
- The static handler stage 1 added was checked against the obvious ways to escape it. `server.js`, its source
  map and the vendored TTFs all sit outside the served root and 404; `../`, percent-encoded `%2e%2e%2f` and
  `....//` traversal all 404; and no source map is emitted into the served directory.

### Added

Phase 6, stage 1 — one artifact, verified by running it.

- **`apps/api` serves `apps/web`'s build.** `npm run build` now produces a single deployable thing: the
  client is copied into `apps/api/dist/public` and the server serves it from the same origin as the API it
  calls. This is the one assumption phase 8's deployment rests on — one ECS service rather than two — and
  confirming it locally cost nothing, where discovering it on a first deploy would not have.
- **The copy happens after tsup, not before.** `clean: true` empties `dist/` when tsup starts, so a client
  copied in earlier is deleted by the build that was meant to ship it. `publicDir` takes a single path and
  the fonts already have it, so the client travels by `onSuccess` instead.
- **The static root is resolved from a candidate list**, the same shape as `renderPdf.ts`'s `resolveFontDir`
  and for the same reason: one relative path cannot serve both the source tree and the bundle. Resolving
  `../../web/dist` at runtime would work from a checkout and find nothing in a container shipping `dist/`
  alone. `undefined` is an ordinary answer — the API is a working JSON server without a client in front of
  it, which is what `npm run dev` serves while Vite proxies across.
- **`createApp` takes the client root rather than finding it.** Resolving inside would make every route test
  depend on whether `apps/web/dist` happened to exist: `GET /nope` would 404 as JSON on a clean checkout and
  return the client after a build. `server.ts` decides, tests state it, and `verify-build.sh` exercises the
  real resolution against the real artifact.
- **The history fallback declines three things.** `createWebHistory` makes a deep link a real navigation, so
  `/rules` has to return the client — but not `/api/labels/nope`, which needs its JSON 404 rather than a page
  of HTML carrying a 200; not a non-GET; and not a path whose last segment has a dot, because answering a
  missing asset with `index.html` turns a broken reference into a page that half-loads and reports nothing.
- **What it declines is matched by path segment, not by string prefix**, which the first cut got wrong in
  both directions at once: `startsWith('/api/')` missed bare `/api`, so the path most likely to be typed by
  hand came back as the client with a 200 on it, while `startsWith('/health')` would have swallowed any later
  client route beginning with those letters and 404'd `/health-report` instead of serving the page.
- **Fingerprinted assets are cached for a year and immutably; the entry point is not.** Vite changes the
  filename whenever the bytes change, which is the whole point of content hashing and is what makes the long
  cache safe — serving them at the default `max-age=0` spends a revalidation round trip per asset per load to
  be told nothing changed. `index.html` names the current bundles, so a stale copy would pin a browser to a
  deployment that no longer exists.
- **`verify:build` builds the repository root**, not the api workspace alone — which verified a bundle whose
  client was whatever an earlier run had left behind, or nothing at all. It now also asserts that `/`, two
  deep links and the client's own hashed bundle come back, and that the API still 404s as JSON. CI already
  runs this step, so the single-artifact assumption is checked on every pull request from here on.

Phase 5, stage 6 (in progress) — the dual-column display, drawn and judged.

- **`us-food/dual-column-form` — 101.9(e).** Three of its four requirements are geometry and were
  unmeasurable until the display was drawn: (e)'s "equal prominence **shall** be given to both sets of
  values", (e)(1)'s column headings, and (e)(3)'s vertical lines between the columns. It says nothing about
  *whether* to carry two columns — (e) opens "Nutrition information **may** be presented", and only the
  (b)(12)(i) rule is entitled to demand one.
- Equal prominence is measured as **type size, not horizontal extent**. "Sodium 0mg 0%" and "Sodium 1,250mg
  54%" are different widths and equally prominent; a rule comparing column widths would report the arithmetic.
- (e)(1)'s headings are checked for presence **and distinctness**. Two columns both headed "Per serving" pass
  a presence check and still leave a reader unable to tell the package figure from the serving one. Whether a
  heading *accurately* describes what its column declares is a question about the food, and the passing
  finding says so rather than implying a check that did not happen.
- **(e)(4) is deliberately not checked here.** It puts the vitamins and minerals in the order Vitamin D,
  calcium, iron, potassium, which `us-food/nutrition-order` already measures over the whole panel under
  101.9(c). Two rules reporting one defect under two citations is the mistake the net-quantity family was
  untangled to avoid. (e)(4) and (e)(6)(i) also differ by one parenthetical — "(except sodium)" — which
  changes nothing about the order, recorded because a later reader will wonder.

- **The displays are reachable from the editor at last.** `format`, the surface area (j)(13) measures, the
  continuous vertical space (d)(11)(iii) turns on, the two declared facts no artwork can show, and the second
  column with its basis and headings all had no control in the rail — so the tabular and linear displays
  committed earlier in this stage could not be selected, and `us-food/nutrition-format` was a rule nobody
  could provoke from the app it ships in. Four tests now drive the entitlement and the dual column through
  the real editor rather than through a constructed document.

### Fixed

- **No rule read the omissions, so the fix below only ever landed in half the engine.** The entry that
  follows records the net quantity at x −57.5 mm being given an omission; what it did not do was make
  anything read it. All 34 rules ignored `layout.omissions` entirely — the only mention of it anywhere in
  `rules/` was `gtinCheckDigit.ts` borrowing an element id — so the same 1800 mm carton on 120 mm stock still
  came back with **eighteen findings and every one of them a pass**, five of them the net-quantity rules
  certifying a declaration more than half of which is off the label. `runRules` now withholds any pass for an
  element the engine recorded as not printed. The violations are untouched, for the reason `quietZone.ts`
  records at length: an earlier fix there skipped the uncertifiable element outright and manufactured a
  second false clearance out of the first.
- **`elementId` was saying where to look and being read as what was judged.** The first version of that guard
  keyed on `elementId` alone and deleted two entitlements — 101.9(b)(12)(i)(C)'s exemption and
  (j)(13)(ii)(A)'s format permission — both of which point at the nutrition panel so the canvas can highlight
  it, and neither of which says anything about what printed. A food excused from carrying a second column is
  excused whether or not its panel fit on the stock. `Finding.certifies` now names the difference, defaulting
  to `artwork`, because a wrong guess in that direction withholds a pass that was earned where the other way
  round certifies ink that was never laid down.
- **The statement of identity was the one mandatory element that could leave the substrate in silence.** It is
  drawn by its own loop rather than through `stackText`, so it never inherited that helper's bounds check —
  the check whose own comment records phase 4 shipping this exact hole for the GHS product identifier. A
  59-character identity on an 18 mm label ran off the bottom, recorded nothing, and `us-food/statement-of-
  identity` read the document and cleared it.
- **A declined check now reads as declined.** Withholding a pass silently would have been the wrong half of
  the fix: the rail would show five fewer passes for the same label, which is indistinguishable from five
  checks nobody wrote. The "Cannot be checked" block already existed for symbols no rule judges, and now
  carries the engine's omissions beside them.
- **The net quantity was the only drawn element with no overflow check.** 101.7(i) sizes the declaration from
  the *package*, not from the label, so a container far larger than the artwork derives type wider than the
  substrate: a 1800 mm carton on the default 120 mm stock put it at x −57.5 mm, entirely off the label, with
  no omission recorded and all five net-quantity rules reporting it compliant. A mandatory 101.7(a) element
  absent from the printed artefact and clean in the findings is the hole every other block here already
  plugs.
- **A second column was marked drawn on the strength of the declaration.** The element that tells a rule the
  panel carries two sets of values was emitted whenever `columns.mode` was `dual`, while the comment beside
  it said "emitted whenever a second set of values was drawn". So a panel declaring two columns with no
  figures in the second — which is exactly what the editor's own checkbox produced, since it seeds headings
  and had no field for the amounts — drew one column, cleared the form rule, and suppressed the engine's
  "asked for and not drawn" omission, because that omission keys off the same element. The rail now has a
  field per nutrient for the second column, and there is no button to derive them: multiplying by the
  servings per container is arithmetic this tool has no business doing, and (c) rounds each declared amount
  in its own right.
- **Four fields were stripped silently at the API boundary.** `secondAmounts`, `separated`,
  `secondColumnTypeScale` and the dual-column duty facts were missing from the schema, and Zod strips unknown
  keys rather than rejecting them — so a document previewed with a populated second column in the browser
  exported a blank one. Adding them to the schema was half the fix: the reconciliation below it rebuilds the
  object key by key, so a field present in the schema and absent there is dropped just as quietly. The test
  asserts on the exported artefact rather than on the status code.
- `dualColumnForm` spelled `'food-nutrition-row-'` as a literal where every sibling imports
  `NUTRITION_ROW_PREFIX`. A rename would have emptied its row set, and the `length > 0` guard would have
  turned the equal-prominence check into a silent pass rather than an error.
- **A denylist that had to be maintained in step with another file, and was wrong three times.** The 101.2(c)
  rule excludes the Nutrition Facts panel from the 1/16 inch information-panel floor, for the reason its own
  note gives at length: 101.9 sets 8 point nutrient rows whose lowercase "o" is 1.52 mm, so applying the floor
  would report every compliant nutrition label in the country. It did that by listing the panel's element ids
  one by one — so splitting the Calories numeral off its word put the numeral outside the exclusion, and
  adding (e)(1)'s column headings put those outside it too, each reported under a citation saying nothing
  about them. It excludes the panel by prefix now, which is what the note said all along.
- **A rule certified a column the engine never drew.** `us-food/dual-column-required` read `columns.mode` off
  the document and reported `FDA_DUAL_COLUMN_MET` on a tabular panel, which draws a single column — the exact
  failure `layout/types.ts` records learning the hard way with the GHS pictograms, where a rule must not
  clear a symbol that was never printed. It reads the resolved layout now, which is the standing convention
  and which makes it right for any display that fails to draw the column rather than for this one only.
- A second column asked for and not drawn is now **recorded as a `LayoutOmission`** rather than passing in
  silence. 101.9(e)(6)(ii)'s dual-column tabular display has its type row and its display id wired and its
  drawing is in `BACKLOG.md`; without the omission the label looked finished and the finding said the column
  was missing without anything saying why. Every GHS label omits its pictogram glyphs and says so; this is
  the same admission.
- `separated` and `secondColumnTypeScale` exist so the panel can be drawn **wrong**, which is why `typeScale`
  exists too: the vertical lines and equal prominence are requirements, so a panel that always satisfies them
  complies by construction and the rules checking them could never fail. Both are also the realistic defects —
  lines dropped to save width on a crowded panel, and the package column set smaller than the serving one so
  a reader skips it.
- Emitting the second column's element inside the same branch as its vertical lines made a panel drawn
  without the lines look like a panel with one column: the mandate rule reported the column missing and the
  form rule that should have reported the lines declined. Two questions, two conditions.

### Added

Phase 5, stage 6 (in progress) — the dual-column display, drawn.

- **(e)(3) puts the weight *in* the column, beside the percentage.** "The quantitative information by weight
  and the percent Daily Value **shall** be presented in two columns and the columns **shall** be separated by
  vertical lines." So the weight comes off the nutrient name, where the single-column display carries it, and
  the row reads `Total Fat | 3g 4% | 8g 10%`. This is not the one-column row with a figure appended.
- **The second column's amounts are declared, never derived.** Multiplying the serving figures by the servings
  per container is the obvious arithmetic and exactly the kind this engine refuses on a labeller's behalf, for
  the reason the SI net quantity is typed rather than converted. Rounding under (c) also applies to each
  declared amount in its own right rather than to a product of two, which a derived column would get wrong at
  every half-gram boundary.
- (e)(1)'s column headings — "two or more column headings accurately describing the amount per serving size" —
  are printed as given. "Per 1/4 cup mix" and "Per prepared portion" are the regulation's own examples, so
  their wording is the labeller's and nothing here composes it.
- **The panel takes the information panel's width rather than 2.5 inches.** No paragraph sets a panel width at
  all; 2.5 inches is the illustrations' figure for a panel carrying *one* column of values. A second column
  has to come from somewhere, and taking it out of the nutrient names is how the tabular display once ended up
  stacked into the single column it exists to avoid.

Phase 5, stage 6 (in progress) — the first rule here that reports a label for **not** using a display.

- **`us-food/dual-column-required` — 21 CFR 101.9(b)(12)(i) and (b)(2)(i)(D).** Every format rule so far is
  deliberately careful never to demand a display, because (j)(13)(ii) opens "may modify the requirements" and
  101.9(e) opens "Nutrition information **may** be presented for two or more forms". These two are the other
  kind: a package "packaged and sold individually" holding 200–300% of its reference amount "**must** provide
  an additional column", and where a *unit* weighs the same the manufacturer "**shall** provide" one. A rule
  silent about those clears a label the regulation does not.
- **The band is inclusive at both ends** — "at least 200 percent and up to and including 300 percent" — so
  200.0 and 300.0 are inside it. Two exclusive comparisons would have cleared the two labels sitting exactly
  on the boundaries.
- **It fires only on facts the label has asserted.** The trigger is a percentage of "the applicable reference
  amount" from §101.12(b), a table of roughly 140 food categories that this project does not carry, so the
  figure is declared on the label and the rule declines entirely without it. Reporting a missing column
  against an inferred reference amount would be a demand the user cannot check resting on a number the engine
  invented.
- **All three exemptions are implemented, and they are load-bearing.** (b)(2)(i)(D) closes with "The
  exemptions in paragraphs (b)(12)(i)(A), (B), and (C) of this section apply to this provision", so one set
  serves both. (A) turns on **entitlement** — "products that **meet the requirements to use** the tabular
  format", not products that use it — so any package small enough for the reduced displays is excused
  whatever display it carries, which is a large share of those that would otherwise qualify. (C) is
  **conjunctive**: it excuses a product that has the named property *and already provides* a second column
  under (e), so most of it falls out of the declared basis rather than needing to be asserted. Each exemption
  reports as a pass naming the paragraph that granted it, because a rule that declines invisibly cannot be
  told from one that is broken — and each has a test on a label that would otherwise be reported.

Phase 5, stage 6 (in progress) — the columns axis, which dual-column needs before it can be drawn.

- **The panel has two axes, not one list of variants.** `format` says how the information is *arranged* —
  standard vertical, tabular, linear — and the new `columns` says how many sets of values it *carries*. They
  are separate because the regulation draws labels that combine them: 101.9(e)(6)(ii) is "the provisions of
  (b)(2)(i)(D) and (b)(12)(i) ... **for labels that use the tabular display**", a dual-column tabular panel,
  with (e)(6)(i) showing the vertical one beside it. A fourth member of `NUTRITION_FORMATS` would make both
  inexpressible — and (d)(1)(iii) names (e)(6)(ii) separately from (d)(11), so the engine has to tell them
  apart. `aggregate` will extend this same union when (d)(13) is built.
- **`DUAL_COLUMN_BASES` carries what the second column counts, and the modality differs across it.** Four are
  permissions under (e) — as prepared, common combinations, different units, RDI groups — and two are
  mandates: (b)(12)(i)'s per-container and (b)(2)(i)(D)'s per-unit. Keeping the basis rather than a boolean is
  also what will make (b)(12)(i)(C)'s exemptions computable, since that carve-out excuses a product already
  providing a second column for one of the other reasons.
- `nutritionDisplayFor` takes the panel itself now, structurally, rather than an object each caller builds by
  hand. The renderer and the type-size rule had begun spelling the same mapping twice — and a mutation
  proved it: severing the new axis in the renderer failed no test, because nothing observed the difference.
- **The panel-box epilogue is one helper instead of three copies**, done before a fourth display lands on it.
  The three had already drifted: the linear branch pushed the panel element where the other two unshifted it,
  so a linear label listed the panel in the middle of the reading order `LabelTextView` renders rather than at
  its head.
- `docs/BACKLOG.md` — findings that are real and deliberately not being done, with the reason. Reviews on
  this branch have each turned up three to five genuine defects in already-committed territory, and fixing all
  of them immediately turned four planned items into three unplanned commits. The aggregate display, the
  bilingual one and the permitted abbreviations are recorded there too, deferred so phase 5 can reach `dev`.

Phase 5, stage 6 (in progress) — three rules for three things the engine drew and nothing checked, found by
asking why the API was rejecting documents the engine is built to draw.

- **`us-food/statement-of-identity` — 21 CFR 101.3(a).** "The principal display panel of a food in package
  form **shall** bear as one of its principal features a statement of the identity of the commodity." No
  exception is stated anywhere in the section. It was the one mandatory element of a US food label this engine
  drew and no rule examined: a blank reached the renderer, which drew no primitive for it, and every rule
  reported a clean label. Only (a) is checked. (b)'s "common or usual name" is a question about 21 CFR part
  102 and about usage rather than about a label; (d)'s "bold type" is satisfied by construction, so a rule for
  it could never fail; (d)'s "size reasonably related to the most prominent printed matter" states no
  measurable standard; and its "lines generally parallel to the base" is the clause `netQuantityPlacement`
  already declines for the identical wording in 101.7(f).
- **`FDA_INGREDIENT_NAME_MISSING` — 21 CFR 101.4(a)(1).** The paragraph does not merely require a list:
  ingredients "**shall** be listed by **common or usual name** in descending order of predominance by weight".
  An entry with no name is not one, and the engine draws it — "INGREDIENTS: whole grain rolled oats, sugar,
  salt, ." — which is the shape the rail's removal handler already carries a comment about.
- **`us-food/serving-size` — 21 CFR 101.9(d)(3)(ii).** "Information on servings per container and serving size
  **shall** immediately follow the heading ... Such information **shall** include ... (ii) 'Serving size'".
  **Only one of the two is unconditional**, and that asymmetry is why they are not checked as one requirement:
  (d)(3)(i) excuses the servings count "on single serving containers as defined in paragraph (b)(6) ... or on
  other food containers when this information is stated in the net quantity of contents declaration", while
  (ii) states no exception at all. The rule checks that a serving size is *declared* and not that it is the
  right one — the amount comes from the reference amount in §101.12(b), a table this project does not carry,
  and the passing finding says so rather than implying a check that did not happen.

### Fixed

Phase 5, stage 6.

- **Five `min(1)`s in the API were deciding regulatory questions.** `statementOfIdentity`, `netQuantity.
  inchPound`, `ingredients[].name`, `responsibleFirm.name` and `nutritionFacts.servingSize` were all
  `z.string().min(1)`, so the export route rejected label documents the engine exists to draw and the rules to
  report. It was reachable from the editor: "Add an ingredient" writes `{ name: '', percentByWeight: 0 }`, so
  clicking it turned Export into a raw-JSON 400 — a compliance finding delivered as a schema error, in the one
  place a user cannot see a citation.
  **The order of the fix was the whole of it.** Of the five, only two were reported by any rule; a blank
  statement of identity, ingredient name or serving size was reported by *nothing*. Relaxing them first would
  have traded a visible 400 for a silent pass, which is much the worse failure, so the three rules above came
  first and the schema was relaxed after. The GS1 and GHS `min(1)`s stay: a blank `DigitalLink.domain` or
  `Artwork.text` is a malformed request rather than a non-compliant label, and the schema is the right place
  for those.
- **A food-source word inside one allergen's ingredient name cleared a different allergen.**
  §403(w)(1)(B)(ii) excuses the parenthetical where "the name of the food source ... appears elsewhere in
  the ingredient list", except where that appearance is "part of the name of a food ingredient that is **not**
  a major food allergen". `declaresSource` struck out the names of ingredients bearing *no* allergen and left
  every other name standing — so `coconut milk`, which carries tree nuts, stayed in the searched text and the
  word "milk" inside it discharged the **dairy** declaration of an undeclared `whey` beside it. The label came
  back with no findings at all. The function's own note names coconut milk as the example it handles, and
  handled it the other way round.
  The search runs once per allergen, so the test is now "is this ingredient *this* allergen" rather than "does
  this ingredient have an allergen at all": only names that identify the source being searched for survive,
  and a food-source word can settle only the question it belongs to. This is the most serious kind of defect
  this project can have — a false clearance on an allergen — and it had no fixture, which is why it lasted.
- **The engine's own tightest layout failed its own adjacency rule.** §403(w)(1)(A) puts the "Contains"
  statement "immediately after or [...] adjacent to the list of ingredients", and the rule allows a gap of one
  line of the list. The engine placed it with the generic 3 mm it leaves between any two blocks, so below an
  ingredient em of about 2.3 mm the gap exceeded the allowance and a conformant label reported itself
  non-adjacent — which the project's own 2 mm information-panel fixture did, alongside the type-size findings
  it was written for. These two blocks are specified as adjacent and are no longer spaced as though unrelated.
  `containsStatementGapMm` is still how a label is drawn adrift on purpose, so the rule can still fail.
- The separation rule spelled `'food-nutrition-'` as a literal where its siblings import a prefix constant.
  It has one now, `NUTRITION_ELEMENT_PREFIX`, beside `NUTRITION_ROW_PREFIX` — a rename would otherwise have
  quietly re-admitted every nutrient row as a neighbour and turned one crowding back into a finding per row,
  which is the defect that constant's own note records fixing.
- A fixture asserted its expected citation as `'21 CFR 101.9(j)'.replace('(j)', '(c)')`, which evaluates
  correctly and hides the string from grep in the one file whose purpose is asserting exact citations.
- **A permission enforced as a requirement, in the function whose own doc says not to.**
  `roundNutrientAmount`'s header reads: "Where the regulation offers a *permission* rather than a requirement
  — 'amounts less than 5 calories **may** be expressed as zero' — this returns the permitted value, because
  that is what a label that takes the permission declares **and a rule has to accept both**." No rule accepted
  both. `us-food/nutrition-rounding` compared `declared === required` against the single value the function
  returns, so an analysed 3 calories declared as the 5 that 101.9(c)(1)'s main clause gives — "expressed to
  the nearest 5-calorie increment" — was reported as a violation against a lawful label. `roundNutrientAmount`
  has to pick one number because the renderer has to draw one; the rule does not, and now compares against
  `permittedNutrientAmounts`. The divergence is only across `[2.5, 5)` — below 2.5 the nearest 5-calorie
  increment is already zero — which is why obvious test values never showed it. No other nutrient needs it:
  fat's floor says *shall*, sodium's states the zero as part of the declaration, and the gram nutrients round
  to zero and permit zero at the same threshold.
- **Clearing an optional number in the rail wrote an empty string into the document.** `v-model.number` runs
  Vue's `looseToNumber`, which returns the *string* when `parseFloat` gives NaN, so emptying "Servings per
  container" put `''` where a number goes — drawing " servings per container" with a hole in it and making
  Export return the same raw 400 this stage set out to remove, by a different route. `typeScale` had carried a
  guard since the panel was once drawn at zero-size type; the other two optional numbers had not. The
  container and stock dimensions are deliberately left out: they are required, a blank has no defined meaning
  there, and deciding what one should do is a different question.
- The barrel test could only check the modules it listed, so a rule module left out of the table was unguarded
  *because* it was missing — which is how `usFood/statementOfIdentity.ts` shipped outside an invariant every
  other rule module sits inside. It is driven from the registries now, so a rule cannot be registered without
  being covered.
- Three tests indexed into `US_FOOD_FIXTURES` **positionally**, so adding a fixture at the front of the list
  silently repointed them at a different label — two failed loudly and one went on asserting the wrong thing
  about the wrong document. They look fixtures up by name now. A fixture's name is its identity; its position
  is not.

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
- **Declining was the right answer to the wrong question.** With it, *nothing* measured any type size on the
  linear display: a panel at `typeScale: 0.05` — 0.4 point type — came back with ten passes and no violation.
  The premise underneath was the defect. The linear display is **named in every one of the exceptions**:
  (d)(3)(i) and (ii) put both servings lines at 9 point "in ... the linear display for small packages as shown
  in paragraph (j)(13)(ii)(A)(2)", (d)(1)(iii) puts the Calories word at 10 and its numeral at 14 in the same
  sentence, and (d)(7)(iii) puts the nutrients at 8. One run at one size cannot satisfy four different
  minimums, so the display was being drawn non-compliant by default — its Calories numeral set at 8 point
  where the paragraph requires 14 — and the rule that would have said so had been taught to look away. The run
  is a flow of spans now, each set at its own minimum and carrying its own id, which is what makes the drawing
  right and the check possible at once. The same 0.4 point panel reports five violations under five
  paragraphs.
- **The heading had been borrowing a figure that stopped being the largest.** (d)(2) asks for "no smaller than
  all other print size in the nutrition label except for the numerical information for 'Calories'" — a
  relative requirement the engine satisfies by construction, which the type-size rule therefore declines to
  check. It took the serving-size figure, true only while every part was one size; with the Calories word at
  10 and serving size at 9 it would have been the smaller of the two. It is computed from the spans now, so
  "by construction" is something the code does rather than something a comment claims.
- Each nutrient in the linear run also gets an element of its own, so a finding about Sodium outlines the
  words that say Sodium. The whole run was one `nutritionPanel` before, which is the shape that once had a
  finding about Iron outlining the entire label.
- **The abbreviated footnote was printed on every tabular display, and the comment above it reasoned its way
  there backwards.** 101.9(j)(13)(i) relieves "foods in packages **subject to requirements of paragraphs
  (j)(13)(ii)(A)(1) and (2)**" of the (d)(9) footnote and lets them use "% DV = % Daily Value" instead. Two
  named paragraphs again. The comment read "(d)(11)'s tabular display is not one of them, so it keeps the
  abbreviated statement rather than nothing" — but not being one of them is exactly what makes the full
  footnote due. (d)(11) is a set of space accommodations; it permits the arrangement and relieves nothing.
  Nothing caught it because no rule checks the footnote at all.
- **Two `shall`s the tabular display was not drawing.** (d)(4) requires the subheading "Amount per serving"
  and states one exception — "the dual column formats shown in paragraphs (e)(5), (e)(6)(i), and (e)(6)(ii)"
  — which no tabular display is. (d)(6) requires the "% Daily Value" column heading and states no exception at
  all. The display drew neither.
- **The rail told the user a percentage the panel would not print.** 101.9(d)(7)(ii) lets protein's percentage
  be omitted and sends it to (c)(7)(ii), where the amount is corrected by a digestibility score no label
  carries, so the renderer omits it — and the editor's "what the panel will print" column, which spelled the
  same rule separately and missed that branch, showed Protein at 10% beside a panel showing none. The decision
  is one exported function now, `printedPercentDailyValue`, which both the renderer and the rail call.
- A mutation escaped: putting the tabular Calories numeral back to 22 point left the suite green, because
  nothing tested the tabular column of the minimums table at all. It is pinned now, along with the property
  that every reduced figure is lower than its vertical counterpart and none is higher.

- **The entry above has its premise backwards, and the table it pinned was wrong.** 22 point *is* what
  (d)(11)'s tabular display requires; the mutation that escaped was the correct figure, and pinning 14 in
  place fixed the test and not the defect. The minimums table was keyed on the base display — vertical,
  tabular, linear — while **every exception in (d)(1)(iii) and (d)(3) is keyed on a paragraph**, and the four
  exceptions name four different sets of them. The Calories word drops to 10 point in the displays "shown in
  paragraphs (d)(11), (e)(6)(ii), and (j)(13)(ii)(A)(1)" and the linear one; the numeral drops to 14 only "for
  the tabular display for small packages as shown in paragraph (j)(13)(ii)(A)(1)" and the linear display;
  (d)(3)(i)'s servings statement drops to 9 on that same small-package pair alone; and (d)(3)(ii)'s "Serving
  size" drops to 9 on all four. No two of the figures move together, and only "Serving size" and the Calories
  word share a list. One `tabular` row cannot satisfy four lists that disagree, and the one that tried put a
  14 point numeral and a 9 point servings statement on (d)(11)'s display, where the regulation requires 22 and
  10 — drawn that way by the renderer and unreportable by the rule, wrong in both directions at once. The
  table is now keyed on the paragraph that illustrates each display, which is the axis the exceptions are
  written on.
- **The Calories numeral was never measured at all.** It shared the word's element id, and the rule takes the
  smallest primitive under an id, so the word's 16 point always won and an undersized numeral beside a correct
  word could not be seen — the 22 point minimum had no check behind it in any display. It is drawn under its
  own id now and measured separately, while a finding about it still outlines the Calories row a reader can
  point at rather than a bare numeral.
- **The tabular display drew "Calories" and its numeral as one string at one size**, which is the conflation
  that hid the paragraph split: (d)(1)(iii) gives the word and the numeral separate minimums, so a single run
  at a single size cannot satisfy both and misdraws the line besides. They are two primitives on one baseline,
  the taller setting the leading.
- This is the fourth defect in phase 5 of one kind — a figure enforced without reading what it was attached to
  — so the kind is now written down in `CLAUDE.md` rather than rediscovered a fifth time.
- **The tabular display drew its nutrients off the label and reported them present.** The columns were placed
  from the right-hand edge of the serving block unconditionally. On a 60 mm label whose block took 42 of them
  the remaining width was negative, the column count clamped to one, and all fourteen rows were drawn from
  x 42 rightward — past the panel and past the substrate — while `us-food/nutrition-completeness` reported
  `FDA_NUTRITION_COMPLETE`. The nutrients now go beneath the serving block where there is not room for a
  column beside it, and the panel box grows to enclose them, which it did not when its height was measured
  from the top of a block the columns no longer start level with.
- **Overflow was only ever measured downward.** The engine checked the panel against the bottom edge of the
  label and never against the right, which is why the case above was silent rather than reported. It checks
  both now — the reduced displays are the ones wide enough to need it — and a panel that still cannot fit says
  so instead of being drawn away. The column arithmetic was also off by one column: *n* columns occupy *n*
  widths and *n−1* gutters, so the gutter belongs on both sides of the division.
- **The Calories numeral, newly given an id of its own, fell into the 101.2(c) rule.** That rule's own note
  explains at length why the Nutrition Facts panel must be excluded from the 1/16 inch information-panel floor
  — 101.9 sets 8 point rows whose lowercase "o" is 1.52 mm against a 1.59 mm floor, and applying it would
  report every compliant nutrition label in the country. The numeral was not in the exclusion set, so it was
  judged twice under two citations, and having no `ResolvedElement` it reported under a raw element id that
  highlighted nothing when clicked. Splitting an element for one rule put it in reach of another.

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
