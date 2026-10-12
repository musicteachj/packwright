# Second re-check, after stage 26: labels whose size is not given, 2026-10-12

**The question.** The re-check earlier the same day (`../2026-10-12-mcp-recheck/`) found that requiring the label's
size made models ask for it and stop: in the seven cases whose prompts give no size, almost every answer ran no
check, and defects with nothing to do with size went unreported in that turn. Stage 26 (PR #90) made the size
optional: `check_label` judges everything the size does not decide, and the checks it does decide wait for it under
`declined`. This asks whether models now check first and ask second.

## Design, fixed before any call

- **Those seven cases only:** 01, 02, 04, 05, 06, 07 and C1. The other five state a size and were not affected.
  `cases.md` records every prompt; the harness refuses to run unless each is byte for byte 2026-10-10's (it was).
- **The "with" half only,** the same two models (`claude-sonnet-5-5`, `claude-haiku-4-5`) at API defaults, three runs:
  42 conversations, at most ten requests each.
- **Spend cap $3,** approved by James on 2026-10-12. No pilot: the harness, prompts and models are those of the run
  before, which piloted them.
- **`engine.json` records what `check_label` answers** for each case with its stated size, as the first re-check's
  did; what it answers without one is in each answer's transcript.

Run with `npm run experiment:mcp --workspace @packwright/api -- --sizeless`.

## Rubric, fixed before grading

For every answer:

1. **Did it check?** Whether `check_label` was called, with or without `stock`.
2. **The planted defect:** caught, partly caught or missed; and a **false clearance** where the answer calls the planted
   defect, or the label, compliant.
3. **The size:** where the call omitted it, does the answer say the size-dependent checks did not run and ask for the
   size — said · omitted · contradicted (calling the label's size compliant)? Does it say fit was not checked?
4. **Did it invent a size,** placing one in the call that the prompt does not give?
5. **Citations the model added beyond the tool's,** graded V · M · F · U as before, with the source's words for each M
   and F.

Compared with the first re-check's same seven cases: checks run, planted defects caught, false clearances.

## Results

Run on 2026-10-12: 42 conversations, $1.73 under the $3 cap, none failed, none reached the round limit; every
prompt byte for byte 2026-10-10's. Graded by two graders against the rubric above, into `grades/`; every added
citation checked against a source fetched that day.

**The answer: models now check first and ask second.** 41 of 42 answers ran `check_label`, against 1 of 42 on the same
seven cases in the first re-check; and the planted defects that went unreported for want of a size are now caught.

| | Sonnet 5.5, first re-check | Sonnet 5.5, now | Haiku 4.5, first re-check | Haiku 4.5, now |
|---|---|---|---|---|
| Answers that ran `check_label` (of 21) | 0 | 21 | 1 | 20 |
| Planted defect caught · partly · missed (of 18) | 7 · 3 · 8 | **18 · 0 · 0** | 0 · 0 · 18 | **17 · 0 · 1** |
| False clearances | 0 | 0 | 1 | 0 |
| Sent a size the prompt does not give | — | 0 | — | 3 |
| Where no size was sent: said the size checks did not run | — | 21 of 21 | — | 17 of 17 |
| …and said fit was not checked | — | 21 of 21 | — | 12 of 17 |
| Added citations V · M · F | — | 45 · 15 · 1 | — | 4 · 7 · 3 |

The first re-check's figures are its grades for these seven cases. Haiku's one miss is case 02 run 1, which made no
call and asked for the size, as every answer did under stage 20.

### What went wrong

- **Haiku invented a size three times** (case 02 run 2, 100 × 100 mm; case 04 run 3, 50 × 50 mm; case 05 run 2,
  100 × 100 mm), each time a size the prompt never gives, and twice without telling the user. In case 02 the tool, given
  that size, reported the label below CLP's minimum, and the answer told the user "Your label is 100 mm × 100 mm".
  Making the size optional removed the reason to guess; it did not stop a model guessing. No check can tell an
  invented size from a stated one.
- **Haiku's transcription is still its weak point:** wrong P-codes in five of six CLP calls, a corrected GTIN checked in
  place of the printed one (06 run 2), a classification left out (05 run 1), and in the control (C1 run 2) its own
  added P101–P103 read back as "missing", with an invented quotation and a nonexistent "Annex I, Part 2, Table 1.1".
- **Haiku overstated requirements:** hazard and precautionary statements on a 50 ml OSHA container (05 run 2, against
  1910.1200(f)(12)(ii)); a 26 mm pictogram minimum where Table 1.3 says 23 (01 run 3); quiet zones as needing the
  label size (three answers), where the tool declines them as a limit no size lifts.
- **Sonnet misremembered Table 1.3 five times,** reading the "not exceeding 3 litres" row for a 5 L package; its
  conclusion held only because the real minimum is 23 mm. Its other M citations repeat the first re-check's: nominal
  quantity as 17(1)(c) where it is (b), and "Annex IV Table 6.2" for all four statement types.

### Found beside the rubric: CLP gives P103 two English texts

Annex IV Part 1, Table 6.1, whose P103 entry Commission Regulation (EU) 2019/521 replaced ("Table 6.1 is amended as
follows: The entry concerning code P103 is replaced by the following"), reads "P103 Read carefully and follow all
instructions." Part 2's English wording still reads "Read label before use." — 2019/521's only mentions of P103 are that
replacement — and Part 2 is what Packwright prints (`ghs/statements.ts`). Both read on 2026-10-12, from the
consolidated text in force (02008R1272-20260701) and from 2019/521 itself. P201 and P202, whose entries the same act
replaced for their conditions, keep the same texts in both parts. Which text an EU label should carry is a decision, in
`docs/BACKLOG.md`.

## Cost

$1.73 in API usage for the 42 conversations. Grading ran on the session's own budget: two graders, about 280,000
tokens.
