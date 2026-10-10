# The road to MCP and deployment

> Agreed with James on 2026-10-08. A one-page order of work, not a detailed plan: each stage is planned in
> detail when it starts, as every stage so far has been. Merging stays James's; every commit, push and PR needs
> his yes.

**Done before this:** stages 1–6 of the pre-deployment work — the app shell and `/rules` severities (#62, #63),
the seven reported entries (#64, #65), the dual-column limit (#66), the lazy barcode encoder (#67), saved labels
and the twenty-label cap (#68), and the phone scan-back steps (#69).

## The order

| # | Stage | What it covers | Review | Size |
|---|---|---|---|---|
| 7 | **Light backlog pass** (docs only) | Remove struck entries from `docs/BACKLOG.md` after checking each is recorded in `CHANGELOG.md` or a code note (a regulatory reading found only there moves into its rule's module note). Pin a "Worth doing before deployment" section at the top. Write the deployment checklist into `docs/DESIGN.md` § Phase 8: unknown routes answer 200, pre-#65 labels carry seeded zeros, the first schema change after deploying needs a migration, the rate limits assume one container. Commit `docs/ideas/2026-10-08-mcp-server.md` and this file, with changelog entries. | medium | about an hour |
| 8 | **GHS pictogram citation for US labels** | `ghs/pictogram-set` cites CLP Annex V on `us-osha` labels too. Read and verify 29 CFR 1910.1200 Appendix C, then cite per regime — or, if the reading does not support that, step aside for US labels with `Decline.limit`. | high (`rules/`) | one stage |
| 9 | **The ingredient-order check as its own rule** | Closes the assortment gap: the order check can stand down in silence, unnamed under "checks that did not run", reachable since #65. | high (`rules/`) | one stage |
| 10 | **Editor dead ends** | The hand-set type size refusing a zero the way measurements do, not a raw 400. The Nutrition Facts "exempt" status contradicting a ticked panel. A GHS market switch leaving codes the export refuses — behaviour to be decided with James first; suggested: the audit screen's pattern (show them, mark them not carried, keep the rest). | medium | one stage |
| 11 | **The MCP "without" experiment** | A few fixture labels given to an AI with no tool: does it invent regulations or miss problems? A few dollars. **The gate** — it decides whether the MCP work goes ahead. **Run on 2026-10-09: it confirms the case.** Sonnet 5.5 caught 26 of 30 planted defects, but 31 of its 36 answers carried a wrong or nonexistent citation and it cleared a defective label three times; $2.11. See `docs/experiments/2026-10-09-mcp-without/`. | — | about an hour |
| 12 | **"Includes" before Added Sugars** | Found by the experiment: every US food label printed "Added Sugars 0g" where 101.9(c)(6)(iii) requires "Includes". Fixed with the tabular sub-row indentation, and a panel line printed over itself now recorded. PR #75. | high (`fda/`, `layout/`) | one stage |
| 13 | **EU supplier and UFI disclosed** | CLP Article 4(11) and Article 25(7), unchecked, now named in `docs/WHAT-IS-NOT-CHECKED.md`. PR #76. | medium | under an hour |
| 14 | **The EU sample labels** | An EU supplier with a telephone number on the three EU samples; the landing page's acetone replaced by a fictional mixture; EUH statements disclosed as unprintable. PR #77. | medium | one stage |
| 15 | **MCP planning, then building** | Only if the experiment confirms the case — it did. **Planned and approved on 2026-10-10, in `docs/plans/2026-10-10-mcp.md`:** the shared judge in `label-core` (16), one shared input schema (17), the server (18), the full with/without eval (19). | per stage | four stages |
| — | **Phase 8, deployment** | `docs/DESIGN.md` § Phase 8, with `/mcp` live if built. Confirmed with James before it starts. | — | — |

## Outside the order

- **The phone scan-back test** — James, by hand, any time before phase 8, following
  `docs/plans/2026-10-08-phone-scan-back.md`. A failure jumps the queue.
- **The rest of the backlog stays there by decision.** It records findings deliberately not acted on; it is not a
  to-do list. Later, or only if it bites: the editor's false "unsaved changes" prompts, the allergen advisory
  that fires on a declaration printed whole, and test and tooling hygiene. Not worth doing: the large regulatory
  models (RACC table, aggregate and bilingual displays, nutrition claims, (b)(11), H-code to hazard class,
  statement-text comparison), most of which `docs/WHAT-IS-NOT-CHECKED.md` already discloses.

## Before the MCP experiment — James to arrange

- An Anthropic API key with a spending limit set in the console. **The key already exists:** `apps/api/.env` holds
  `ANTHROPIC_API_KEY`, gitignored, the one the photo audit uses. This line said on 2026-10-08 that there was no
  `.env` in the repository, which was wrong. Whether the console has a spending limit set is James's to confirm.
- Which models to test. Suggested: Sonnet 5.5, perhaps Haiku 4.5 for contrast.

## Coming at phase 8

Phase 8 deploys on a push to `main`, and `main` is far behind `dev` and left alone by agreement. A `dev` → `main`
release will be needed before deploying — a decision for James when phase 8 starts.
