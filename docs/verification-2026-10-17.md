# Source verification before deployment, 2026-10-17

The last check before Phase 8 that what Packwright enforces still matches what the sources say. It has two parts.
Part 1 asks whether any source has changed since the project read it. Part 2 asks whether each citation says what
its finding claims. `docs/SOURCES.md` lists the documents; this file records what was checked against them, how,
and what was found.

The bar for acting on anything found is the one in `CLAUDE.md` until Phase 8 is deployed: a false clearance, a
citation that does not say (or cannot be shown to say) what its finding claims, a finding that reports a label for
using a permission, a crash, data loss or a security hole. Anything else is recorded here in one line and gets no
work.

## Part 1: has any source changed since it was read?

Checked on 2026-10-17 against each publisher's own record of changes, not against a copy.

| source | read by the project | checked how | result |
|---|---|---|---|
| 21 CFR Part 101, §§ 101.2, 101.3, 101.4, 101.5, 101.7, 101.9, 101.100 and Appendix B | 2026-09-12 to 2026-10-12 | eCFR versioner API, last amendment date per section | **Unchanged since read.** Latest amendments: § 101.9 on 2023-05-24, § 101.4 on 2023-03-24, § 101.100 on 2022-02-17, §§ 101.2, 101.3, 101.5 and 101.7 on 2016-12-19, Appendix B on 2018-12-21. The part's latest amendment (2025-04-28) touches no cited section. No rule amending Part 101 has been published in the Federal Register since 2025-10-01. |
| 29 CFR 1910.1200, including Appendix C | 2026-09-12 (title 29 issued 2026-09-09); re-read to 2026-10-11 | eCFR versioner API; Federal Register API for rules amending part 1910 | **Unchanged since read.** Last amended 2026-02-13 (91 FR 6760, corrections), before the first read. 91 FR 1695 (2026-01-15) moved the 2024 rule's compliance dates: substances by 2026-05-19, mixtures by 2027-11-19, with later dates for labels on containers already packaged. See the lead below. |
| FD&C Act § 201(qq) and § 403(w), 21 U.S.C. 321(qq) and 343(w) | 2026-09-12 (2023 edition); § 403(w) re-read 2026-10-11 | Section text of the 2023 and 2024 editions compared character by character; govinfo's newest-edition links; search for 2025 and 2026 amending laws | **Unchanged.** The 2024 edition, the newest govinfo publishes, is identical to the 2023 text read. No later amending law found. The allergen list's last change was sesame, by the FASTER Act of 2021. |
| Fair Packaging and Labeling Act, 15 U.S.C. 1453 | 2026-09-12 (2023 edition) | As above | **Unchanged.** 2024 edition identical; last amended in 1992. |
| Regulation (EC) No 1272/2008 (CLP) | Consolidation 2026-07-01, read 2026-10-10 and 2026-10-16 | EU Publications Office (Cellar) list of consolidations and amending acts; the 2026-07-01 and 2027-01-01 consolidations compared line by line | **In force text unchanged; a future consolidation exists.** 2026-07-01 is the consolidation in force today. A consolidation dated 2027-01-01 is already published, adding 2025/2439 and a notice withdrawing titanium dioxide's harmonized classification. It changes Articles 1, 18, 30, 45, 48 and 61, Annex II (titanium dioxide), Annex VI and Annex VIII, and only footnote numbers in Annex I. **Nothing Packwright uses changes**: Articles 20 and 26, Annex I sections 1.2.1 and 1.5, Annex III Part 1, Annex IV and Annex V are identical. The one Annex III change removes EUH211, which Packwright does not print. Commission Delegated Regulation (EU) 2025/1222, not yet in any consolidation, applies from 2027-02-01 and changes only Annex VI harmonized classifications, which Packwright does not encode: the supplier declares the classification. |
| GS1 General Specifications | Release 26.0, read 2026-09-17 and 2026-10-12 | The standard's current-release URL | **Current.** 26.0 (ratified January 2026) is the release GS1 serves. |
| GS1 Digital Link URI Syntax | Release 1.7.0, read 2026-09-17 to 2026-10-17 | The standard's page | **Current.** 1.7.0, ratified August 2026. |

**Result: no source Packwright relies on has changed since it was read, and none will change on a known date in a
part Packwright uses.**

## Part 2: does each citation say what its finding claims?

### The OSHA transition

