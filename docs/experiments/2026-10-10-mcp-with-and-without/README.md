# With and without Packwright's tools, 2026-10-10

**The question.** The experiment of 2026-10-09 (`../2026-10-09-mcp-without/`) asked whether a model answering
label-regulation questions alone gets them wrong, and found that it does — confident, specific, wrong law around a
problem it mostly finds. This one asks what changes when the same model has Packwright's four MCP tools: whether
citations, misses and false clearances improve, and what new ways of going wrong the tools bring.

**The answer: the tools help a great deal, and they bring two failures of their own.**

- **Misses and false clearances fall.** With the tools, Sonnet 5.5 caught the planted defect in all 30 answers
  (27 without) and cleared no defective label (2 without). Haiku 4.5 went from 5 caught to 21, and from 10 false
  clearances to 5.
- **Wrong law falls, but not to zero.** Sonnet answers carrying a wrong or nonexistent citation went from 33 of 36 to
  20, and those citing a provision that does not exist from 14 to 5. Haiku went from 36 to 7, and from 12 to 0.
- **The new failure is the description.** A model has to turn the label into `check_label`'s input, and Haiku got
  it wrong in 30 of its 36 answers. In 9 the error decided the planted verdict, including three false clearances
  on case 09, where it invented a "Contains: almonds" statement the label does not carry and the tool, correctly,
  cleared what it was given. Sonnet erred in 10 answers; in 3, all on case 07, an early call's error hid the planted
  defect until Sonnet corrected it, and it caught the defect in all 30.
- **And the engine judges its own drawing where the input cannot carry a fact.** Three ways, all found by grading
  and confirmed against the code: a label size nobody gave is defaulted and then *passed*; every GHS label gets a
  "pictogram with no symbol" finding, because Packwright draws no pictogram artwork; and text laid out at the
  engine's own type size is reported "not printed". The first is a false-clearance mechanism — case 03's
  too-small label, sent without its size, passes the size rule.

The design and the rubric below were written before any answer was read; the results follow them.

## Design

Stage 19 of `docs/plans/2026-10-10-mcp.md`. The same twelve labels, the same question, the same two models, three
runs each — in two halves:

- **Without:** exactly the experiment of 2026-10-09: one message, no system prompt, no tools. **Rerun, not reused:**
  since 2026-10-09 the engine prints "Includes 0g Added Sugars", so the four food prompts differ from those sent
  then (`cases.md` here, against `../2026-10-09-mcp-without/cases.md`: that line, and nothing else), and pairing new
  "with" answers with old "without" ones would compare two different labels.
- **With:** the same message, plus what an MCP client hands a model — the four tools exactly as `tools/list` gives
  them (name, description, input schema) and the server's `instructions` as the system prompt, as Claude's apps
  pass them on. Each call runs against the in-process MCP handler, the same one `/mcp` mounts, speaking the
  older protocol Claude's clients use. The model has to turn the printed label into `check_label`'s input itself,
  which is what a user's own assistant would have to do.

Fixed before running:

- **Models** `claude-sonnet-5-5` and `claude-haiku-4-5` at API defaults, as on 2026-10-09. No refusal fallback, so
  every answer is the named model's.
- **At most ten requests** per answer, so nine rounds of tool results. A conversation still calling tools at the
  tenth request is recorded as it stands and marked `turnLimitReached`. (None was: the most any answer used is
  recorded with the results.)
