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
| — | **The MCP "without" experiment** | A few fixture labels given to an AI with no tool: does it invent regulations or miss problems? A few dollars. **The gate** — it decides whether the MCP work goes ahead. Independent of stages 7–10; can run earlier if James wants the answer sooner. | — | about an hour |
| — | **MCP planning, then building** | Only if the experiment confirms the case. The shared judge in `label-core` (high), then the server. See `docs/ideas/2026-10-08-mcp-server.md`. | per stage | two stages |
| — | **Phase 8, deployment** | `docs/DESIGN.md` § Phase 8, with `/mcp` live if built. Confirmed with James before it starts. | — | — |
| — | **The full with/without eval** | Before or after phase 8. | — | one stage |

## Outside the order

- **The phone scan-back test** — James, by hand, any time before phase 8, following
  `docs/plans/2026-10-08-phone-scan-back.md`. A failure jumps the queue.
- **The rest of the backlog stays there by decision.** It records findings deliberately not acted on; it is not a
  to-do list. Later, or only if it bites: the editor's false "unsaved changes" prompts, the allergen advisory
  that fires on a declaration printed whole, and test and tooling hygiene. Not worth doing: the large regulatory
  models (RACC table, aggregate and bilingual displays, nutrition claims, (b)(11), H-code to hazard class,
  statement-text comparison), most of which `docs/WHAT-IS-NOT-CHECKED.md` already discloses.

## Before the MCP experiment — James to arrange

- An Anthropic API key with a spending limit set in the console. There is no `.env` in the repository now.
- Which models to test. Suggested: Sonnet 5.5, perhaps Haiku 4.5 for contrast.

## Coming at phase 8

Phase 8 deploys on a push to `main`, and `main` is far behind `dev` and left alone by agreement. A `dev` → `main`
release will be needed before deploying — a decision for James when phase 8 starts.
