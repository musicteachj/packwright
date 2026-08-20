# packwright — packaging label compliance generator

## Context

`barcode-crud` is a working portfolio piece: Vue 2.6 + Vuetify 2 + Express + MongoDB, generating 8 barcode
formats and printing them through the browser dialog. The goal is to expand the idea into a **packaging label
generator** — barcodes are one element of a packaging label, and the surrounding content is governed by real,
citable regulation. That regulatory depth is the differentiator: not "an app that draws labels," but "an app
that knows why a label is non-compliant and cites the rule."

**Decision: build this as a new repository**, with `barcode-crud` kept intact as a separate portfolio piece.
Nothing meaningful survives the transition — `vue-barcode` is 1D-only, `printd` prints HTML at browser scale
rather than physical dimensions, the flat `Barcode` model can't express a label document, and Vue 2/Vuetify 2
have been EOL since Dec 2023. Expanding in place would mean replacing every layer while the old code
constrains each step. The knowledge ports; the code does not.

**Scope decisions made during brainstorming:**

| Decision | Choice |
|---|---|
| Positioning | Portfolio piece. Real rules, real citations — but no liability posture, auth, or billing. |
| Label types | GS1 retail product, GHS chemical, US food (FDA) |
| Editing model | Guided template wizard (not a free-form canvas) |
| Scanning | Yes — modern lib, feeding the retail wizard |
| AI | Vision-based label audit only. LLM extracts; deterministic engine judges. |
| Design | New system, derived from print production. ANSI Z535.1 severity scale, IBM Plex, graphite/paper. |
| Stack | Vue 3 + Vite + TS + Pinia, Tailwind v4 + shadcn-vue, Express + Mongoose + MongoDB |

The wizard model is deliberate: because the template owns layout, compliance can be **enforced** rather than
merely suggested. A free-form canvas would undermine the one thing that makes this project interesting.

---

## Architecture

### The central idea

A **layout engine produces a resolved layout** — a flat list of primitives positioned in millimetres — and
**two renderers consume it**: SVG for the browser preview, PDFKit for the export.

```
template + data + stock ──► layout engine ──► ResolvedLayout (mm)
                                                    │
                                        ┌───────────┴───────────┐
                                        ▼                       ▼
                                   SVG renderer            PDFKit renderer
                                   (browser preview)       (server export)
```

This guarantees preview == print, which is the property a label generator lives or dies on. It also means the
compliance rules run against the *resolved layout*, so a rule like "net quantity must sit in the bottom 30% of
the principal display panel" is checked against actual computed geometry rather than intent.

### Repository shape

npm workspaces — no extra monorepo tooling needed at this size.

```
packwright/
packages/label-core/     @packwright/label-core — plain TypeScript, zero framework dependency
  gs1/                   check digits, AI table, element strings, Digital Link URIs, SSCC
  geometry/              mm/in/pt units, X-dimension ↔ magnification, quiet zones, PDP area
  symbology/             bwip-js adapter — physical-size-correct symbol generation
  templates/             per-label-type element definitions and anchors
  layout/                template + data + stock → ResolvedLayout
  rules/                 validators returning Findings with regulation citations
  render/                toSVG(layout) · toPDF(layout, pdfkitDoc)

apps/web/                Vue 3 + Vite + Pinia + Tailwind v4 + shadcn-vue
apps/api/                Express + Mongoose + PDFKit
```

`label-core` having no Vue dependency is not incidental — it is what lets the same layout and rule code run in
the browser for live preview and on the server for PDF generation.

### Key dependencies