- **Spend cap $8** across both halves (the plan's $5–8). A four-conversation pilot on case 08 cost $0.21.
- Every conversation is in `responses.jsonl`; the "with" half's carries its full transcript and every tool call,
  with the arguments the model sent and the text it got back.

## Rubric, fixed before grading

**For every answer, as on 2026-10-09** (`../2026-10-09-mcp-without/README.md` § How it was graded): the planted
defect caught, partly caught or missed; a false clearance where the answer calls the planted defect, or the
label, compliant; every citation **V** (exists and says it), **M** (exists, does not say it), **F** (does not
exist) or **U** (could not be verified); every other claim of a requirement real, not real or unclear. Each M and F
carries the source's own words.

**For every "with" answer, in addition:**

- **Tool use.** Whether `check_label` was called, how many times, and how many calls the schema refused.
- **Transcription.** Every place the arguments sent to `check_label` misstate the label as the prompt describes
  it — a fact invented, changed or dropped — and whether that error changed the tool's verdict on the planted
  defect. The Haiku pilot is the example that prompted this: it sent "whole grain rolled oats" as a wheat
  allergen, and the tool, correctly for what it was given, reported an undeclared allergen.
- **Relay.** For each finding the tool returned that is not a pass: reported as the tool gave it, reported wrongly,
  or dropped. And whether the answer said that a clean report is not a statement of compliance, or what the tool
  does not check.
- **Where each error came from.** Every wrong conclusion is attributed to one of: the **engine** (the tool's own
  verdict was wrong on what it was given), the **transcription** (the model gave the tool a different label), or
  the **model** (a claim the tool's answer did not support). An engine error is a defect in Packwright, and goes to
  `docs/BACKLOG.md` with its evidence.

## Sources

The 2026-10-09 grading fetched every source it relied on and recorded each M and F with the source's words
(`../2026-10-09-mcp-without/grading.md`). Graders here may reuse a verdict recorded there for the identical
reference and claim; any reference not graded there is fetched afresh, from the primary source, in the session
that grades it.

## Results

Every figure is from `tally.py`, which builds `grading.md` from the per-answer grades in `grades/`.

| | Sonnet 5.5, without | Sonnet 5.5, with | Haiku 4.5, without | Haiku 4.5, with |
|---|---|---|---|---|
| Planted defect caught (of 30) | 27 | **30** | 5 | **21** |
| Partly · missed | 1 · 2 | 0 · 0 | 3 · 22 | 0 · 9 |
| False clearances | 2 | **0** | 10 | **5** |
| Answers with an M or F citation (of 36) | 33 | **20** | 36 | **7** |
| Answers citing a provision that does not exist (of 36) | 14 | **5** | 12 | **0** |
| Citations V · M · F · U | 396 · 112 · 29 · 31 | 366 · 28 · 5 · 0 | 25 · 110 · 16 · 2 | 93 · 7 · 0 · 0 |
| Claims of a requirement that does not exist | 33 | 14 | 93 | 57 |

The "without" half repeats 2026-10-09 closely — Sonnet caught 26 of 30 then and 27 now, Haiku 3 then and 5 now —
so the comparison is between the halves of this run, not with the earlier one.

**Where the remaining wrong citations come from.** Of the 20 Sonnet "with" answers carrying an M or F, about 13
carry one of the model's own; the other seven only repeat a citation the tool returned and the grader marked M —
mostly `GHS_PICTOGRAM_NOT_REQUIRED`'s Annex V, and the %DV pass citing only 101.9(d)(7)(ii) where four of its eleven
percentages are governed by (c)(8)(iii). (Matched by reference text, so approximate.) Those seven are Packwright's
errors, not the model's, and are in `docs/BACKLOG.md`.

### How the tools were used

| | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|
| `check_label` calls · refused by the schema | 45 · 0 | 40 · 4 |
| Answers with a transcription error | 10 of 36 | 30 of 36 |
| …where one changed the tool's verdict on the planted defect, in some call | 3 | 9 |
| Tool findings relayed faithfully · wrongly · dropped | 61 · 0 · 0 | 56 · 1 · 0 |
| Answers saying a clean result is not compliance | 36 of 36 | 31 of 36 |
| Wrong conclusions from the engine · the transcription · the model | 13 · 0 · 29 | 26 · 29 · 22 |

Every answer called `check_label`; none needed more than four requests. Models relay what the tool says almost
perfectly — the risk is upstream of the tool, in what they tell it, and in what the tool says about facts it was
never given.

### Transcription, by example

- **Case 09, Haiku, all three runs:** `containsStatement: ["tree-nuts"]` on a label whose only "Contains" is
  "Contains 2 percent or less of sugar, salt" — the ingredient threshold, not an allergen statement. The engine
  drew "Contains: almonds", passed the allergen rule, and run 1 told the user "Allergen declaration (almonds) ✓".
- **Case 07:** every first attempt that included a Digital Link sent its `domain` as `id.example.com`, with no
  scheme, which the rule rightly refuses before it reaches the planted defect. Sonnet fixed it by its third call
  each time; Haiku never did, and also left out `useConvenienceAlphas`, without which the defect cannot show. The
  schema field is called `domain` and describes nothing.
- **Case 08, Haiku run 1:** the ingredients sent in recipe order and the oats tagged as wheat; the tool reported
  an undeclared wheat allergen, which is right for what it was given and wrong for the label.

### The engine, judging its own drawing

All four confirmed by the lead against the code and the record; each is in `docs/BACKLOG.md`.

1. **A label size nobody gave is passed.** With no `stock`, `toJudgeRequest` uses the label type's default — right
   for an export, which draws at that size, wrong for a check, which is about the user's label. All 18 EU calls that
   omitted it got `GHS_LABEL_SIZE_MET`, "The label is 74.00 mm × 105.00 mm", and by the graders' count seven Haiku
   and five Sonnet answers presented that as the user's own label size. Case 03's 50 × 70 mm label, sent without its size, passes; sent with it, it
   fails as planted.
2. **Every GHS pictogram has "no symbol".** Packwright has no verified pictogram artwork and draws empty frames;
   `GHS_PICTOGRAM_SYMBOL_MISSING` then fires on every GHS label — blocking under OSHA. The report also lists the
   symbol as not drawn, but the finding is scored as a violation of the user's label. All eighteen Haiku GHS
   answers relayed it as a real defect; all eighteen Sonnet answers recognised it as the tool's.
3. **Text at the engine's own size is "not printed".** The input has no type sizes for a GHS label, so case 03's
   text was laid out at the engine's default and overran; the precautionary statements and supplier were reported
   not printed, and every "with" answer told the user so, although the prompt says each line is printed.
4. **`GHS_PICTOGRAM_NOT_REQUIRED` misstates its reason** (case 01): "no hazard class declared for this product
   requires it", under Annex V — but Annex V assigns GHS07 to the declared skin irritation; Article 26 precedence
   is what removes it. The website shows the same finding.

**Fixed since, on 2026-10-10:** 1 and 4. `check_label` now refuses a label whose size it is not told, and says back
the size it judged; `GHS_PICTOGRAM_NOT_REQUIRED` cites the Article 26 clause where that is the reason. The answers
above were given before either change. 2 and 3 are open, in `docs/BACKLOG.md`.

### Corrections made in grading

- **One grader's F was wrong.** "Annex IV (Table 1.2)" was graded F as not existing; Annex IV Part 2 does have a
  Table 1.2 (the language versions of the prevention statements). The lead re-read it and regraded M, since it
  does not say what the answer claimed; the grade carries `leadCorrected`.
- **Two verdicts in the 2026-10-09 grading are wrong.** Sonnet's "Art. 4" citations on C1 (runs 2 and 3) were
  graded M as "Art. 4 says nothing about establishment"; Article 4(11) reads "a supplier established in the Union,
  which shall be identified on the label". They are V. Both answers carry other M citations, so that record's
  headline is unchanged; an erratum is in its README.
- **The lead's checks:** every distinct F reference re-read in sources fetched by the lead (one corrected, above);
  a seeded sample of eight M verdicts re-read (all held); every Federal Register page cited in evidence confirmed
  as fetched and read; and the four engine claims above reproduced from the code and the record.

### Grading notes

Six graders (Claude Opus 5.5), each given both halves of two cases so that any judgement call falls the same way
on both sides. 66 verdicts reuse the 2026-10-09 grading for an identical reference and claim; everything else was
fetched in the session. Judgement calls are in each answer's `notes`. U verdicts are mostly UN GHS, transport
(ADR/IMDG/IATA) and ISO barcode standards, which could not be fetched.

## Cost

$5.28 in API usage for the 144 conversations (`responses.jsonl`'s `usage`, at $2/$10 and $1/$5 per million
tokens), under the $8 cap. Grading ran on the session's own budget: six graders, about 1.5 million tokens.

## Limitations

- **One question shape, twelve labels, three runs** — evidence for a decision, not a benchmark.
- **The labels are the engine's own fixtures**, so every planted defect is one Packwright checks; a defect it does
  not check would show the tool's other edge, which `WHAT-IS-NOT-CHECKED.md` describes but this does not measure.
- **No system prompt in the "without" half**, as before; the "with" half carries the server's instructions, which
  is what an MCP client gives a model, and is part of what is being measured.

