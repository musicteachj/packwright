# Sources

Every official document Packwright was built from: the regulations, statutes and standards its rules enforce, the
guidance and rulemaking read to interpret them, and the specifications its interface and MCP server follow. Each is
listed once, at the level of the document, with the edition used and a link to the official publisher.

This is an index, not the record. The record is beside the figures: each reference table and rule in
`packages/label-core/` carries a note saying which paragraph it was built from and when that paragraph was read, in
the form "Source: 21 CFR 101.9(j)(13), read from the eCFR on 2026-09-12". The `/rules` page lists every provision
the rules cite, generated from the rule registry. `docs/WHAT-IS-NOT-CHECKED.md`
says what the tool does not judge, and `docs/CLP-P-STATEMENT-TEXTS.md` compares the two official texts of the EU
precautionary statements.

**Dates.** "Read" is the first date the project's notes record reading the document, and the latest re-read where
one is recorded. Every link below was fetched and checked against the document's own title and edition on
2026-10-17. `apps/api/src/sources.test.ts` fails if a rule cites a document this file does not list, a section of 21 CFR
Part 101 its row does not name, or a GS1 release other than the one its row names.

## United States: food

| document | edition used | read | link |
|---|---|---|---|
| **21 CFR Part 101, Food Labeling.** Cited: §§ 101.2, 101.3, 101.4, 101.5, 101.7, 101.9 and 101.100; Appendix B for the Nutrition Facts graphic | eCFR, current | 2026-09-12; re-read through 2026-10-12 | [eCFR](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101) |
| **Federal Food, Drug, and Cosmetic Act § 201(qq), 21 U.S.C. 321(qq).** The major food allergens | U.S. Code, 2023 edition; re-read in the 2024 edition, identical | 2026-09-12; re-read 2026-10-17 | [govinfo](https://www.govinfo.gov/content/pkg/USCODE-2023-title21/html/USCODE-2023-title21-chap9-subchapII-sec321.htm) |
| **Federal Food, Drug, and Cosmetic Act § 403(i) and (w), 21 U.S.C. 343(i) and (w).** When a food owes an ingredient statement; allergen declaration and the "Contains" statement | U.S. Code, 2023 edition; § 403(i) from the 2024 edition, and (w) re-read in it, identical | (w) 2026-09-12, re-read 2026-10-11 and 2026-10-17; (i) 2026-10-17 | [govinfo](https://www.govinfo.gov/content/pkg/USCODE-2023-title21/html/USCODE-2023-title21-chap9-subchapIV-sec343.htm) |
| **Fair Packaging and Labeling Act, 15 U.S.C. 1453.** The net quantity in both measurement systems | U.S. Code, 2023 edition; (a)(2) re-read in the 2024 edition | 2026-09-12; re-read 2026-10-17 | [govinfo](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap39-sec1453.htm) |

**Rulemaking and guidance**, read to interpret Part 101 and the Fair Packaging and Labeling Act. None of these is cited by a rule.

| document | why it was read | link |
|---|---|---|
| **81 FR 33742** (2016-05-27), Food Labeling: Revision of the Nutrition and Supplement Facts Labels, final rule | The preamble to the current Nutrition Facts format; searched for the bar and rule weights, which it does not give | [Federal Register](https://www.federalregister.gov/documents/2016/05/27/2016-11867/food-labeling-revision-of-the-nutrition-and-supplement-facts-labels) |
| **81 FR 34000** (2016-05-27), Food Labeling: Serving Sizes of Foods That Can Reasonably Be Consumed At One Eating Occasion; Dual-Column Labeling; …, final rule | When a package owes two Nutrition Facts columns | [Federal Register](https://www.federalregister.gov/documents/2016/05/27/2016-11865/food-labeling-serving-sizes-of-foods-that-can-reasonably-be-consumed-at-one-eating-occasion) |
| **81 FR 59129** (2016-08-29), Food Labeling; Technical Amendments | Redesignated § 101.105 as § 101.7, the net quantity section the rules cite | [Federal Register](https://www.federalregister.gov/documents/2016/08/29/2016-19925/food-labeling-technical-amendments) |
| **83 FR 65493** (2018-12-21), Food Labeling; Revision of the Nutrition and Supplement Facts Labels; Technical Amendments | Corrects errors in both 2016 rules: cross-references, paragraphs of § 101.9(c)(2) and (j)(13)(i) deleted by mistake, the order of vitamins and minerals, one type size, and the sample labels. Read for graphic specifications; it states no bar or rule weights | [Federal Register](https://www.federalregister.gov/documents/2018/12/21/2018-27431/food-labeling-revision-of-the-nutrition-and-supplement-facts-labels-technical-amendments) |
| **FDA, The New Nutrition Facts Label: Examples of Different Label Formats** (2017, "for reference only"), read 2026-09-12 | The bar and rule weights the renderer draws. It is guidance, not regulation, so no rule judges them (`docs/DESIGN.md`) | [FDA (PDF)](https://www.fda.gov/media/99151/download) |
| **NIST SP 811, Guide for the Use of the International System of Units (SI)** (2008 edition, as updated on NIST's site), read 2026-10-17 | Which units are SI, for the FPLA's "SI metric system": Tables 1, 2, 5 and 6 and § 6.2.7 (the meter, gram and liter, the square and cubic meter, the prefixes, and the liter's symbols L and l) | [NIST](https://www.nist.gov/pml/special-publication-811) |
| **NIST SP 330, The International System of Units (SI)** (2019 edition), read 2026-10-17 | The US edition of the BIPM's SI Brochure; its foreword gives "meter" and "liter" as the US spellings of "metre" and "litre" | [NIST (PDF)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.330-2019.pdf) |

## United States: workplace chemicals

| document | edition used | read | link |
|---|---|---|---|
| **29 CFR 1910.1200, Hazard Communication (OSHA).** Labels under paragraph (f); pictograms and their precedence in Appendix C | eCFR, title 29 as issued 2026-09-09, and as of 2026-10-01 | 2026-09-12; re-read 2026-10-09 to 2026-10-11, (f)(12) 2026-10-18, and (f)(12)'s heading and C.2.1.4 2026-10-27 | [eCFR](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-Z/section-1910.1200) |

## European Union: chemicals

| document | edition used | read | link |
|---|---|---|---|
| **Regulation (EC) No 1272/2008 (CLP)**, consolidated text in force: Articles 20 and 26, Annex I (label dimensions, small packaging), Annex III (hazard statements), Annex IV (precautionary statements), Annex V (pictograms) | Consolidation 02008R1272-20260701 | 2026-10-10; re-read 2026-10-16, Article 26 and Annex I 1.2.1 and 1.5 on 2026-10-18, and Article 26(1)(d), Annex I 1.5's heading and Table 1.3's capacity bands on 2026-10-27 | [EU Publications Office](http://publications.europa.eu/resource/celex/02008R1272-20260701) |
| The same regulation, the consolidation first built from | Consolidation 02008R1272-20250901 | 2026-09-11 | [EU Publications Office](http://publications.europa.eu/resource/celex/02008R1272-20250901) |
| **Commission Regulation (EU) 2016/918** and **Commission Regulation (EU) 2019/521**, which reworded precautionary statements in Annex IV | As published | 2026-10-16 | [2016/918](http://publications.europa.eu/resource/celex/32016R0918), [2019/521](http://publications.europa.eu/resource/celex/32019R0521) |
| **Regulation (EU) 2024/2865** and **Regulation (EU) 2025/2439**, the font-size table and supplier rules not yet in application, and their dates | As published | 2026-10-10 | [2024/2865](http://publications.europa.eu/resource/celex/32024R2865), [2025/2439](http://publications.europa.eu/resource/celex/32025R2439) |

EUR-Lex publishes the same texts but refuses scripted requests, so the Publications Office's addresses are the ones
the project reads and checks.

## Barcodes and GS1

| document | edition used | read | link |
|---|---|---|---|
| **GS1 General Specifications**: check digit (§ 7.9.1), human-readable interpretation (§ 4.14.2), symbol dimensions, magnification and quiet zones (§ 5.2.3, § 5.12.3.1, tables 5-11, 5-12, 5-44) | Release 26.0, ratified January 2026 | 2026-09-17; rendered pages re-read 2026-10-12; table 5-44 and its footnotes (pages 410 and 411) re-read from the rendered pages 2026-10-18 | [GS1 (PDF)](https://ref.gs1.org/standards/genspecs/) |
| **GS1 Digital Link Standard: URI Syntax**: the URI grammar (§ 4) and its character sets, and what conformance does not establish (§ 2) | Release 1.7.0, ratified August 2026 | 2026-09-17; re-read 2026-10-16 and 2026-10-17; § 2 re-read 2026-10-18 | [GS1](https://ref.gs1.org/standards/digital-link/uri-syntax/) |
| **RFC 3986, Uniform Resource Identifier (URI): Generic Syntax**: the query and fragment a Digital Link may carry | As published | 2026-10-16 and 2026-10-17 | [RFC Editor](https://www.rfc-editor.org/rfc/rfc3986) |
| **RFC 5234, Augmented BNF for Syntax Specifications: ABNF**: the notation the Digital Link grammar is written in | As published | named by the Digital Link standard | [RFC Editor](https://www.rfc-editor.org/rfc/rfc5234) |

## Safety signs

| document | edition | how it is used | link |
|---|---|---|---|
| **ANSI Z535.4, Product Safety Signs and Labels** | 2023, current | The signal words DANGER, WARNING, CAUTION and NOTICE, and so the severity scale findings are ranked on | [ANSI webstore](https://webstore.ansi.org/standards/nema/ansiz5352023-2516192) |
| **ANSI Z535.1, Safety Colors** | 2022, current | The colors those words are printed in, which the interface's severity colors follow | [ANSI webstore](https://webstore.ansi.org/standards/nema/ansiz5352022-2475871), [summary](https://www.safetysign.com/what-is-ansiz5351) |

Both are sold rather than published, and the project has not bought them. It uses only the scale's words, their
order and the names of their colors, as the summaries describe them; no rule cites either standard.

## Interface and accessibility

| document | how it is used | link |
|---|---|---|
| **Web Content Accessibility Guidelines (WCAG) 2.2**, level AA | Text contrast of 4.5:1 and non-text contrast of 3:1 (`apps/web/src/assets/theme.test.ts`), and the 24 px target size | [W3C](https://www.w3.org/TR/WCAG22/) |

## The MCP server

| document | how it is used | link |
|---|---|---|
| **Model Context Protocol specification**, revision 2026-07-28 | The protocol the server implements | [specification](https://modelcontextprotocol.io/specification/2026-07-28), [changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| **Model Context Protocol specification**, revision 2025-11-25 | The older revision Claude's clients still speak (observed 2026-10-10), which the server also answers | [specification](https://modelcontextprotocol.io/specification/2025-11-25) |
| **MCP TypeScript SDK documentation** | Serving over Express, and declaring tools | [Express](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.md), [tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.md) |
| **Claude connector documentation** | Size and time limits, no sign-in, Anthropic's address range, adding an unlisted connector | [building](https://claude.com/docs/connectors/building/index.md), [authentication](https://claude.com/docs/connectors/building/authentication.md), [unlisted](https://claude.com/docs/connectors/custom/add-unlisted.md) |

The MCP sources were read on 2026-10-10 (`docs/plans/2026-10-10-mcp.md`).

## The photo audit

| document | how it is used | link |
|---|---|---|
| **ITU-T T.81, Digital compression and coding of continuous-tone still images** (09/92), Table B.1 and B.1.1.3 | The JPEG SOI marker, X'FFD8', and the X'FF' every marker begins with: the opening a JPEG photograph must have (`apps/api/src/audit/photoSignature.ts`) | [W3C copy (PDF)](https://www.w3.org/Graphics/JPEG/itu-t81.pdf) |
| **Portable Network Graphics (PNG) Specification**, Third Edition, § 5.2 | The eight-byte PNG signature | [W3C](https://www.w3.org/TR/png-3/) |
| **Graphics Interchange Format, Version 89a**, § 17 | The GIF signature and its two versions, 87a and 89a | [W3C copy](https://www.w3.org/Graphics/GIF/spec-gif89a.txt) |
| **RFC 9649, WebP Image Format**, § 2.4 | The RIFF header: "RIFF", the file size, then "WEBP" | [RFC Editor](https://www.rfc-editor.org/rfc/rfc9649.html) |

The photo audit's sources were read and their links fetched on 2026-10-18, for fix 2 of
`docs/security-review-2026-10-18.md`.