89 FR 44144 (2024-05-20) revised § 1910.1200, and its compliance dates, as moved by 91 FR 1695, still run: a
mixture's label may follow the 2012 text until 2027-11-19. A rule judging a label against a 2024 clause the 2012
text lacked, or worded differently, would report a label for using that permission. Both texts were read from the
eCFR versioner (title 29 as of 2024-07-18, before the revision took effect, and as of 2026-10-01); the 2012 text
carries C.2.3.2 and Figure C.1 as images, read from the Federal Register's copies (ER26MR12.069 and .070), and the
current Figure C.1 likewise (ER08JA26.012).

| citation | rule | 2012 text | result |
|---|---|---|---|
| § 1910.1200(f)(12) | `ghs/small-container` | absent: added in 2024 | **Holds.** The rule judges only a label whose supplier declares they rely on the small-container provision, so a label following the 2012 text never meets it. |
| Appendix C, C.2.1 and C.2.1.1 | `ghs/pictogram-precedence`, `ghs/signal-word` | identical | **Holds.** |
| Appendix C, C.2.3.1 | `ghs/pictogram-integrity` | identical | **Holds.** |
| Appendix C, C.2.3.2 | `ghs/pictogram-integrity` | identical: "One of eight standard hazard symbols shall be used in each pictogram", Figure C.1 the same eight symbols | **Holds.** |

