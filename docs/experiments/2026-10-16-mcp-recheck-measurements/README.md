# Fourth re-check: naming every value the tool takes on trust, 2026-10-16

**The question.** The third re-check (`../2026-10-16-mcp-recheck-instructions/`) found that telling the model never
to send a label size the user did not give worked for the size: Haiku 4.5 sent none in 42 answers, against 3 in 21
before. But in two answers it sent `magnification: 1`, which no prompt gives, and `check_label`, which judges a stated
magnification as stated, passed it. The server's `instructions` now name every value `check_label` takes on trust:

> Never send check_label a measurement or fact about the label that the user did not give: its size or margin; a
> barcode's magnification, its bar height, or whether its digits are printed; a food's reference amount, what its
> package or a unit holds, whether its units are packaged and sold individually, what a Nutrition Facts column is per,
> or an ingredient's percentage by weight. check_label judges whatever it is sent as the real label, and cannot tell an
> invented value from a stated one; a default of 1 for the magnification is as invented as any other. Do transcribe
> everything the user does give, the classification, statement codes and ingredient names included. Leave the rest
> out, call check_label, report what it found, and only then ask for what the checks under `declined` are waiting
> for, and for the margin if the answer says it assumed one.

`check_label`'s own description says the same in brief, for a client that does not pass the instructions on: "The
same holds for every other measurement or fact about the label the user did not give, a barcode's magnification and
bar height among them: leave it out rather than guess, and the check it decides waits under `declined` instead of
being judged on a value nobody stated."

This asks whether Haiku stops inventing a magnification or bar height, whether the size result holds, and whether
either model goes back to asking instead of checking.

## Design, fixed before any call

- **The third re-check's design exactly:** the same seven cases (01, 02, 04, 05, 06, 07 and C1), whose prompts give no
  size, magnification or bar height; Haiku 4.5 six times and Sonnet 5.5 once, 49 conversations, the "with" half only,
  at API defaults, at most ten requests each. `cases.md` records every prompt; the harness refused to run unless each
  was byte for byte 2026-10-10's (it was). `engine.json` is byte for byte the third re-check's.
- **What changed since the third re-check:** the sentence on values in the instructions above, and the matching
  sentence in `check_label`'s description, measured together as one change: both say the same thing to the same
  model. The rest of the instructions are word for word the third re-check's. `ghs_statement_text`'s description
  gained a sentence in #94 after the third re-check ran; only a model that calls that tool sees it.
- **Spend cap $2,** approved by James on 2026-10-16. Estimated at $1.35, the third re-check's cost. The harness checks
  the cap before starting each conversation, with four in flight, so spend could pass it by up to about $0.30.

Run with `npm run experiment:mcp --workspace @packwright/api -- --measurements`.

## Rubric, fixed before grading

For every answer:

1. **Did it invent a value?** Any `stock` (size or margin), `magnification` or `barHeightMm` in a `check_label` call
   is invented, since no prompt gives one and no conversation has a second user turn. Read from `toolCalls`. (Every
   GS1 prompt says the digits are printed beneath the barcode, so `omitHri: false` is stated, not invented.)
2. **Did it check?** Whether `check_label` was called at all, and whether the answer asked for a value instead of
   reporting findings.
3. **Where a value was left out:** does the answer say the checks waiting on it did not run, and ask for it?
4. **The planted defect:** caught, partly caught or missed; and a **false clearance** where the answer calls the
   planted defect, or the label, compliant.

Compared with the third re-check, whose answers are re-scored on item 1 by the same script.

## Results

Run on 2026-10-16: 49 conversations, $1.35 under the $2 cap, none failed, none reached the round limit; every prompt
byte for byte 2026-10-10's. Item 1 was read from `toolCalls` by script, which gives the third re-check's two invented
magnifications exactly; items 2 to 4 by one grader, into `grades/all.json`. Every invented value, every answer that ran
no check and every false clearance below was checked against the record by the lead.

**The answer: naming the values stopped the invented magnification and cost more than it saved.**

| | Haiku 4.5, third re-check | Haiku 4.5, now | Sonnet 5.5, third | Sonnet 5.5, now |
|---|---|---|---|---|
| Answers | 42 | 42 | 7 | 7 |
| Ran `check_label` | 42 | **39** | 7 | 7 |
| Asked for a value instead of reporting findings | 0 | **3** | 0 | 0 |
| Sent an invented size | 0 | 1 | 0 | 0 |
| Sent an invented magnification or bar height | 2 | **0** | 0 | 0 |
| Planted defect caught · partly · missed | 33 · 0 · 3 (of 36) | 31 · 0 · 5 (of 36) | 6 · 0 · 0 | 6 · 0 · 0 |
| False clearances | 2 | 3 | 0 | 0 |
| Where no size was sent: said the size checks did not run, and asked | 41 of 42 | 33 of 38 | 7 of 7 | 7 of 7 |

No judged call carried a magnification or bar height. (One call in 07 run 5 sent both as `null`, was refused by the
schema, and the retry left them out.) But three Haiku answers asked for the size before checking anything, the
regression this run was set up to watch for: 02 run 5 and 07 run 1 made no call at all ("I need one more piece of
information before I can run the full compliance check: What are the width and height of your printed label in
millimetres?"), and 06 run 5 ran only `check_gtin`, reported the wrong check digit, then asked for the size,
magnification and bar height. Two of the three missed their planted defect. 05 run 3 sent a 50 × 50 mm size, and said
so ("I assumed a 4 mm margin and estimated your label size (50×50 mm) since you didn't specify one"). Five answers said
fit was not checked without asking for the size, against one before, four of them on the OSHA cases.

Every one of these counts is small, and none of the differences is significant on its own (three answers asking first
against none: Fisher's exact test, one-sided, p ≈ 0.12). Read together they point one way: the longer list, with its
food facts and its margin, made Haiku more inclined to ask, which is what stage 20's wording did. The magnification
fix was bought with missed defects.

### The false clearances are not the instruction's

All five false clearances across the two runs are Haiku on case 07, and all come from transcription: the QR code
prints `https://id.example.com/gtin/00036000291452`, and the model sent `useConvenienceAlphas: false` (run 2) or left
it out (runs 3 and 4), so the tool built and passed a `/01/` link, and the answer said "Good news". Run 3 even noticed
("the /gtin/ path in your description was automatically standardized to /01/") and called the link compliant. Three of
six here, two of six in the third re-check, none of six in the second. Nothing in either instruction touches this
field; the request shape asks the model to infer a boolean from the printed URI rather than pass the URI.

### What else the grader recorded

Haiku's false findings on the conformant control label fell from 5 of 6 answers to 3 of 6, still mostly from statement
codes it transcribed wrongly itself. Haiku and, hedged as a recollection, Sonnet still quote wrong CLP minimum label
sizes for a 5 L container beside the tool's answers. Sonnet kept the order (check, report, then ask) in all seven
answers, and asked for the magnification and bar height on both GS1 cases after reporting.

## Decision

**Not shipped.** James decided on 2026-10-16 to keep the third re-check's instruction, which names only the label
size, and to drop the wording tested here: it stopped the invented magnification and cost more in answers that asked
instead of checking. The instructions and `check_label` description quoted at the top of this record were never
merged; `docs/BACKLOG.md` records them. Both remaining failures go to the tool instead of the prompt: the Digital
Link input should take the URI as printed, so no model has to infer `useConvenienceAlphas`, and the magnification and
bar height fields should say at the point of use that they are sent only when the user stated them. One re-run of
this design would measure both.

## Cost

$1.35 in API usage for the 49 conversations. Grading ran on the session's own budget: one grader, about 150,000
tokens.
