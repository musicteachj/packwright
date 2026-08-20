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