**The environment pictogram on a US label** (`docs/BACKLOG.md`, open since PR #71) was settled in the same reading.
`GHS_PICTOGRAM_NOT_RECOGNISED` reports GHS09 on a US label as a violation under C.2.3.2, while OSHA's pictogram
QuickCard (OSHA 3491) calls it "Environment (non-mandatory)". The backlog asked for the preambles to be read for a
permission. Neither grants one: the 2012 preamble says "Eight of these symbols were proposed for adoption in this
rulemaking, the exception being the environmental symbol" (77 FR 17700) and that aquatic toxicity was not adopted
"because OSHA does not have the regulatory authority to address environmental concerns" (77 FR 17580); the 2024
preamble does not mention it. Appendix C.3.1, the general allowance for supplementary information ("limited to when it provides further detail and does not contradict or cast doubt on the validity of the standardized hazard information"), was read too: it admits information, not pictograms, and C.2.3.2 governs every pictogram on the label, so it is no route to a ninth. OSHA's labels brief (OSHA 3636) says the environment pictogram "may be used to provide additional information", which is guidance again. No letter of interpretation was found. Both regulatory texts allow eight symbols and
show eight. The regulation governs, so the violation stands, and the QuickCard's wording is the guidance that
disagrees with it, recorded here.

### Reference tables checked by script

| table | against | result |
|---|---|---|
| EU hazard statements, `ghs/statements.ts` (70) | CLP Annex III Part 1, English rows, consolidation 2026-07-01 | **All 70 match exactly.** The one apparent difference, H351, is the consolidation's amendment marker ◄ printed after the sentence. Annex III also lists 12 combined statements (H300 + H310 and the like), which the table does not carry and the tool cannot print; recorded below. |
| EU precautionary statements, `ghs/statements.ts` | Annex IV Part 2, same consolidation | Compared character by character on 2026-10-16 (`docs/CLP-P-STATEMENT-TEXTS.md`); the consolidation is unchanged since. |
| US hazard and precautionary statements | | Empty by design: the tool prints no US statement text. |

### Every citation, read against its source

All 87 provisions the rules cite, and the reference tables behind them, were read against the primary source by four
parallel readers, each quoting the operative text verbatim. Every quote was then checked as an exact substring of an
independent copy of the source fetched for this record (whitespace and typographic quotes folded, nothing else): 290
of 290 matched. The 28 quotes from the GS1 General Specifications are table rows in a PDF and were checked by hand
where a finding rested on them. Every finding below was then verified by hand against the source and the code before
being recorded; the appendix gives each reader's verdict on every citation.

**Result.** The readers returned HOLDS for 69 of 98 items. Hand verification sorted the rest below, by the bar in `CLAUDE.md`. One defect sits in a paragraph a reader marked as holding: item 2 was found from (j)(13)(ii)(A), and the (d)(11)(iii) row holds only for what that row checked. Where the appendix and these sections differ, these sections govern.

#### Must fix before deployment

To be fixed in four pull requests, each reviewed at `high`: item 1; items 2 to 9 and 13 with decisions A and B; items 10 and 11; item 12. The second is split by area (allergens and ingredients, then the Nutrition Facts panel) if it passes the size trigger.

Each is a false clearance, a finding that reports a label for using a permission, or a citation that does not say
what its finding claims. Each was verified by hand.

| # | area | what is wrong | source | kind |
|---|---|---|---|---|
| 1 | US food, engine **(fixed: PR #103)** | The net quantity is drawn in the regular face (`layout/usFoodEngine.ts`, no `fontWeight`), on every US food label, while the five net quantity rules report it compliant. | 21 CFR 101.7(h): "shall appear in conspicuous and easily legible boldface print or type" | false clearance |
| 2 | US food | A tabular Nutrition Facts display on a package over 40 in² whose label does not state its vertical space is a violation: "a reduced display is permitted only at 40 in² or less", requiring the vertical display. | 101.9(d)(11)(iii): without "approximately 3 in" of continuous vertical space, "the nutrition label may be presented in a tabular display", at any size | permission reported; misstates the law |
| 3 | US food | An empty ingredient list is blocking, "A packaged food must list its ingredients", cited to 101.4(a)(1), on a single-ingredient food too. | FD&C § 403(i)(2): a list is required only "in case it is fabricated from two or more ingredients" (restated in 101.100(a)); 101.4(a)(1) governs how to list, not whether | citation does not say it |
| 4 | US food | Any non-blank allergen "specific type" is accepted as the food source name, so a specific type of "tree nuts" passes "Contains: tree nuts." | FD&C § 403(w)(2): for a tree nut, fish or Crustacean shellfish the name "means the name of the specific type of nut or species" | false clearance |
| 5 | US food | A vitamin or mineral under 2% of its RDI declared as 0% is reported as the wrong percentage. | 101.9(c)(8)(iii): those "may be declared by a zero" | permission reported |
| 6 | US food | The (b)(12)(i)(C) exemption from a mandatory second column is granted from the document's column settings without checking a second column was drawn; a one-column panel passes as exempt. | (C) excuses products that "provide an additional column of nutrition information under paragraph (e)" | false clearance |
| 7 | US food | The 16/10 point Calories minimum is cited to 101.9(d)(5), which states no size for it; the 8 point nutrient-row minimum is cited to "101.9(d)(7)(iii)", which does not exist. | Both figures are in 101.9(d)(1)(iii) | citation does not say it |
| 8 | US food | The exempt passes for (j)(3), (j)(9) and (j)(11)(ii) describe the exemption more broadly than the paragraph, or leave conditions off their "not checked" lists: (j)(3)'s (i) and (iii), (j)(9)'s "solely", (j)(11)'s fish-or-game scope. | 101.9(j)(3), (j)(9), (j)(11) | pass reads as having checked what it did not |
| 9 | US food | 101.2(c)'s own exemptions are not modeled: (c)(2)'s 1/32 inch for individual serving-size food-service packs and (c)(1)'s soft-drink bottles get `FDA_PANEL_TYPE_TOO_SMALL`. Serving size declared at 8 point under (d)(3)(ii)'s permission is reported against 10 point. Both narrow. | 101.2(c)(1), (c)(2); 101.9(d)(3)(ii) | permission reported |
| 10 | EU chemicals | Small packaging: the EU inner-label check leaves out the signal word, so the complete pass can clear a label without one; it gates the tie-on-tag route of 1.5.1 on 1.5.2.1's 125 ml, which 1.5.1 does not have; and at 10 ml or less it demands a supplier name and telephone that 1.5.2.4.2 does not. | CLP Annex I 1.5.1.2 (as amended by 2024/2865): "the hazard pictograms, the signal words, the product identifier … and the name and telephone number of the suppliers"; 1.5.1.1 has no capacity limit | false clearance; permission reported |
| 11 | EU chemicals | Article 26(1)(a)'s exception is not applied: beside GHS01, GHS02 is called optional for a Type B self-reactive or organic peroxide, for which Annex V makes both compulsory, so a label missing GHS02 goes unreported. | CLP Article 26(1)(a): optional "except in cases where more than one of these hazard pictograms are compulsory" | false clearance |
| 12 | GS1 | Magnification below 0.80× is a violation, though X-dimensions from 0.249 to 0.264 mm are allowed for on-demand printing; and the bar-height rule scales its minimum below X 0.264, passing a truncated bar. The second is hidden only by the first, so they are one fix. | General Specifications 26.0, table 5-44 footnotes (*) and (**), p. 411: "only applicable to on demand (e.g., thermal, laser) print processes"; "the bar height SHALL NOT be truncated below the minimum as listed" | permission reported; false clearance |
| 13 | across | Passes and citations that claim more than they established: the FPLA dual-declaration pass accepts any metric text without an SI unit; the CLP label-dimension pass says the "one fifteenth" requirement is met when at Table 1.3's own 32 mm it is not; the Digital Link pass says the link "resolves to" its URI, never tested; `FDA_NUTRIENT_MISSING` names (c)(8)(iv), the RDI table, as the mandate that is (c)(8)(ii), and "additional levels of significance" is cited to (c)(8)(ii) though it is (c)(8)(iii); the OSHA small-container rule demands a pictogram and a signal word of a classification that carries neither. | 15 U.S.C. 1453(a)(2); CLP Annex I 1.2.1.4; URI Syntax 1.7.0 § 2; 101.9(c)(8); 29 CFR 1910.1200(f)(12) | pass or citation says more than it checked |

#### Decisions, not defects

A and B were decided by James on 2026-10-17, as recorded in each row.

| # | question | what the sources say |
|---|---|---|
| A | Is "peanut butter" or "soy lecithin" in an ingredient list a declaration of peanuts or soybeans? The rule matches the statute's exact names ("peanuts", "soybeans") and reports both as undeclared. | FD&C § 403(w)(1)(B)(i) excuses a name that "uses the name of the food source"; § 321(qq)(1) names "peanuts" and "soybeans". FDA's allergen guidance (Edition 5, nonbinding) accepts "peanut", "soy" and "soya". Singular forms are arguably the same name; "soy" rests on guidance. **Decided: accept singular forms of the statute's own names ("peanut", "soybean"); "soy" and "soya" stay reported, since only nonbinding guidance accepts them.** |
| B | On a package under 12 in² that bears nutrition labeling, does 101.9(j)(13)(i)(B)'s 6 point minimum replace (d)(1)(iii)'s 8, 10, 16 and 22 point minimums, or sit beside them? | (B): "all required information shall be in type size no smaller than 6 point or all upper-case type of 1/16 inches minimum height". (d)(1)(iii) names its own small-package exceptions. FDA's linear illustration annotates "all type sizes are 6 point". If (B) replaces them, the tool reports lawful 6 point labels. **Decided: decline and disclose. On packages under 12 in², type at or above 6 point but below the usual minimum gets no verdict, and `docs/WHAT-IS-NOT-CHECKED.md` will say why; both land with the fix.** |
| C | The environment pictogram on a US label. | Settled above: the violation stands on the regulation's text. |

#### Recorded, no work

One line each, by the bar:
- The "Contains" adjacency test allows one line of the ingredient list, a project figure; the statute says "immediately after or is adjacent to" (§ 403(w)(1)(A)).
- `FDA_ALLERGEN_DECLARED_MET` can be issued where the only declaration is a "Contains" statement that `contains-statement-type` reports; the violation stands, so the label is not cleared.
- `DUAL_COLUMN_BASIS_REFERENCE['rdi-groups']` points at (e)(5), a sample label; the permission is in (e). No rule emits it.
- `GHS_PICTOGRAM_NOT_REQUIRED` cites Annex V, which assigns pictograms but forbids none; the duty is Articles 17(1)(d) and 19(1).
- Annex III lists 12 combined hazard statements (H300 + H310 and the like) that `ghs/statements.ts` does not carry, so a label cannot print them; whether CLP requires the combined form where it exists was not settled here.
- `GUARD_BAR_EXTENSION_MODULES = 5` is marked unverified; § 5.2.3.2 says guard bars "SHALL be extended downward by 5X", so it can be cited.
- The (e)(6) column-form comment in `dualColumnForm.ts` ("none of the four") sits awkwardly with the reading the rule applies; the rule holds.

## Appendix: every reader's verdict

Each row is one citation or reference table, with the reader's verdict and the first sentence of its reasoning.
Verdicts other than HOLDS were verified by hand and are sorted into the sections above; where the two differ, the
sections above govern.

| group | citation or table | agent verdict | quotes | note |
|---|---|---|---|---|
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.2(c) | SCOPE | 6 | The floor, its figure and the measured letter are the source's. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.3(a) | HOLDS | 1 | 101.3(a) is an unconditional 'shall bear' and the rule reports only absence. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.4(a)(1) | SCOPE | 1 | Order, naming and the 101.100 carve-out match (a)(1). |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.4(a)(2) | HOLDS | 3 | The closed threshold set and the 'may not be present in an amount greater than the stated threshold' condition are enforced exactly. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.5(a) | HOLDS | 1 | Absence is reported and the pass rests on a printed element that the omissions guard withholds if it ran off the stock. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.5(c) | HOLDS | 1 | Triggered only where the supplier states the firm is not the manufacturer, which is the paragraph's condition, and any non-empty phrase satisfies it, as the open-ended wording requires. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.5(d) | HOLDS | 2 | The four required parts and the directory permission are modeled exactly; |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.7(a) | HOLDS | 1 | A plain 'shall bear', reported only when absent. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.7(f) | FALSE_CLEARANCE_RISK | 3 | Figures, the separation distances and the 5 in² threshold all match (f). |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.7(i) | HOLDS | 7 | Every band, boundary and the formed-surface increment match the source, and the measured letter follows (h)(2)'s conditional basis rather than the em. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.100 | HOLDS | 2 | Cited only for an advisory that neither reports nor clears the label, and for the section-level entry in the rule's citations list. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.100(a)(1) | HOLDS | 2 | The exemption is limited to ingredients not common to all packages, and the rule still runs the list and order checks on the common ingredients, as the condition 'in conjunction with the names of such ingredients as are common to all packages' implies. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 21 CFR 101.100(a)(2) | HOLDS | 2 | Cites the paragraph that grants the exemption, and the pass states that its display condition is unverified, which is a condition no label can show. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 15 U.S.C. 1453(a)(2) | MINOR | 2 | The finding matches (a)(2) and its two named exceptions. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 15 U.S.C. 1453(a)(3)(A)(ii) | HOLDS | 2 | A permission correctly treated as one: the SI statement is not demanded and, if present, is acknowledged as permitted rather than reported. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | 15 U.S.C. 1453(a)(6) | HOLDS | 1 | The exemption's scope (foods packaged at the retail store level) is restated exactly and cited to its own paragraph. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | FD&C Act §403(w)(1) | PERMISSION_REPORTED | 5 | The substring test requires the statute's exact plural/table name, so an ingredient named 'soy lecithin' or 'peanut butter' (tagged soybeans/peanuts, no Contains statement, no parenthetical) draws FDA_ALLERGEN_NOT_DECLARED, although (B)(i) excuses an ingredien |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | FD&C Act §403(w)(1)(A) | MINOR | 1 | The type-size half matches the statute exactly. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | FD&C Act §403(w)(2) | FALSE_CLEARANCE_RISK | 1 | The three categories are right. |
| US food: §§ 101.2 to 101.100, FPLA, FD&C allergens | table: fda/allergens.ts | HOLDS | 3 | All nine names match §321(qq)(1) verbatim, including the capitalized 'Crustacean shellfish' and plural 'tree nuts', 'peanuts', 'soybeans'; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(b)(12)(i) | HOLDS | 2 | The source says 'must provide an additional column' for 'the entire package' at 'at least 200 percent and up to and including 300 percent', and the code's band is inclusive at both ends and keyed on the package sold individually. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(b)(12)(i)(A) | HOLDS | 2 | (A) turns on whether the product 'meet[s] the requirements to use' the small-package tabular or linear format, and the code computes exactly that entitlement (not the display used), floored by the drawn label and PDP area so a declared small area cannot outvot |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(b)(12)(i)(B) | HOLDS | 1 | (B) excuses raw fruits, vegetables and seafood carrying voluntary labeling or claims; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(b)(12)(i)(C) | FALSE_CLEARANCE_RISK | 3 | (C) excuses only products that 'provide an additional column of nutrition information', a condition on the printed label, but the exemption is granted from columns.mode/basis on the document and stamped passedOnDocument. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(b)(2)(i)(D) | HOLDS | 3 | The source's 'shall provide a column ... |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c) | MINOR | 4 | The order and the mandatory set match (c) and (c)(8)(ii). |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(1) | HOLDS | 1 | The code accepts both the nearest-5 value and zero below 5 calories, which is exactly the 'may be expressed as zero' permission, and rounds in 5s up to and including 50 and in 10s above. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(2) | HOLDS | 2 | The zero floor here is 'shall', unlike the gram nutrients' 'may', and the code applies it as a requirement with a single permitted value; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(2)(i) | HOLDS | 2 | Same increments and the same 'shall be expressed as zero' floor as total fat, and the code uses the same fat-grams rounding. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(2)(ii) | HOLDS | 2 | Increments and the zero floor match; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(3) | HOLDS | 3 | Nearest-5 rounding already yields 0 below 2.5 mg, so the 'may state ... |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(4) | HOLDS | 1 | All three bands match the source, including the zero below 5 mg, which is stated as the declaration itself rather than offered as a choice. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(6) | HOLDS | 2 | Nearest gram with the zero permission below 0.5 g, which coincides with the nearest-gram result, so no permitted figure is refused. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(6)(i) | HOLDS | 2 | Rounding matches. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(6)(ii) | HOLDS | 1 | Nearest gram with the same zero and 'less than 1 gram' permissions; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(6)(iii) | HOLDS | 2 | Rounding, the double indent and the 'Includes' preface all match the paragraph; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(7) | HOLDS | 2 | Rounding matches; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(7)(i) | HOLDS | 2 | The source turns the permission into 'shall be given' for a food for children 1 through 3, and the rule fires only for that declared population, never for ordinary foods, so no permission is reported. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(c)(8)(iii) | PERMISSION_REPORTED | 3 | The increments are right, but the same paragraph says amounts 'present at less than 2 percent of the RDI ... |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d) | HOLDS | 2 | In the eCFR, (d) is a bare designator with no text, so citing it as the umbrella for the type-size pass is acceptable, and the pass claims only the five sizes it measured. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(1)(iii) | UNSURE | 4 | The numeral figures and their display scope match the paragraph exactly, including keeping 22 pt on the (d)(11) and (e)(6)(ii) tabular displays. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(3)(i) | HOLDS | 2 | Figure, exception list and paragraph all match, and the rule measures only a drawn servings statement, so the single-serving exception (statement not required) is never reported. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(3)(ii) | PERMISSION_REPORTED | 3 | The missing-serving-size finding and pass hold: the paragraph says the statement 'shall immediately follow' and states no exception. |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(5) | WRONG_PARAGRAPH | 2 | (d)(5) says only that calories follow 'Amount per serving' on one line and sets 8 pt for 'Calories from saturated fat'; |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(7)(iii) | WRONG_PARAGRAPH | 3 | The current 101.9(d)(7) has only (i) and (ii); |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(7)(ii) | HOLDS | 3 | Whole-percent rounding, the either-basis permission and the protein carve-out are implemented as the paragraph words them, and only nutrients 'for which a DRV has been established' are cited here (vitamins route to (c)(8)(iii)). |
| US food: § 101.9 (b) to (d) | 21 CFR 101.9(d)(11)(iii) | HOLDS | 2 | The paragraph permits the tabular display at any package size where about 3 inches of continuous vertical space is lacking, and the pass grants exactly that, only for tabular, on a declared fact. |
| US food: § 101.9 (b) to (d) | table: packages/label-core/src/fda/nutrients.ts | HOLDS | 15 | Every Daily Value, unit and rounding increment in the table matches 21 CFR 101.9(c)(1)-(c)(9) as fetched today, including the toddler column, protein's 13 g DRV, and the shall-zero for the fats against the may-zero for the gram nutrients. |
| US food: § 101.9 (b) to (d) | table: packages/label-core/src/fda/nutritionPanel.ts and packages/label-core/src/rules/usFood/nutritionTypeSize.ts (101.9(d) type sizes) | WRONG_PARAGRAPH | 5 | Every minimum is the right number on the right display, but two of the five measured elements are cited to the wrong paragraph: the Calories word to (d)(5), which states no size, and the nutrient rows to (d)(7)(iii), which does not exist. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(e) | HOLDS | 4 | (e) says equal prominence 'shall be given to both sets of values' once dual labeling is provided; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(e)(1) | HOLDS | 2 | (e)(1) says there 'shall be two or more column headings accurately describing' each column; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(e)(2) | HOLDS | 2 | (e)(2) requires the (d)(7)(i) weight and the (d)(7)(ii) percent 'for the form of the product as packaged and for any other form', which is what a one-cell row breaks. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(e)(3) | HOLDS | 1 | (e)(3) covers all four kinds of permitted dual labeling and says the weight and %DV 'shall be presented in two columns and the columns shall be separated by vertical lines'; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(e)(6) | HOLDS | 2 | (e)(6) applies only to columns 'as required in paragraph (b)(12)(i)' or '(b)(2)(i)(D)', and the gate cites it only when the duty computes 'required', so a voluntary or excused per-container column is never pointed at (e)(6), and an undetermined one triggers a  |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j) | HOLDS | 2 | (j) is the list of exemptions and (a) makes the panel mandatory 'unless an exemption is provided for the product in paragraph (j)', which is exactly the message. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(1) | HOLDS | 2 | Both conditions of (j)(1)(i), the sales thresholds and the no-claims proviso, are named as unchecked; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(2) | HOLDS | 3 | The unchecked clause covers the five limbs and their conditions, including (v)(A)/(B). |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(3) | MINOR | 5 | (j)(3) is five conjunctive conditions plus the no-claims proviso. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(4) | HOLDS | 2 | Grant text matches 'insignificant amounts of all of the nutrients and food components'; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(8) | HOLDS | 2 | (j)(8) has exactly five 'only if' conditions, (i)-(v), and the pass names all five as unchecked; |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(9) | MINOR | 1 | The grant text drops 'solely' ('for use solely in the manufacture of other foods') and paraphrases 'at a site other than where originally processed or packed' as 'elsewhere', so it describes a slightly broader exemption than the paragraph grants. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(10) | HOLDS | 2 | Both the identity condition and the contingency are disclosed. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(11)(ii) | MINOR | 2 | (j)(11)(ii) is the right paragraph and the grant matches its words. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(16) | HOLDS | 1 | The single proviso is disclosed accurately, including the (a)(2) alternative. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(18) | HOLDS | 3 | Every condition of (j)(18) (units, FTEs, the filed notice, no nutrition information or claims) is disclosed as unchecked, and no threshold is applied, so none is misapplied. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(13)(i) | HOLDS | 1 | The figure, its strictness ('less than 12 square inches') and the thing it is attached to (total surface area available to bear labeling) all match. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(13)(i)(A) | HOLDS | 1 | (A) puts the line on 'packages that qualify for and use this exemption', and the finding fires only after qualification on area and only when the panel is absent (that is, the exemption is being used); |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(13)(ii)(A) | MINOR | 5 | The entitlement logic matches the paragraph exactly and the rule never demands a reduced display, so the permission is not turned into an obligation. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(14) | HOLDS | 1 | The tool reads (j)(14) as relocating rather than excusing the information, which matches 'where the required nutrition information is clearly presented', and it still requires the information to be declared. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(15) | HOLDS | 3 | All three conditions are accounted for: (iii) is measured on the drawn primitive (so an undrawn statement cannot pass), and (i) and (ii) are named as unchecked. |
| US food: § 101.9 (e) and (j) | 21 CFR 101.9(j)(15)(iii) | HOLDS | 2 | Wording, figure and the 'individual' permission all match; |
| US food: § 101.9 (e) and (j) | table: packages/label-core/src/fda/nutritionFormats.ts | MINOR | 12 | Checked: 12 (strict <), 40 (<=), 3 in (approximately, applied as <), the 200-300% inclusive band, the 7-entry basis-to-paragraph map, the 4 (C)-exempt bases (as-prepared, combination, rdi-groups, per-cup-popped; |
| US food: § 101.9 (e) and (j) | table: packages/label-core/src/fda/unitContainerStatement.ts | HOLDS | 2 | 'This Unit Not Labeled For Retail Sale', '...For Individual Sale' (in lieu of) and '...For Individual Retail Sale' (immediately preceding) are the only three wordings the sentence permits; |
| US food: § 101.9 (e) and (j) | table: packages/label-core/src/templates/usFood.ts (US_FOOD_NUTRITION_EXEMPTIONS and the (j) notes, lines 176-292) | HOLDS | 6 | Each of the 13 kinds maps to the paragraph that grants it: (j)(1), (2), (3), (4), (8), (9), (10), (11)(ii), (13)(i), (15), (14), (16), (18). |
| OSHA, CLP, GS1 | 29 CFR 1910.1200(f)(12) | MINOR | 7 | Threshold, comparison direction and the (A)-(E) list match (f)(12)(ii) exactly, and the rule is gated on a declaration as (f)(12)(i) requires; |
| OSHA, CLP, GS1 | 29 CFR 1910.1200, Appendix C, C.2.1 | HOLDS | 4 | Each US clause in precedence.ts matches the eCFR text: C.2.1.2 is limited to the acute-toxicity use, C.2.1.3 to skin or eye irritation, C.2.1.4 to respiratory sensitization against skin sensitization or skin or eye irritation, and GHS07 is removed only when ev |
| OSHA, CLP, GS1 | 29 CFR 1910.1200, Appendix C, C.2.1.1 | HOLDS | 1 | The finding states exactly the C.2.1.1 prohibition, under the US regime only, and the pass is an artwork pass tied to the signal-word element so the omissions guard can withhold it if the word did not print. |
| OSHA, CLP, GS1 | 29 CFR 1910.1200, Appendix C, C.2.3.1 | HOLDS | 1 | The blocking finding quotes C.2.3.1's second sentence verbatim and fires on exactly what it forbids (a frame with no symbol); |
| OSHA, CLP, GS1 | 29 CFR 1910.1200, Appendix C, C.2.3.2 | HOLDS | 2 | Figure C.1 (an image, not text, so it cannot be quoted) depicts eight symbols and the environment symbol is not among them, so a GHS09 pictogram is not "one of eight standard hazard symbols" under C.2.3.2. |
| OSHA, CLP, GS1 | 29 CFR 1910.1200, Appendix C, C.2 (decline only, not in the assigned list) | HOLDS | 1 | Used only in a stand-down; |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.2 | HOLDS | 1 | 1.2.1.2 requires the black symbol; |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.3 and Table 1.3 | MINOR | 7 | The violation thresholds match Table 1.3 exactly, the 10 mm floor equals 1.2.1.3's 1 cm2, and the first band's "If possible, at least 16 × 16" is correctly not enforced as a violation. |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.4, Table 1.3 | HOLDS | 10 | Every figure and band boundary matches Table 1.3, the inclusive "not exceeding" comparison is right, and severity follows the modal: advisory for the "If possible" band, violation for "At least". |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Annex I, 1.5 | FALSE_CLEARANCE_RISK | 8 | In the 2026-07-01 consolidation, 1.5.1.2 (amended, marked M37) now requires "the hazard pictograms, the signal words, the product identifier ... |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Annex V | MINOR | 6 | Annex V supports the factual content of every finding (which class assigns which pictogram), and the pass is correctly withheld unless every pictogram printed. |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Article 20(3) | HOLDS | 1 | The finding restates Article 20(3) exactly; |
| OSHA, CLP, GS1 | Regulation (EC) No 1272/2008 (CLP), Article 26(1) | SCOPE | 10 | Clauses (b)-(e) are encoded correctly with the right modals (mandatory vs optional), and the mandatory/optional split is respected. |
| OSHA, CLP, GS1 | GS1 General Specifications 26.0 §4.14.2 | HOLDS | 3 | The finding and pass match the SHALL sentence. |
| OSHA, CLP, GS1 | GS1 General Specifications 26.0 §5.12.3.1, table 5-44 | PERMISSION_REPORTED | 6 | The 0.80x-2.00x bounds match table 5-44 exactly. |
| OSHA, CLP, GS1 | GS1 General Specifications 26.0 §5.2.3.2 and table 5-44 | FALSE_CLEARANCE_RISK | 4 | Within 0.264-0.660 mm the proportional height reproduces every tabulated minimum exactly, and interpolating between them is a fair reading of "tied to the minimum, target and maximum X-dimension listed". |
| OSHA, CLP, GS1 | GS1 General Specifications 26.0 §5.2.3.4, table 5-11 | HOLDS | 3 | All four left/right figures match table 5-11 and table 5-44; |
| OSHA, CLP, GS1 | GS1 General Specifications 26.0 §7.9.1 | HOLDS | 3 | The implementation's right-anchored 3/1 weighting and "(10 - sum mod 10) mod 10" are exactly table 7-8's steps, and table 7-9's published example reproduces (sum 101, check digit 9). |
| OSHA, CLP, GS1 | GS1 Digital Link URI Syntax 1.7.0 §4 | MINOR | 5 | §4 is the right citation for grammar non-conformance, and the 14-digit GTIN finding rests on §4.5's "SHALL be expressed as 14 digits". |
| OSHA, CLP, GS1 | GS1 Digital Link URI Syntax 1.7.0 §4.1 | HOLDS | 3 | The message states §4.1's history exactly and draws the right conclusion; |
| OSHA, CLP, GS1 | table: packages/label-core/src/ghs/labelDimensions.ts (CLP Annex I Table 1.3; 1.2.1.3 fraction and floor) | HOLDS | 14 | 4 bands x (capacity text, max capacity, label width, label height, pictogram side, best-effort flag) plus the preferred 16 mm and the 1/15 and 100 mm2 constants all match the 2026-07-01 consolidated text, which is unchanged from the 01.09.2025 text the module  |
| OSHA, CLP, GS1 | table: packages/label-core/src/ghs/pictograms.ts (Annex V codes and symbol names; OSHA eight) | HOLDS | 9 | The nine codes GHS01-GHS09 and their symbol names (exploding bomb, flame, flame over circle, gas cylinder, corrosion, skull and crossbones, exclamation mark, health hazard, environment) match Annex V. |
| OSHA, CLP, GS1 | table: packages/label-core/src/ghs/precedence.ts (CLP Article 26(1) and OSHA C.2.1) | SCOPE | 3 | Five CLP clauses and three OSHA clauses checked for trigger, barred use and modal: (b)-(e) and C.2.1.2-C.2.1.4 are right, including OSHA's narrowing of the skull rule to acute toxicity and the absence of optional clauses for the US. |
| OSHA, CLP, GS1 | table: packages/label-core/src/geometry/symbol.ts (GS1 X-dimension, magnification, bar heights, quiet zones, symbol lengths) | HOLDS | 9 | Nominal X 0.330; |
