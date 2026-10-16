# CLP precautionary statements: Annex IV Part 1 against Part 2

CLP gives each precautionary statement's English text twice: in column (2) of the selection tables of Annex IV
Part 1 (Tables 6.1 to 6.5), and in the English row of the per-language tables of Annex IV Part 2. Packwright
prints Part 2 (`packages/label-core/src/ghs/statements.ts`, `EU_CLP_PRECAUTIONARY_STATEMENTS`). The re-check of
2026-10-12 found P103 worded differently in the two parts (`docs/BACKLOG.md`, "From the re-checks of
2026-10-12"). This report compares every code, so that which wording an EU label carries can be decided once,
for all of them. It changes nothing.

**Decided 2026-10-16 (James): the engine keeps printing Part 2**, as Article 22(4) directs, and a label carrying
Part 1's wording is not to be reported, under the permission for minor textual variations quoted below. P280,
where Part 1 adds hearing protection, is disclosed in `docs/WHAT-IS-NOT-CHECKED.md`.

## Source

Regulation (EC) No 1272/2008, consolidated text of 1 July 2026 (CELEX `02008R1272-20260701`),
read on 2026-10-16 from the EU Publications Office in two of its renditions: the XHTML manifestation
(`Accept: application/xhtml+xml`) and the PDF/A-2a manifestation (cellar item
`e5781283-7bbe-11f1-bf5e-01aa75ed71a1.0006.02/DOC_1`, 1,584 pages, Annex IV Part 1 on pages 365 to 394, Part 2
from page 395). The Publications Office SPARQL endpoint, queried the same day, lists consolidations dated
2026-05-01, 2026-07-01 and 2027-01-01, so 2026-07-01 is the one in force.

What the regulation says about the two parts, read from the same text:

- Article 22(3): "The precautionary statements shall be selected in accordance with the criteria laid down in
  Part 1 of Annex IV taking into account the hazard statements and the intended or identified use or uses of
  the substance or the mixture."
- Article 22(4): "The precautionary statements shall be worded in accordance with Part 2 of Annex IV."
- Annex IV Part 2, its only paragraph: "The precautionary statements shall be taken from this part of Annex IV
  and selected in accordance with Part 1."
- Annex IV's introduction, under the marker for Commission Regulation (EU) 2019/521 ("REPLACED"): "Notwithstanding
  Article 22 the precautionary statements that appear on labels or in safety data sheets may incorporate minor
  textual variations from those set out in this Annex where these variations assist in communicating safety
  information and the safety advice is not diluted or compromised. These may include spelling variations,
  synonyms or other equivalent terms appropriate to the region where the product is supplied and used."

## Method

Two independent extractions of Annex IV from the XHTML: Python's `html.parser`, and an XSLT stylesheet run by
`xsltproc` (libxml2). Each took, from Part 1, every table row whose first cell is a P-code, with its column (2)
text; and from Part 2, every table whose header cell is a P-code, with the text of its `EN` row. Both mark the
superscript letter Part 2 uses for the degree sign, and both drop the consolidation's inline `►`/`◄` markers.
The two agree on all 129 Part 1 rows and all 128 Part 2 tables, keys and texts.

Whitespace in source formatting was collapsed to single spaces before comparing. That also folds non-breaking
spaces into spaces; the only English statement cells in Annex IV containing one are Part 1's P412 and
P410 + P412, both already listed below, so the fold hides no difference.

**Every difference below was then read in the rows themselves**, not in the extract: each Part 1 row and each
Part 2 `EN` row was rendered from the PDF rendition at 200 dpi and read by eye, and the raw XHTML line of each
was read as well. The PDF agrees with the XHTML in every case. The amending act is taken from the `▼` marker the
row sits under in the consolidation (the marker governs everything after it until the next one), which is the
most the text shows; where the marker is `▼B`, the row is the 2008 text as adopted.

Marker key: **B**, Regulation (EC) No 1272/2008 as adopted; **M4**, Commission Regulation (EU) No 487/2013;
**M12**, Commission Regulation (EU) 2016/918; **M19**, Commission Regulation (EU) 2019/521.

## Keys

The two parts list the same codes, with two exceptions:

- **P503** is in Part 1 only (Table 6.5, under M19). Part 2 has no row for it. The engine already takes it from
  Part 1, and says so in its module note.
- **One combination is keyed differently**: Part 1 writes `P370 + P380 + P375 + [P378]`; Part 2 writes
  `P370 + P380 + P375[+ P378]`. The text is the same in both:
  `In case of fire: Evacuate area. Fight fire remotely due to the risk of explosion. [Use … to extinguish].`
  The engine keys it `P370 + P380 + P375 [+ P378]`, a third spelling, which is the backlog's existing "two
  spellings of a bracketed GHS combination code".

## Codes whose texts differ: 18

Texts are verbatim, in code spans so that spacing shows. Part 2 sets the degree sign as a raised letter o; it is
written here as `^o`. "Engine" is what `statements.ts` printed when this was read; the eight `/ …` entries
described under "Checked alongside" were corrected later the same day.

### Different words: 4

**P103**, Part 1 under M19 (replaced), Part 2 under B.
- Part 1: `Read carefully and follow all instructions.`
- Part 2: `Read label before use.`
- Engine: `Read label before use.`

**P280**, Part 1 under M19 (replaced), Part 2 under B.
- Part 1: `Wear protective gloves/protective clothing/eye protection/face protection/hearing protection/…`
- Part 2: `Wear protective gloves/protective clothing/eye protection/face protection.`
- Engine: `Wear protective gloves/protective clothing/eye protection/face protection.`

**P336**, both under B, so Part 2's "Do no" is in the 2008 text itself. The engine's "Do no rub" is the
regulation's; when this was read no test pinned it, as one pins P410 + P412's "Do no expose", and
`P336 + P315` beside it reads "Do not rub". It has been pinned since the fix of 2026-10-16.
- Part 1: `Thaw frosted parts with lukewarm water. Do not rub affected area.`
- Part 2: `Thaw frosted parts with lukewarm water. Do no rub affected area.`
- Engine: `Thaw frosted parts with lukewarm water. Do no rub affected area.`

**P410 + P412**, Part 1 under M12 (replaced), Part 2 under B. The engine's "Do no expose" is already pinned by
`statements.test.ts` as the regulation's own text; it is Part 2's, and Part 1 does not share it.
- Part 1: `Protect from sunlight. Do not expose to temperatures exceeding 50 °C/122 °F.`
- Part 2: `Protect from sunlight. Do no expose to temperatures exceeding 50 ^oC/122^oF.`
- Engine: `Protect from sunlight. Do no expose to temperatures exceeding 50 °C/122°F.`

### A spelling: 1

**P301 + P312**, Part 1 under M19 (replaced), Part 2 under M12 (replaced). "CENTER" against "CENTRE", and Part 1
has no closing full stop. Part 2 is not consistent on this word itself: its P310, P311 and their combinations read
"CENTER", and its P312 and P301 + P312 read "CENTRE".
- Part 1: `IF SWALLOWED: Call a POISON CENTER/doctor/… if you feel unwell`
- Part 2: `IF SWALLOWED: Call a POISON CENTRE/doctor/… if you feel unwell.`
- Engine: `IF SWALLOWED: Call a POISON CENTRE/doctor/… if you feel unwell.`

### A choice slash: 1

**P250**, both under M12 (replaced). Part 2 has a slash before the ellipsis and Part 1 does not. Annex IV's
introduction gives the slash a meaning ("a choice has to be made between the phrases they separate"), so this is
listed apart from plain punctuation.
- Part 1: `Do not subject to grinding/shock/friction …`
- Part 2: `Do not subject to grinding/shock/friction/… .`
- Engine: `Do not subject to grinding/shock/friction/… .` (until the fix of 2026-10-16, `friction/ … .`)

### Capitalization only: 1

**P306 + P360**, both under B.
- Part 1: `IF ON CLOTHING: Rinse immediately contaminated clothing and skin with plenty of water before removing clothes.`
- Part 2: `IF ON CLOTHING: rinse immediately contaminated clothing and skin with plenty of water before removing clothes.`
- Engine: Part 2's.

### Punctuation, spacing or the degree sign only: 11

| Code | Part 1 (marker) | Part 2 (marker) | Engine |
|---|---|---|---|
| P230 | `Keep wetted with …` (M19) | `Keep wetted with…` (B) | Part 2's |
| P231 + P232 | `Handle and store contents under inert gas/…` then, as a second paragraph of the cell, `Protect from moisture.` (M12) | `Handle and store contents under inert gas/…. Protect from moisture.` (M12) | Part 2's |
| P378 | `Use … to extinguish.` (M12) | `Use… to extinguish.` (M4) | Part 2's |
| P370 + P378 | `In case of fire: Use … to extinguish.` (M12) | `In case of fire: Use… to extinguish.` (M4) | Part 2's |
| P381 | `In case of leakage, eliminate all ignition sources` (M19) | `In case of leakage, eliminate all ignition sources.` (M12) | Part 2's |
| P370 + P372 + P380 + P373 | `In case of fire: Explosion risk. Evacuate area. DO NOT fight fire when fire reaches explosives` (M12, inserted) | the same, ending `explosives.` (M12, inserted) | Part 2's |
| P401 | `Store in accordance with …` (M19) | `Store in accordance with… .` (B) | Part 2's |
| P502 | `Refer to manufacturer or supplier for information on recovery or recycling` (M12) | the same, ending `recycling.` (M12) | Part 2's |
| P411 | `Store at temperatures not exceeding … °C/… °F.` (M12) | `Store at temperatures not exceeding … ^oC/…^oF.` (B) | `Store at temperatures not exceeding … °C/…°F.` |
| P412 | `Do not expose to temperatures exceeding 50 °C/ 122 °F.` (M12) | `Do not expose to temperatures exceeding 50 ^oC/122^oF.` (B) | `Do not expose to temperatures exceeding 50 °C/122°F.` |
| P413 | `Store bulk masses greater than … kg/… lbs at temperatures not exceeding … °C/… °F.` (M12) | `Store bulk masses greater than … kg/… lbs at temperatures not exceeding … ^oC/…^oF.` (B) | `Store bulk masses greater than … kg/… lbs at temperatures not exceeding … °C/…°F.` |

**What the markers show.** In twelve of the eighteen, the Part 1 row was replaced by a later act while the Part 2
English row stayed as it was: P103, P280, P230, P401 (Part 1 by 2019/521, Part 2 the 2008 text), P301 + P312 and
P381 (Part 1 by 2019/521, Part 2 by 2016/918), P411, P412, P413 and P410 + P412 (Part 1 by 2016/918, Part 2 the
2008 text), and P378 and P370 + P378 (Part 1 by 2016/918, Part 2 by 487/2013). In the rest, both rows sit under
the same act, so that act set the two texts differently: P250, P231 + P232, P370 + P372 + P380 + P373 and P502
(2016/918), and P336 and P306 + P360 (the 2008 text).

## Checked alongside

**Nothing changed between the text the engine was read from and the text in force.** The 2025-09-01
consolidation, extracted the same way, has the same Part 1 and Part 2 keys and texts as 2026-07-01. The
2027-01-01 consolidation changes no P-statement key or text in either part either.

**When this was read, the engine matched the text in force everywhere but in two places, both outside this
question.** The first is
against Part 2; the second is P503, which the engine takes from Part 1 because Part 2 has no row for it.

- **A space after a slash, before the ellipsis, in eight entries**: P250, P301 + P310, P308 + P311, P310, P311,
  P312, P342 + P311 and P406, where the engine prints `/ …` (for example `Call a POISON CENTER/doctor/ …`) and
  Part 2 reads `/…` (`Call a POISON CENTER/doctor/…`). Both the 2025-09-01 and 2026-07-01 XHTML read `/…`. In
  the 2026-07-01 PDF, seven of the eight `EN` rows set the slash and the ellipsis together on one line with no
  space (P250, P301 + P310, P308 + P311, P311, P312, P342 + P311, P406); the eighth, P310, breaks the line after
  `doctor/`, with the ellipsis alone on the next, so its row cannot show a space either way. Read afterward, the
  2025-09-01 PDF the engine was extracted from sets the eight rows the same way, and its text layer gives `/ …`
  with a space in all eight: the space is an artifact of the PDF's text layer, not of the printed page. This report
  changed no code; the eight were corrected the same day, in a change of their own (`CHANGELOG.md`).
- **P503's spaces**, Part 1 only: the XHTML reads `Refer to manufacturer/ supplier/… for information on
  disposal/recovery/ recycling`, with a space after two of the slashes; the engine prints
  `Refer to manufacturer/supplier/… for information on disposal/recovery/recycling`. The PDF breaks the line at
  both of those slashes, so it cannot say whether a space is there. Unresolved; recorded in `docs/BACKLOG.md`.

**The module note of `statements.ts` says CLP grants no latitude in precautionary statement wording** (it
contrasts OSHA's C.2.4.7). Annex IV's introduction, quoted under "Source", permits minor textual variations,
spelling variations and synonyms where the safety advice is not diluted. No rule in `rules/` judges a printed
P-statement's wording, so no finding rests on that sentence today; it bears on how strictly any future check of
printed text should read a variation, and on the decision this report is for. The module note was corrected
the same day.