- **[bwip-js](https://github.com/metafloor/bwip-js/)** (MIT) — the library that makes this project viable.
  90+ symbologies including [GS1-128, GS1 DataMatrix, GS1 Digital Link DataMatrix, and GS1 Digital Link QR
  Code](https://github.com/metafloor/bwip-js/wiki/BWIPP-Barcode-Types). Framework-agnostic, with both SVG and
  PDFKit output — so one dependency covers preview and export, 1D and 2D.
- **[PDFKit](https://npm-compare.com/pdf-lib,pdfkit,pdfmake)** — chosen over pdf-lib because it is built for
  low-level precise positioning and custom vector drawing and includes an SVG path parser. pdf-lib is oriented
  toward modifying existing PDFs, which is not the problem here.
- **BarcodeDetector API + zxing-wasm fallback** — replaces Quagga.js, which has been unmaintained for years.
  Dramatically less code than the current 880-line `Scan.vue`.
- **Zod** — one schema per label type, shared between client form validation and API validation. It also
  doubles as the vision-extraction contract via `zodOutputFormat` (see the AI layer below), so a single schema
  definition drives three consumers.
- **`@anthropic-ai/sdk`** — Claude vision extraction on the API server. Model `claude-opus-5`.

### Tooling

| Concern | Choice |
|---|---|
| Node | 24 LTS (Active) |
| Package manager | npm workspaces — matches the old repo, no extra tooling to learn |
| Test runner | **Vitest** across all three packages |
| Component tests | Vue Test Utils on Vitest |
| API tests | Vitest + Supertest |
| Coverage | `@vitest/coverage-v8` |
| E2E | **Playwright** — critical paths only, not a suite |
| Lint | ESLint flat config + `eslint-plugin-vue` + `eslint-plugin-vuejs-accessibility` |
| Format | Prettier + `prettier-plugin-tailwindcss`, plus `.editorconfig` |
| Typecheck | **`vue-tsc`**, not bare `tsc` |
| Pre-commit | `simple-git-hooks` + `lint-staged` on staged files |
| CI | GitHub Actions — lint, typecheck, test, build |
| Deploy | Docker → ECR → **AWS ECS Fargate**, matching the existing portfolio infrastructure |

Vitest rather than Jest is a deliberate change from the old repo: Vite is already the build tool, and Vitest
shares its transform pipeline, so there is no second config to keep in sync.

Three of those are easy to omit and each prevents a real class of problem:

- **`vue-tsc` rather than bare `tsc`.** Plain `tsc` does not type-check inside `<template>` — it sees the SFC's
  script block and stops. This app binds a lot of computed geometry into templates, so template-level type
  errors are exactly the kind it would otherwise ship. The CI typecheck step runs `vue-tsc --noEmit`.
- **`prettier-plugin-tailwindcss`.** Sorts utility classes into canonical order on save. Removes a whole
  category of diff noise and makes "is this class already applied twice" answerable by looking.
- **`eslint-plugin-vuejs-accessibility`.** The design section commits to specific accessibility behaviour; a
  lint rule can't verify all of it, but it catches the baseline — missing alt text, unlabelled form controls,
  click handlers on non-interactive elements — so the commitment isn't purely aspirational.

Playwright is deliberately scoped small: the responsive collapse at each breakpoint, a keyboard-only walk of
the editor, the finding → canvas highlight, and a PDF export whose page box is asserted after download. Those
four are hard to check by hand every time and cheap to automate. Everything else stays in Vitest.

### Deployment

**Phase 8 work — nothing here is provisioned until the app is finished.** It then slots into the shared
portfolio infrastructure already running `barcode-crud` rather than standing up anything new. Per
`DEPLOYMENT.md` in the old repo:

| Resource | Existing | For this app |
|---|---|---|
| ECS cluster | `portfolio-cluster` | **reuse** |
| Load balancer | `portfolio-alb` (cost split across apps) | **reuse** — add a listener rule |
| Region | `us-east-1` | same |
| Database | MongoDB Atlas (external) | same cluster, new database |
| ECR repo | `barcode-crud` | `packwright` |
| ECS service + task def | `barcode-service` / `barcode-task` | `packwright-service` / `packwright-task` |
| Target group | `barcode-tg-service` | `packwright-tg-service` |
| Route 53 | `barcode.jameslittlefield.net` | `packwright.jameslittlefield.net` |
| Secrets Manager | `barcode-mongo-uri` | `packwright-mongo-uri` **+ `packwright-anthropic-key`** |
| Logs | CloudWatch `/ecs/barcode-crud` | `/ecs/packwright` |

Marginal cost is roughly **$3–4/month**, since the ALB — the expensive part at ~$17/month — is already paid
for and shared.

Deploy pipeline is the same shape as the old repo's `.github/workflows/deploy.yml`: push to `main` → build
image → push to ECR → render task definition → update the ECS service with `wait-for-service-stability`, with
the deployment circuit breaker handling rollback. Health check at `/health` for the ALB target group.

**Single container, as before.** Even though the repo is a workspace, the production build compiles `apps/web`
to static assets that `apps/api` serves — so this is one ECS service, not two. Same pattern as `barcode-crud`,
and it keeps the marginal cost at one Fargate task.

**One new thing to get right:** the Anthropic API key is a server-side secret. It goes in Secrets Manager and
is injected into the task definition — it must never reach the browser bundle. This is part of why vision
extraction lives in `apps/api` rather than being called from the client.

### Data model

```ts
LabelDocument {
  _id, name, labelType: 'gs1-retail' | 'ghs-chemical' | 'us-food',
  templateId,
  stock:  { widthMm, heightMm, marginMm },
  data:   <discriminated union by labelType>,
  createdAt, updatedAt
}
```

Findings are computed, never stored — they must always reflect the current rule set.

---

## The rule sets

Each rule is a pure function returning `Finding { severity, code, message, citation, elementId }`. The citation
field is what makes the compliance panel credible rather than decorative.

### GS1 retail product label

- GTIN mod-10 check digit; GTIN-8/12/13/14 normalisation
- Magnification constrained to **80–200%** of nominal; X-dimension derived from it
- Quiet zones: **9X left and right for UPC-A**, 9X left / 7X right for UPC-E, **7X** general
- GS1 Digital Link URI syntax — canonical form plus the convenience alphas (`/gtin/`, `/lot/`, `/ser/` for AIs
  01, 10, 21), with attributes such as expiry in the query string
- Sunrise 2027 guidance: place the 2D symbol adjacent to the linear symbol during transition
- Placement warnings: seams, curves, quiet-zone intrusion

### GHS chemical label

Six required elements — product identifier, signal word, hazard statements, pictograms, precautionary
statements, supplier identification.

- **Signal word precedence: DANGER supersedes WARNING; never both**
- **Pictogram precedence** — e.g. corrosion suppresses the exclamation mark for skin/eye irritation; skull and
  crossbones suppresses the exclamation mark
- 9 pictograms, red square-on-point border
- EU CLP sizing (Annex I §1.2): label **≥ 52 × 74 mm** for packages ≤ 3 L; each pictogram **≥ 1/15 of the label
  information area AND ≥ 1 cm²**; recommended 16 × 16 mm, minimum 10 × 10 mm under 3 L
- OSHA's May 2024 final rule aligning to GHS Rev. 7: containers **under 100 mL** may use a fold-out label, but
  product identifier, pictograms, signal word and supplier info must remain on the immediate container
- Surface the compliance deadlines in the UI: **substances 19 Jul 2026, mixtures 19 Jan 2028**

### US food label (21 CFR 101)

- **PDP area calculation** — rectangular: `h × w`; cylindrical: `40% × (h × circumference)`; other shapes:
  `40% of total surface`
- **Net quantity type size by PDP area**, measured by the lowercase "o": ≤5 in² → 1/16"; >5–25 in² → 1/8";
  >25–100 in² → 3/16"; >100 in² → 1/4"; >400 in² → 1/2"
- Net quantity in the **bottom 30% of the PDP**, dual metric/US customary units
- Nutrition Facts panel — format selected by package size across the six approved variants (vertical,
  dual-column, tabular, linear, aggregate, bilingual); 13 mandatory nutrients; %DV column
- **Nine** major allergens including sesame — "Contains" statement or in-line parenthetical
- Ingredient list in descending order by weight; manufacturer/packer/distributor name and address
- FDA's front-of-pack "Nutrition Info Box" is **proposed, not final** — build it behind a clearly-labelled
  forward-looking flag rather than presenting it as current law

---

## The AI layer — label audit from a photo

This is the fourth AI-integration pattern in the portfolio, after prompt/response, tool use, and RAG:
**multimodal extraction behind a hard verification boundary.**

### The boundary

> **The LLM reads. The rule engine judges.**

Claude vision is very good at looking at a label photo and reporting what's on it — signal word, net quantity,
H-statements, ingredient list. That's perception: fuzzy input, structured output. It is also *fluent* at
declaring a label non-compliant and citing a regulation, sometimes wrongly. The deterministic rule engine
already answers that correctly.

So extraction feeds the existing validators, and **every finding the user sees comes from deterministic code
with a real citation**. No compliance verdict is ever generated by a language model. Documenting this boundary
in the README is part of the deliverable — the restraint is the point.

Three hard rules, enforced in code, not just prompt text:

1. **Never generate H- or P-statements.** They are codified fixed strings looked up by code from a table. A
   paraphrased "H225 Highly flammable liquid and vapour" is a non-compliant label.
2. **Never author the compliance verdict or the citation.**
3. **Never fill a field silently.** Extracted values arrive as unverified with confidence surfaced, and the
   user confirms before they become label data.

### The extraction contract

Define this in `label-core` in phase 1, long before any extraction code exists — it is what makes the SDS path
and the eval harness additive later rather than a refactor:

```ts
ExtractionResult<T> {
  fields:   Record<FieldPath, { value, confidence, sourceRegion? }>
  warnings: ExtractionWarning[]
}
```

The photo path produces one. An SDS-PDF path would produce one. An eval harness scores anything that produces
one. New producers plug into an existing socket.

### Implementation

Server-side, in `apps/api`. Claude vision with structured outputs — `output_config.format` built from the
**same Zod schema** the wizard form already validates against, via `zodOutputFormat` from
`@anthropic-ai/sdk/helpers/zod`, so extraction cannot return a shape the wizard can't consume.

Two things to get right, both easy to miss:

- **Check `stop_reason === "refusal"` before reading `response.content`.** Claude Opus 5 runs safety
  classifiers; a declined request returns HTTP 200 with empty or partial content. Code that indexes
  `content[0]` unconditionally breaks.
- **High-resolution vision is automatic** on Opus 5 — 2576 px on the long edge. Label photos benefit
  directly from this; don't downsample before upload.

Flow: capture → extract → present every field as unverified with confidence → user confirms → the confirmed
data enters the wizard's normal path → existing validators run unchanged.

### Deliberately deferred (the contract makes these cheap to add)

- **SDS → GHS label.** PDF upload, Section 2 GHS classification extraction, prefill the GHS wizard. Claude
  accepts PDFs directly as `document` content blocks.
- **Eval harness.** Golden label images with hand-verified ground truth, per-field accuracy scored in CI.
  Possible only because the rule engine gives you ground truth to score against — but the labelled dataset is
  real manual work.

---

## Design system

### The idea

The visual language comes from **print production and technical specification** — die lines, registration
marks, dimension callouts, spec sheets — not from SaaS dashboard convention. That isn't decoration: it is the
actual visual vocabulary of the industry the app serves, and it is almost unused on the web.

### Severity colours are ANSI Z535.1

The decision everything else follows from. [ANSI Z535.1](https://www.safetysign.com/what-is-ansiz5351) is the
US safety colour standard, and it defines exactly a five-level scale: **DANGER red, WARNING orange, CAUTION
yellow, NOTICE blue, green for safety instructions.** That is precisely the shape of a compliance findings
panel — and it is the colour system printed on the very labels this app generates.

So the app's own error states use the hazard-communication standard of its own subject matter. Nothing
arbitrary, and it explains itself in one sentence during a demo.

| Finding severity | ANSI signal | Meaning |
|---|---|---|
| Blocking | DANGER / red | Non-compliant as drawn — export warns |
| Violation | WARNING / orange | Fails a required rule |
| Advisory | CAUTION / yellow | Allowed, but near a tolerance limit |
| Guidance | NOTICE / blue | Best practice — e.g. 2D placement for Sunrise 2027 |
| Pass | green | Check ran and passed |

Never colour alone — every severity carries an icon and a text label.

### Chrome and canvas

**Deep graphite chrome, true paper-white canvas** — the design-tool convention (Figma, InDesign), where the
artboard floats on a neutral field. Two reasons it's right here rather than merely conventional:

1. **The label must read as paper.** It is the artifact; everything else is apparatus.
2. **The ANSI palette requires it.** Safety colours are high-chroma by design — meant to be legible across a
   factory floor. On white they are aggressive; on graphite they are calm and readable. The chrome is derived
   from the palette, not chosen ahead of it.

Graphite is warm-neutral (ink, not blue-black) so paper-white reads warm against it rather than glaring.

### Typography

**IBM Plex Sans + IBM Plex Mono** ([OFL, open source](https://github.com/IBM/plex)).

- Designed as the typeface of an engineering company, for technical UI — the brief matches exactly
- Plex Sans's figures sit cleanly alongside Plex Mono in tabular contexts. This matters concretely: dimensions
  update live as you type, and non-tabular figures make the readout jitter on every keystroke
- Plex Sans Condensed for dense data columns
- It does not carry the Inter/Roboto "generated app" signal

Mono for anything that is an identifier or a measurement — GTINs, SSCCs, element strings
`(01)09506000134352(10)ABC7`, H-codes, millimetre values. Sans for everything else.

### Motifs

- **Dimension callouts** — thin rules with tick ends and a measurement label, straight out of engineering
  drawing. Used literally on the canvas (label dimensions, quiet-zone widths, type heights) and echoed as
  section dividers in the UI. The app is about measuring things against a standard, so measurement notation
  *is* the brand.
- **Registration target** ⊕ — the logo mark, and the loading indicator. A rotating registration target is
  domain-native and quietly delightful.
- **Crop marks** at the canvas corners.

### Density and anti-patterns

Spec-sheet dense, on a 4px rhythm. Hairline rules in preference to cards; small label type (12–13px) with
generous line-height. Lavish whitespace reads as marketing — this is a professional instrument.

Explicitly avoided: **purple/pink gradients** (the current generated-app signature), glassmorphism, floating
cards with large shadows, emoji as icons, uniformly rounded corners. The subject matter is exacting; the
interface should look exacting.

---

## Screens

| Route | Purpose |
|---|---|
| `/` | Landing — portfolio front door. Live-rendering label, the three types, the audit demo. |
| `/labels` | Saved labels. Type badge and compliance status per card. |
| `/labels/new` | Type chooser — three cards, each showing a real rendered example rather than an icon. |
| `/labels/:id` | **The editor.** This is the app. |
| `/audit` | Photo/camera label audit (mobile-first). |
| `/rules` | The rule catalogue — every encoded rule with its citation, browsable. |

`/rules` is nearly free, since it just renders the rule registry that already exists — and it is the single
strongest proof of domain depth anywhere in the app. Worth building.

### The editor

```
┌─ ⊕ label ─────────────────────────────────────────────────────┐
│ Form rail  │           canvas               │  findings       │
│            │      ┌──────────────┐          │                 │
│ ▸ Product  │   ⌐  │              │  ⌐       │ ▲ WARNING       │
│ ▸ Hazards  │      │  paper-white │          │   Quiet zone    │
│ ▸ Supplier │      │    label     │          │   6.2X — needs  │
│ ▸ Stock    │      │              │          │   ≥ 9X (UPC-A)  │
│            │   ⌐  │              │  ⌐       │   GenSpec 5.2.3 │
│            │      └──────────────┘          │                 │
│            │      |◄─── 52 mm ───►|         │ ⓘ NOTICE        │
│            │                                │   Place 2D near │
│            │   fit · 100% · 200%            │   the linear    │
│            │   ☑ quiet zones  ☐ PDP  ☑ dims │                 │
│            │                                │ ✓ 18 passed  ▾  │
└────────────┴────────────────────────────────┴─────────────────┘
```

- **Left rail (~380px) — the form.** Sectioned, **not stepped**. A linear stepper fights label editing, where
  you jump between fields constantly. Sections stay open, each with a completeness indicator.
- **Centre — the canvas.** True-scale SVG on the neutral field. Zoom (fit / 100% / 200%), a live dimension
  readout, and overlay toggles: quiet zones (hatched), PDP boundary, safe margins, bleed/die line, dimensions.
- **Right rail (~320px) — findings.** Grouped by ANSI severity. Each states the claim, the measured-vs-required
  value, and the citation. Passes collapsed at the bottom — "18 checks passed" is both reassuring and evidence
  of thoroughness.

### The signature interaction

**Click a finding → the offending element outlines on the canvas, the canvas scrolls to it, and the responsible
form field highlights.** Bidirectional: focus a field and its element highlights.

That one link is what turns the compliance engine from a wall of text into something you can *see*. It is also
the demo moment. It belongs in phase 3, alongside the rule engine — not in polish afterwards.

### Responsive

An honest split rather than one-size-fits-all:

- **Editor: desktop-first.** A phone is a bad place to lay out a 100 × 150 mm label, and pretending otherwise
  produces a worse desktop tool. Below 1024px the three panes collapse to a segmented control —
  Form / Preview / Checks.
- **Scan and audit: mobile-first.** These are inherently phone tasks — camera in hand, label on the shelf.

### Accessibility

Beyond the baseline (visible labels, focus order, focus-first-invalid-field on submit, `role="alert"` on
findings, 4.5:1 contrast):

- **Severity never by colour alone** — icon plus text on every finding.
- **The canvas is an SVG and needs a text equivalent.** A "label contents as text" view listing every element
  and its position. It's an accessibility requirement that turns out to be broadly useful — it is also the
  fastest way to eyeball what the layout engine actually produced.
- **GHS pictograms carry a `<title>`** naming the hazard, not just "pictogram".
- Motion is near-zero by default and respects `prefers-reduced-motion`. The only animation that earns its place
  is a dimension callout drawing itself when an overlay toggles, and a finding's highlight on the canvas.

---

## Development phases

Seven phases, each ending somewhere demoable. Two ordering constraints aren't obvious from the sequence, so
they're placed deliberately: **`ExtractionResult` is defined in phase 1** even though the AI work is phase 7
(retrofit it and the SDS path and eval harness become refactors instead of additions), and **design tokens land
in phase 2** so that no screen is ever built against placeholder styling.

### Phase 1 — Foundation

*Build:* workspace scaffold (npm workspaces, Vite, Vitest, ESLint, GitHub Actions), plus `CLAUDE.md` and
`CHANGELOG.md` at the root — first commit, so neither is retrofitted. `gs1/` — GTIN and SSCC
check digits, the Application Identifier table with format/length/FNC1 rules, element-string parse and build,
Digital Link URI construction. `geometry/` — mm/in/pt conversion, X-dimension ↔ magnification, quiet-zone
widths per symbology, PDP area. The `ExtractionResult` contract. Port the constraints table from
`client/src/constants/barcodeTypes.ts` as reference data.

*Done when:*
- Check-digit and AI-parsing tests pass against golden vectors **taken from GS1 documentation**, not invented
- PDP area matches the worked examples for all three container shapes (rectangular, cylindrical, other)
- CI runs lint, typecheck and test on push
- `CLAUDE.md` and `CHANGELOG.md` exist at the root, and the changelog already has entries
- No *product* UI exists — `label-core` is pure functions, and `apps/web` is a scaffold whose only screen
  exists to prove the wiring end to end: that the browser bundle resolves `label-core` from source and its
  output is real. It is placeholder styling by definition and phase 2 replaces it. The original wording here
  was "no UI exists yet", which the scaffold could never satisfy — a workspace needs a bootable app to prove
  it boots

### Phase 2 — Rendering spine + design tokens

*Build:* `ResolvedLayout`, the layout engine, the SVG renderer, the PDFKit renderer, the bwip-js adapter, and
the Tailwind theme (graphite chrome, ANSI severity scale, IBM Plex scale, 4px rhythm). One label type only.

*Done when:*
- A UPC-A label renders in the browser and exports to PDF
- The exported PDF's MediaBox and symbol bounding boxes match the requested millimetres within tolerance
- **The printed label scans with a phone and decodes to the expected GTIN** — the real gate
- No screen uses placeholder styling

The riskiest phase. If preview ≠ print, everything after it is built on sand — which is why only one label type
exists at this point.

### Phase 3 — Rule engine + findings rail

*Build:* the `Finding` type, the GS1 retail validators (check digit, 80–200% magnification, quiet zones,
Digital Link syntax, 2D placement guidance), the three-pane editor shell, the findings rail, and the
finding ↔ canvas ↔ form highlight link.

*Done when:*
- A deliberately non-compliant label produces the expected finding codes and citations
- Clicking a finding outlines the offending element on the canvas and highlights its form field
- Findings announce via `role="alert"`; every severity carries icon **and** text, never colour alone

### Phase 4 — GHS chemical label

*Build:* nine pictogram SVGs, H- and P-statement libraries (GHS Rev. 7), signal-word precedence, pictogram
precedence, CLP sizing (≥ 52 × 74 mm under 3 L; pictogram ≥ 1/15 of label area and ≥ 1 cm²), sub-100 mL
fold-out handling.

*Done when:*
- A chemical with overlapping hazard classes resolves to exactly one signal word and the correct pictogram set
- A 50 mL container triggers the fold-out path, with the required elements still on the immediate container
- Statement text is **looked up from the table, never generated**

### Phase 5 — US food label

*Build:* PDP area wired to stock geometry, the net-quantity type-size table, the Nutrition Facts renderer
across its six format variants, ingredient list, nine-allergen handling.

*Done when:*
- A 30 in² PDP demands ≥ 3/16" net-quantity type and flags anything smaller
- All six Nutrition Facts variants render with correct type scale and rule weights
- Sesame is present in the allergen set

Largest single piece of work in the project — budget accordingly.

### Phase 6 — Scanning, persistence, catalogue

*Build:* BarcodeDetector scanner with zxing-wasm fallback feeding the retail form, saved-label CRUD, the
`/rules` catalogue, the landing page.

*Done when:*
- Scanning a real product barcode prefills the retail form with a valid GTIN
- `/rules` lists every encoded rule with its citation, **generated from the registry** rather than hand-written
- The three-pane → segmented-control collapse works at 375 / 768 / 1024 / 1440
- `npm run build` collapses to a single artifact — `apps/web`'s static output served by `apps/api` — verified
  by running it locally. No container, no cloud; this is just the one assumption phase 8 rests on

### Phase 7 — Label audit from a photo

*Build:* the Claude vision extraction endpoint, the confirm-before-commit UI, the audit report.

*Done when:*
- A photographed label produces an `ExtractionResult` with per-field confidence
- Nothing enters label data without explicit user confirmation
- `stop_reason: "refusal"` returns a clean error rather than throwing
- Every finding in the audit report still originates from the deterministic engine

### Phase 8 — Deployment

**Deliberately last.** Everything up to here runs locally. No AWS resource is created, and nothing is paid for,
until there is a finished application to put behind it.

*Build:* the Dockerfile (multi-stage — build `label-core`, then `apps/web`, then `apps/api`, ship one runtime
image), the GitHub Actions ECS workflow, and the AWS resources: ECR repo, task definition, ECS service, target
group, ALB listener rule, Route 53 record, and the two Secrets Manager entries.

*Done when:*
- `packwright.jameslittlefield.net` serves the app over HTTPS
- `/health` returns healthy and the ALB target group reflects it
- Both secrets resolve from Secrets Manager into the task, and **the Anthropic key is absent from the browser
  bundle** — grep the built assets to confirm
- Push to `main` deploys; a failed deploy rolls back via the deployment circuit breaker
- CloudWatch `/ecs/packwright` shows application logs

This should be a short phase. `barcode-crud` already proves this exact shape — Vue + Express + Mongo, single
container, shared cluster and ALB — so it is provisioning against a known-good reference rather than working
anything out.

**One cheap hedge, no cloud spend involved:** verify during phase 6 that the production build actually
collapses to a single artifact — `apps/web` compiling to static assets that `apps/api` serves. That is the one
assumption phase 8 rests on, and confirming it locally costs nothing. Everything else about deployment is
copy-adapt from the old repo.

---

## Verification

- **Unit tests** on `label-core` — check digits and AI parsing against golden vectors taken from GS1
  documentation, not hand-invented values. Geometry math against worked examples from the specs.
- **SVG snapshot tests** on resolved layouts, so a rendering regression fails loudly.
- **PDF dimension assertions** — generate a PDF, parse it back, assert the MediaBox and symbol bounding boxes
  land within tolerance of the requested millimetre values. This is the test that proves preview == print.
- **Scan-back test** — the one that actually matters. Generate a label, print or display it, scan it with a
  phone, confirm it decodes to the expected GTIN/element string. A barcode that validates but won't scan is a
  failure the unit tests cannot catch.
- **Rule-engine fixtures** — a table of known-bad label documents, each asserting the specific finding code and
  citation it should produce.
- **Extraction tests with the model stubbed** — assert that a fixed `ExtractionResult` flows correctly into the
  wizard and that nothing lands as confirmed without an explicit user action. The model's accuracy is a
  separate question from whether the plumbing is correct; test the plumbing deterministically.
- **Refusal-path test** — assert the API returns a clean error rather than throwing when `stop_reason` is
  `"refusal"` and `content` is empty.
- **Accessibility pass** — keyboard-only walk of the editor; contrast-check every ANSI severity pairing against
  the graphite chrome (safety colours are chosen for factory-floor legibility, not for screens, so none of them
  can be assumed to pass); confirm findings announce via `role="alert"`; confirm the canvas text-equivalent
  view lists every element.
- **Responsive check** at 375 / 768 / 1024 / 1440, including the three-pane → segmented-control collapse, and
  with `prefers-reduced-motion` enabled.

---

## Status

| Phase | State |
|---|---|
| 1 · Foundation | **Complete** — 146 tests, CI green; reviewed and remediated |
| 2 · Rendering spine + design tokens | Next |
| 3 · Rule engine + findings rail | Not started |
| 4 · GHS chemical label | Not started |
| 5 · US food label | Not started |
| 6 · Scanning, persistence, catalogue | Not started |
| 7 · Label audit from a photo | Not started |
| 8 · Deployment | Not started |

No AWS resource is provisioned and none should be until phase 8. Phases 1–7 run entirely on localhost.
An Anthropic API key is needed at phase 7 and not before.

## Open items (non-blocking)

- Whether the old `barcode-crud` README should link across to `packwright` as a spiritual successor
- Saved-label cap: the old app capped at 20; 50 is more realistic and still free-tier safe
- `barcode-crud`'s README still cites Railway under Deployment while the workflow deploys to AWS ECS — stale on
  a portfolio-facing doc, worth a one-line fix next time you're in that repo

---

## Repository conventions

This plan creates a new repository. Nothing in `barcode-crud` is modified.

### `CLAUDE.md` — project rules

Committed at the repo root, created in phase 1. It restates the git rule locally rather than relying on the
global one, and encodes the project invariants a fresh session would otherwise violate.

**Git — hard rule**

- Never `git commit`, `git push`, or open a pull request without explicit, per-action approval.
- "Build X" / "fix Y" is **not** approval. It means implement to a reviewable state and stop, leaving the
  changes uncommitted in the working tree.
- Approval is per-action and does not carry over — approving one commit does not authorize the next.
- Drafting a commit message or PR body and proposing it is fine. Running the command is not.
- This includes the repository's very first commit.

**Correctness invariants.** These are what make the project trustworthy, and they are the ones an assistant is
most likely to violate without noticing:

- **Never generate regulatory text.** H- and P-statements, and every other codified string, are looked up from
  the reference tables. A paraphrase produces a non-compliant label.
- **Never author a compliance verdict or a citation from a model.** Findings originate in `rules/` only.
- **Never invent a citation.** If a CFR section or GS1 clause cannot be verified against a source, the rule
  does not ship.
- **Every rule ships with a fixture** — a known-bad document asserting the exact finding code and citation.
- **`label-core` imports no framework.** No Vue, no Express. If a change seems to need one, the boundary is in
  the wrong place.
- **Golden vectors come from source documents**, never hand-computed to match the implementation.

**Stack notes:** Vitest not Jest · npm workspaces · Node 24 · `<script setup>` + Pinia · Tailwind tokens, never
raw hex in components.

### `CHANGELOG.md` — development log

[Keep a Changelog](https://keepachangelog.com) format, created in phase 1 alongside the scaffold.

- Entries accumulate under `## [Unreleased]`, grouped **Added / Changed / Fixed / Removed**
- **Updated as part of the change, in the same edit** — never as a separate pass afterwards, which is exactly
  how changelogs silently fall behind
- No auto-versioning; entries sit under Unreleased until you decide to cut a version
- Deliberately dev-facing. It doubles as a build log, which earns its keep when you return after a gap and
  again when you write the portfolio narrative

```markdown
## [Unreleased]

### Added
- GS1 Digital Link URI builder with convenience alphas (`/gtin/`, `/lot/`, `/ser/`)
- Quiet-zone validator — 9X for UPC-A, 7X general

### Fixed
- PDP area for cylindrical containers used full height instead of 40%
```
