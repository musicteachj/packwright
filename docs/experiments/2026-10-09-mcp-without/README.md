# The MCP "without" experiment, 2026-10-09

**The question.** Packwright as an MCP server (`docs/ideas/2026-10-08-mcp-server.md`) is only worth building if an
AI answering label-regulation questions alone gets them wrong: invents or misplaces citations, misses problems,
or calls a bad label compliant. This experiment asked before anything was built.

**The answer: it confirms the case.** Under the decision rule fixed before any call was made, Claude Sonnet 5.5
meets two of the three conditions, and either alone would have been enough:

- **31 of its 36 answers (86%) carry a citation that is wrong.** The rule's threshold was 20%. "Wrong" means the
  provision does not say what the answer claims, or does not exist.
- **It called a defective label compliant three times.** All three runs of the GS1 Digital Link case opened
  with "Nothing on this label is non-compliant" about a URI using a path segment the standard has removed.

It caught the planted defect in 26 of 30 answers, so the third condition — missing 20% or more — was not met. That
is the shape of the result: **the stronger model mostly finds the problem, and then surrounds it with confident,
specific, wrong law.** Claude Haiku 4.5 missed 24 of 30 and called a defective label compliant 15 times.

## Design

Agreed with James before running; the plan is recorded in the session and summarised here.

- **Twelve labels**: ten known-bad, each a conformant fixture with one rule fixture's defect planted in it, and
  two conformant controls. Every prompt is in [`cases.md`](cases.md), exactly as sent. The printed text was read
  off the engine's own layout rather than written by hand, so a model saw what Packwright prints.
- **One prompt shape**, no system prompt, no tools: *"I'm preparing this label for sale in {market}. Here is
  everything printed on it … Is anything missing or non-compliant? For each problem, tell me which regulation or
  standard requires it."*
- **Two models at API defaults**: `claude-sonnet-5-5` (adaptive thinking, effort `high`) and `claude-haiku-4-5`
  (no thinking). Three runs each: 72 calls. Raw responses in [`responses.jsonl`](responses.jsonl); the engine's
  own findings on each document in [`engine.json`](engine.json).
- **Ground truth** is each fixture's expected code and citation, written from the regulation when the rule was.
  The harness (`apps/api/src/experiments/withoutTool/`) refused to start unless the engine still raised each one.

### The decision rule, fixed before running, read off Sonnet 5.5

- **Confirms the case** if any of: an F or M citation in ≥ 20% of responses; the planted defect missed in ≥ 20%
  of defect responses; any false clearance.
- **Rethink before building** if: caught in ≥ 90%, ≥ 95% of citations verified, and no false clearance.
- **Otherwise** James decides from the numbers.

### Departures from the agreed plan

- **One case swapped.** "The environment pictogram on a US label" was dropped: `docs/BACKLOG.md` records that
  whether it is a violation is open, so it cannot be ground truth. "A container too large for the provision it
  claims" (29 CFR 1910.1200(f)(12)) took its place.
- **The two barcode cases are described from the document.** The engine refuses to draw a UPC-A with a wrong
  check digit and draws no carrier for a Digital Link, so its layout had nothing to show. Each case's note in
  `cases.md` says where its prompt departs from the drawing.
- **The recipe was removed from three food cases after the pilot.** The panel is 101.9(d)(8)'s worked example,
  sodium 0 mg among it; a stated 1% of salt contradicted it, so the control carried a defect the experiment had
  put there. Case 08 keeps its recipe — its defect cannot be seen without one — and its prompt did not change.
  **So case 08 still carries a second, unplanted defect:** 0.7% salt beside "Sodium 0mg", 2% sugar beside "Added
  Sugars 0g". Answers flagging it are graded real; it competes with the planted one, and Haiku led with it in
  two of its three runs, missing the order in all three.
- **The prompt was not recorded with each response.** Haiku's case 08 run 1 is the pilot's call, made before the
  recipes were removed from other cases and reused by the resume. Its 419 input tokens equal those of Haiku's
  later case 08 runs, as Sonnet's 559 equal each other, and no edit after the pilot touched case 08 — evidence
  rather than proof. The runner now records a SHA-256 of each prompt and refuses to resume over a changed one.
- **Grading was done by five agents** (Claude Opus 5.5), one per regulatory domain, against a written rubric and
  the primary-source texts fetched for this experiment, then checked by the lead (below).

## Results

| | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|
| Planted defect caught (of 30) | **26** | 3 |
| Partly | 1 | 3 |
| Missed | 3 | 24 |
| False clearances | **3** | 15 |
| Answers with an F or M citation (of 36) | **31** | 36 |
| Answers citing a provision that never existed (of 36) | 6 | 12 |
| Citations: verified · misattributed · nonexistent · unverifiable | 380 · 111 · 28 · 47 | 28 · 108 · 21 · 5 |
| Claims of a requirement that does not exist | 43 | 82 |
| …of them on the two controls | 11 | 22 |

Per case and every M and F with the source's words: [`grading.md`](grading.md). Per answer: [`grades/`](grades/).

**Of Sonnet's 28 nonexistent citations, 20 are 21 CFR 101.105** — a real section until 2016 ("Declaration of net
quantity of contents when exempt", in the April 2016 annual CFR on govinfo, absent from April 2017 onward; the
eCFR's record from 2016-12-19 never has it). They are stale rather than invented, and `grading.md` marks them
"F (removed)". Leaving them out changes nothing: 31 of 36 Sonnet answers still carry an M or a never-existing F.

### What the errors look like

Every example below was read in the response by the lead, not only by a grader.

