# packwright — project rules

A packaging label compliance generator. It produces print-accurate GS1 retail, GHS chemical and FDA food
labels, and reports why a label is non-compliant with a citation for every finding.

---

## Git — hard rule

**Never `git commit`, `git push`, or open a pull request without explicit, per-action approval.**

- "Build X" / "fix Y" is **not** approval. It means implement to a reviewable state and stop, leaving the
  changes uncommitted in the working tree.
- Approval is per-action and does not carry over. Approving one commit does not authorise the next.
- Drafting a commit message or PR body and proposing it is fine. Running the command is not.
- This includes the repository's very first commit.

---

## Reviews and pull requests

**Open a pull request when unmerged work reaches ~1,500 lines, or at a stage boundary — whichever comes
first.** Size is the trigger, not the phase or stage structure, because size is the thing that actually
breaks. Phase 5 ran the length of a phase on one branch and produced a 14,000-line PR across 59 files: the
deep review refused it outright, and no person could have read it in one sitting either.

Nothing in that branch was ever too big. Its fifteen commits had a **median of 750 lines** and a largest of
3,056 — they simply accumulated, because `dev` did not move for a phase. Stage boundaries alone would not
have saved it: stages 1–2 came to 5,029 lines and stage 6 to 4,802.

The commit checkpoints are already the right unit. They are where the work pauses for approval anyway, so
PRing there adds no ceremony.

**The review ladder:**

| when | what |
|---|---|
| before each commit | `/code-review medium` with **no target** — it reviews the uncommitted diff, so it scales with what was just written rather than with the branch. `max`, still with no target, when that diff touches `rules/`, `fda/` or `layout/` and is small |
| PR touching `rules/`, `fda/` or `layout/` | `/code-review high <PR#>` — broader coverage than medium, and some findings it is less sure of; triaging them is the price |
| PR that is UI or API only | the per-commit medium was enough |
| every second or third stage, while a phase is in flight | one `/code-review medium dev` as a hedge — reviews keep finding defects in *older* code, and the allergen false clearance was stage 3 work found on the fifth pass |

**Cloud reviews are not used on this project.** `/code-review ultra` is billed per run against usage credits
and its free allotment is three per account, one-time and non-refreshing — spent the moment the cloud session
starts, whether or not the review finishes. `high` is the top of this ladder.

**The level is chosen by diff size as much as by risk.** `max` is the deepest pass and the one that scales
worst: **never run it on a branch-sized diff**, where it will consume most of a session. On a small
uncommitted diff it is affordable, which is why it sits on the commit row rather than the PR row — the commit
checkpoint is where a false clearance is born, and where the diff is still small enough to look at closely.
Once a diff is large the only remedy is stacked branches, and that is a reason to commit less to a branch
rather than to reach for a bigger review.

**Levels are worth escalating, and this is the evidence.** Three `medium` passes over the same file walked
past a write-vs-rename race in the test-database wrapper — a plain write truncates first, so a concurrent
sweep read an empty owner file and deleted a live database's directory. `high` found it on its first pass.

**The UI row asks the wrong question, so ask a better one: what would a defect here cost?** That row exists
because a defect in a screen costs a screen. It stops being true the moment a UI pull request is really an
*API* — a component layer that many call sites will be migrated onto, where a wrong boundary costs every one
of them and fails silently rather than loudly.

PR #52 is the evidence. UI only by the letter of the ladder, nothing in `rules/`, `fda/` or `layout/`, and
CI green. A `medium` run on it anyway found five real defects, two of which would have arrived as migration
damage rather than as anything anybody would notice: `MeasurementField` typed its model `string` while 32 of
the 34 number inputs it replaces are written `v-model.number`, and the description had lost its spacing, so
help text would have sat at 0 px against its control on all 105 sites at once. Fixing the second found a
third by breaking four tests — an HTML comment before a Vue template's root makes the component multi-root,
which **silently stops it inheriting attributes**, so every caller's `class` stopped reaching the field root.

So: `medium` on the pull request when the diff is a component API, whatever directory it sits in. Still
`medium` and not `high` — the risk there is API shape rather than a false clearance, and the budget is real.

**A review of the working tree does not cover what you write in response to it.** The commit row reviews the
uncommitted diff, which is the right unit — but findings get fixed, fixes get extended, and the extension is
unreviewed. On `feat/interface-foundation` that gap reached about 250 lines, including a whole prop and the
mechanism behind an invalid state. Either re-run the `medium` before committing, or say plainly in the pull
request which parts no review has seen.

**Fix what is in the current scope and record the rest in `docs/BACKLOG.md`, with the reasoning.** Fixing
every finding the moment it appears turned four planned items into four unplanned commits in one session,
and left the stage no further forward.

**After changing any rule or the renderer, ask directly: can this rule now pass on something the engine did
not draw?** Every false clearance this project has shipped was found by review and none by the suite — the
allergen cleared by a coconut, the nutrient rows drawn off the substrate, the net quantity at x −57.5 mm
with all five of its rules reporting compliant, the second column marked drawn on the strength of a
declaration. Tests catch regressions in what someone thought to check; they are structurally blind to a rule
certifying content that was never printed.

**Mutation-test every fix.** Revert it and confirm a named test fails. A fix whose test still passes without
it is a fix with no test.

---

## Correctness invariants

This project's only real value is being right. These are the rules most easily broken without noticing.

**Never generate regulatory text.** H-statements, P-statements, and every other codified string are looked up
from the reference tables. `H225` is *"Highly flammable liquid and vapour"* — exactly, always. A paraphrase
produces a non-compliant label.

