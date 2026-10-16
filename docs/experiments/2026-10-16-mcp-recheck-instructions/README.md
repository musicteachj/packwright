# Third re-check: telling the model never to invent a label size, 2026-10-16

**The question.** In the second re-check (`../2026-10-12-mcp-recheck-sizeless/`), Haiku 4.5 sent `check_label` a label
size the prompt never gave in 3 of 21 answers, twice without telling the user, and the tool judged the invented
size as if it were real. `check_label`'s description already said to leave the size out rather than guess. The
server's `instructions`, which a client puts in front of the model as its system prompt, now say it too:

> Never send check_label a label size the user did not give: it judges whatever size it is sent as the real label's,
> and cannot tell an invented size from a stated one. When checking a label whose size the user has not given, call
> check_label without `stock`, report what it found, and only then ask for the size that the checks under `declined`
> are waiting for.

This asks whether Haiku invents fewer sizes, and whether the sentence sends either model back to asking instead of
checking, which is what stage 20's "ask rather than guess" did (43 of 72 answers in the first re-check asked and
checked nothing).

## Design, fixed before any call

- **The same seven cases** as the second re-check: 01, 02, 04, 05, 06, 07 and C1, whose prompts give no size.
  `cases.md` records every prompt; the harness refused to run unless each was byte for byte 2026-10-10's (it was).
  `engine.json`, what `check_label` answers for each case at its stated size, is byte for byte the second re-check's.
- **What changed since the second re-check:** the server's `instructions` above, and nothing else a model sees. A
  sentence for `ghs_statement_text`'s description, on which part of CLP Annex IV a statement's wording comes from,
  was written in the same stage and held out of this run so that the run measures one change; it was added after.
  Eight CLP precautionary statements lost a stray space in #93; none of the seven prompts depends on them.
- **Haiku 4.5 six times, Sonnet 5.5 once:** 49 conversations, the "with" half only, at API defaults, at most ten
  requests each. Haiku is the model that invented sizes; six runs give 42 answers against the baseline's 21. Sonnet
  runs once as a guard on the order "check first, ask second".
- **Spend cap $2,** approved by James on 2026-10-16. Estimated at $1.30 from the second re-check's usage (about
  $0.02 an answer for Haiku, $0.06 for Sonnet). No pilot: harness, prompts and models are the second re-check's.
  The harness checks the cap before starting each conversation, with four in flight at once, so spend could pass
  it by up to four conversations, about $0.30 at the worst seen; at the estimate it is not reached.

Run with `npm run experiment:mcp --workspace @packwright/api -- --instructions`.

## Rubric, fixed before grading

For every answer:

1. **Did it invent a size?** Any `stock` in a `check_label` call is invented, since no prompt gives a size and no
   conversation has a second user turn. Read from `toolCalls`. Where one was sent, did the answer tell the user it
   was assumed?
2. **Did it check?** Whether `check_label` was called at all.
3. **Where no size was sent:** does the answer say the size-dependent checks did not run, and ask for the size?
4. **The planted defect:** caught, partly caught or missed; and a **false clearance** where the answer calls the
   planted defect, or the label, compliant.

Citations the models add are not graded this time: the question is the size, and the second re-check graded them.
Compared with the second re-check's same seven cases.

## Results

Run on 2026-10-16: 49 conversations, $1.34 under the $2 cap, none failed, none reached the round limit; every prompt
byte for byte 2026-10-10's. Items 1 and 2 were read from `toolCalls` by script (the same script gives the second
re-check's 3 of 21 exactly); items 3 and 4 by one grader, into `grades/all.json`, with every false clearance and
every invented value below checked against the record by the lead.

**The answer: Haiku stopped inventing the label size, and neither model went back to asking instead of checking.**

| | Haiku 4.5, second re-check | Haiku 4.5, now | Sonnet 5.5, second re-check | Sonnet 5.5, now |
|---|---|---|---|---|
| Answers | 21 | 42 | 21 | 7 |
| Sent a size the prompt does not give | 3 | **0** | 0 | 0 |
| Ran `check_label` | 20 | **42** | 21 | 7 |
| Asked for the size instead of reporting findings | not graded | 0 | not graded | 0 |
| Said the size checks did not run, and asked for the size | 17 of 17 | 41 of 42 | 21 of 21 | 7 of 7 |
| …and said fit was not checked | 12 of 17 | 36 of 42 | 21 of 21 | 7 of 7 |
| Planted defect caught · partly · missed | 17 · 0 · 1 (of 18) | 33 · 0 · 3 (of 36) | 18 · 0 · 0 | 6 · 0 · 0 (of 6) |
| False clearances | 0 | **2** | 0 | 0 |

Zero invented sizes in 42 against 3 in 21: if the rate were unchanged, a run this clean would happen about one time
in thirty (Fisher's exact test, one-sided, p ≈ 0.033). The instruction is doing what it was written for. Sonnet's one
run is a guard, not a measurement: it kept the order, findings first and the size request after, in all seven.

### What went wrong

- **Two false clearances, both from transcription, on case 07.** The label's QR code prints a Digital Link with the
  convenience alpha `/gtin/`. In run 1 Haiku sent no `useConvenienceAlphas` and in run 3 sent `false`, so the tool
  built and passed a `/01/` link, and both answers told the user the QR code was compliant ("Good news: your barcode
  and QR code are compliant with what Packwright can verify"). All six of 07's answers in the second re-check, three from
  each model, sent `true`. Two of six Haiku answers here against none of three there is too few to say whether the
  instruction caused it; the sentence names
  only the size, and in the same case Haiku did send a value the prompt does not give (below).
- **Haiku invented a barcode magnification in two answers** (07 runs 2 and 5): it sent `magnification: 1`, which no
  prompt gives, and reported "within the permitted range at 1.00x" as a pass without saying it was assumed. This is
  the size failure moved to an input the instruction does not name, and `check_label` judges a stated magnification
  as stated, as it must. None of the second re-check's six 07 answers sent a magnification.
- **Haiku's transcription is still its weak point.** Five of six control answers (C1) accuse the conformant label of
  something, mostly by reading back precautionary codes it had transcribed wrongly itself; none calls it compliant,
  and the tool reported no failures in any. It still quotes wrong figures beside the tool's (a "52 mm × 74 mm" minimum
  for a 5 L container; pictogram minimums of 25, 38 and 40 mm). Case 02 run 3 sent only "Danger", so the conflict was
  never checked, and the answer opened "Good news: the checks that ran found no failures".
- **One answer said fit was not checked but never asked for the size** (04 run 1).

## Cost

$1.34 in API usage for the 49 conversations. Grading ran on the session's own budget: one grader, about 150,000
tokens.