- **Clearing what the standard removed.** Case 07, Sonnet, all three runs: *"the `/gtin/` path segment is the
  correct application identifier key."* GS1 Digital Link URI Syntax 1.7.0 §4.1: convenience alphas *"have been
  removed completely as of version 1.3.0."*
- **Denying a provision exists.** Case 05, Sonnet: *"OSHA's HazCom standard has no such provision"* (run 1);
  *"HazCom has no small-container exemption"* (run 2).
  29 CFR 1910.1200(f)(12) is exactly that provision. It still caught the missing phone number, citing the
  general (f)(1) instead.
- **The wrong row of a table, as compliance.** Five of six Sonnet answers to cases 01 and 02 gave a 5-litre
  package the minimums for 3 litres or less (52 × 74 mm label, 16 × 16 mm pictogram). CLP Annex I 1.2.1.4,
  Table 1.3: over 3 L up to 50 L, *"At least 74 × 105"* and *"At least 23 × 23"*. One listed it under "Compliant
  as shown". That advice clears case 03's planted defect.
- **Correcting a value that is right.** 11 of the 12 Sonnet food answers said potassium 235 mg should be 5%,
  not 6%.
  101.9(c)(8)(iii) rounds to *"the nearest 2-percent increment up to and including the 10-percent level"*, and
  101.9(d)(8) itself prints *"Potassium 235 mg 6%"*. One answer cited (c)(8)(iii) while getting it wrong.
- **Inventing wording.** 11 of the 12 Sonnet food answers required "(DV)" in the footnote. 101.9(d)(9)
  prescribes it verbatim, without; four times the citation was to a (d)(9)(i) or (iii) that does not exist.

### What the models got right that Packwright does not check

Sonnet raised three real requirements on labels the engine passes. They are reasons the MCP answer must say
what was not checked — and two are findings about Packwright, now in `docs/BACKLOG.md`:

- **The engine prints "Added Sugars 0g".** 21 CFR 101.9(c)(6)(iii): it *"shall be prefaced with the word
  'Includes'"*. Every US food label Packwright draws has this defect.
- **An EU label must identify a supplier established in the Union.** CLP Article 4(11), applicable from
  1 July 2026: *"a supplier established in the Union, which shall be identified on the label"*. The cases used a
  Leeds supplier, as `GHS_CONFORMANT` does. Nothing checks this.
- **A UFI.** CLP Article 25(7) and Annex VIII Part A §5 — where the mixture is subject to Annex VIII. Nothing
  checks this.

## How it was graded, and how far to trust it

- **The rubric was written before grading**: planted caught / partly / missed; false clearance; every citation V
  (exists and says it), M (exists, does not say it — wrong paragraph, wrong figure, *should* as *shall*), F (does
  not exist), U (could not be verified); every other claim real / not real / unclear.
- **Sources, all fetched on 2026-10-09:**
  - CLP consolidated **02008R1272-20260701**, the version in force, from the EU Publications Office as XHTML
    (`http://publications.europa.eu/resource/celex/02008R1272-20260701`). EUR-Lex now answers automated requests
    with its home page. Graders also fetched 2024/2865, 2025/2439 and the 2027-01-01 consolidation.
  - 21 CFR 101.x and 29 CFR 1910.1200 from the eCFR API; the annual CFR on govinfo for 101.105's history.
  - 15 U.S.C. 1453 and 21 U.S.C. 343 from govinfo (USCODE-2023).
  - GS1 General Specifications Release 26.0 (PDF, ref.gs1.org; quoted pages rendered and read) and GS1 Digital
    Link URI Syntax 1.7.0 (ref.gs1.org, HTML).
- **This is a model grading a model.** What makes it checkable is that every M and F carries the source's words
  or a description of what is actually at that location. The lead re-read in the responses every example above,
  verified every planted citation and every Sonnet F against the source, and re-checked a random sample of
  eight Sonnet M verdicts: all eight held.
- **One grader invented a citation of its own.** It explained 101.105's removal as "by 81 FR 59129, 2016"
  without having read it; its fetch had returned *"No matching content found."* It was replaced with what was
  verified. That is the failure this experiment measures, made by the instrument measuring it.
- **Judgement calls are recorded in each answer's notes.** One was normalised across graders: "8 servings" for
  340 g at 40 g is *unclear* — exactly 8.5 on the printed 340 g, a tie 101.9(b)(8)(i) does not break.
- M includes near-misses as well as wrong law: a correct figure cited to the neighbouring paragraph is M by the
  rubric. `grading.md` lists every one, so the reader can weigh them.

## Limitations

- **No system prompt and no web search.** A chat product's own system prompt, or web search switched on, could
  change answers either way.
- **The prompt asks for the regulation**, which pushes a model towards citing — and is what the MCP case rests on.
- **Three runs of twelve cases** is evidence for a decision, not a benchmark.
- The labels carry the engine's limits: case 03's text overruns its 50 × 70 mm label; case 09 prints no
  "Contains" line; the EU labels carry a non-EU supplier. Each is noted, and graded as a real defect where it is.

## Cost

$2.11 in API usage: Sonnet 5.5 $2.02, Haiku 4.5 $0.09 (36 calls each), from each response's `usage` at $2/$10
and $1/$5 per million tokens. Sonnet's calls ran from $0.02 to $0.10, most of it thinking. The script's cap was $6.

## Re-running

`npm run experiment:without --workspace @packwright/api -- --describe` is free and rewrites `cases.md` and
`engine.json`. `--pilot` and `--full` make billed calls and append to `responses.jsonl`, skipping any already
recorded.