**Never author a compliance verdict or a citation from a model.** Findings originate in `rules/` only. A
language model is fluent at producing plausible-looking CFR references, and a user has no way to tell a real
one from an invented one.

**Never invent a citation.** If a CFR section or GS1 clause cannot be verified against a source document, the
rule does not ship. An unverifiable citation is worse than no rule.

**Every rule ships with a fixture** — a known-bad label document asserting the exact finding code and citation
it produces. A rule without a fixture is a claim, not a check.

**Read the modal verb and the scope, not just the number.** About a third of phase 5's defects were one
error: a figure enforced without reading what it was attached to. A guidance figure made a requirement — the
bar weights, the vitamin rounding increments, the 22 pt heading. A permission made an obligation — the fat
zero-floor, where `shall` and `may` sit at the same 0.5 g threshold; the §101.100 exemption; the format
entitlements. And a figure applied past the paragraphs it names — the 14 pt Calories numeral, which belongs to
two of the five displays and was given to all three the table then knew about. Before writing a rule, record
whether the source says *shall*, *may* or *strongly recommends*, whether the figure is in the CFR or in FDA
guidance, and **which paragraphs the exception actually lists**. A rule that reports a label for exercising a
permission is a false positive its user cannot argue with; a table keyed on something coarser than the
regulation's own exceptions is wrong in both directions at once.

**Verify every citation against the primary source, in the session that writes it.** Not from memory, and
not from a local copy. Fetching the paragraph is expected and costs seconds; **search the web freely** for
regulations, statutes and standards — that is research this project requires, not a detour from the task.

The eCFR renderer API serves 21 CFR as text, and needs `--compressed` or it returns nothing readable:

```
curl -sL --compressed "https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-21?part=101&section=101.9" -H 'accept: text/html'
```

**Never verify an extract against itself.** A local copy under `/tmp` is a convenience for re-reading, never
evidence — re-fetch the paragraph before transcribing anything from it into a table. Twelve corrupted GHS
statements shipped once because a decoded PDF was checked against the same decode; `ghs/statements.ts` records
it at length.

**Record what was read and when**, in the module note beside the figures: "Source: 21 CFR 101.9(j)(13), read
from the eCFR on 2026-09-12." Every reference table here does this, and it is what makes a later reader able
to re-check a figure rather than re-derive it.

**Know which source you are standing on.** The regulation governs; FDA's illustrations and guidance documents
do not. `fda/nutritionPanel.ts` draws its bar weights from FDA's "Examples of Different Label Formats" and
therefore lets **no rule judge them**, while the type sizes beside them come from 101.9 itself and ship as
rules. When a guidance figure and the regulation disagree — the illustrations annotate the linear display
"all type sizes are 6 point", which cannot be squared with (d)(1)(iii)'s 14 — the regulation wins and the
conflict gets written down.

**Golden vectors come from source documents.** Never compute an expected value by running the implementation
and pasting the result — that proves only that the function is deterministic. Work it through by hand from the
published algorithm, and record where the vector came from.

**`label-core` imports no framework.** No Vue, no Express, no Mongoose, no `node:*`. It runs in the browser,
on the server and in tests unchanged. This is enforced by `no-restricted-imports` in `eslint.config.js` and by
`"types": []` in its tsconfig — if a change appears to need either relaxed, the boundary is in the wrong place.

**Nothing extracted becomes label data silently.** Vision extraction produces an `ExtractionResult` with
per-field confidence. A user confirms before any value enters a label.

---

## Architecture

The layout engine produces a `ResolvedLayout` — a flat list of primitives positioned in millimetres — and two
renderers consume it: SVG for the browser preview, PDFKit for export. This is what makes preview == print true
by construction rather than by coincidence. Compliance rules run against the *resolved layout*, so a rule like
"net quantity must sit in the bottom 30% of the principal display panel" is checked against computed geometry
rather than intent.

```
packages/label-core/   framework-free engine — gs1, geometry, symbology,
                       templates, layout, rules, render
apps/web/              Vue 3 client
apps/api/              Express API — persistence, PDF export, vision extraction
```

---

## Stack

- **Node ≥ 24** (Active LTS; 22 is in maintenance) and **npm ≥ 11**. npm 10's arborist crashes resolving this dependency graph
  (`Cannot read properties of null (reading 'edgesOut')`). Use `npx npm@11` if the global npm is older.
- **Vitest**, not Jest — Vite is already the build tool, so there is no second transform config.
- **`vue-tsc --noEmit`**, not bare `tsc`, for anything containing `.vue`. Plain `tsc` reads the script block
  and stops; it does not type-check inside `<template>`.
- npm workspaces · Vue 3 `<script setup>` + Pinia · Express 5 + Mongoose · Zod 4
- **Tailwind theme tokens, never raw hex in components.**
- `label-core` is consumed as TypeScript source; `apps/api` bundles it in via tsup, which is what keeps
  production a single container.

---

## Conventions

- Units live in the field name — `widthMm`, `heightIn`, `xDimensionMm`. Never a bare `width`.
- Monospace and tabular figures for identifiers and measurements in the UI; dimensions update live as you
  type, and proportional figures make the readout jitter on every keystroke.
- Severity levels map onto the ANSI Z535 scale printed on the labels this app generates. Cite **Z535.4** for
  the signal words (DANGER, WARNING, CAUTION, NOTICE) and **Z535.1** for the colours they are printed in —
  Z535.1 is the colour standard alone and does not define the scale. Colour never carries meaning alone;
  every severity has an icon and a text label.
- Update `CHANGELOG.md` **in the same edit as the change**, never as a separate pass afterwards.
