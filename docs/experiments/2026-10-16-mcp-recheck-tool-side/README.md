# Fifth re-check: the fixes in the tool rather than the prompt, 2026-10-16

**The question.** The third and fourth re-checks (`../2026-10-16-mcp-recheck-instructions/`,
`../2026-10-16-mcp-recheck-measurements/`) left two failures, and showed the prompt was the wrong place for both.
Haiku 4.5 sent an invented `magnification: 1`, which `check_label` judges as stated; naming it in the server's
instructions stopped that and sent Haiku back to asking instead of checking. And all five false clearances across
the two runs were Haiku on case 07, inferring `useConvenienceAlphas` from a printed `https://…/gtin/…` URI and
getting it wrong, after which the tool built and passed a `/01/` link the label does not carry. James decided to
keep the size-only instruction and fix both in the tool. This asks whether the tool-side fixes hold without the
prompt costing anything.

## Design, fixed before any call

- **The third re-check's design exactly:** the same seven cases (01, 02, 04, 05, 06, 07 and C1), Haiku 4.5 six times
  and Sonnet 5.5 once, 49 conversations, the "with" half only, at API defaults, at most ten requests each.
  `cases.md` records every prompt; the harness refused to run unless each was byte for byte 2026-10-10's (it was).
  `engine.json` is byte for byte the third and fourth re-checks': it is built from each case's document, and case
  07's document still configures its link from a domain, which the rule judges to the same advisory.
- **What changed since the third re-check, all in `check_label`'s input schema;** the server's instructions are
  word for word the third re-check's:
  - `data.digitalLink` is `{ uri }`, the link exactly as printed ("Do not correct or rebuild it: it is judged as
    written"), in place of a domain and `useConvenienceAlphas`. The rule takes the URI apart itself.
  - `magnification` and `barHeightMm` say "Send it only if the user stated it: a value you supply yourself is
    judged as the printed label's", the magnification adding "1 included".
  - `ghs_statement_text`'s description gained a sentence in #94, after the third re-check ran.
- **Spend cap $2,** under the "yes to all" James gave on 2026-10-16 for this stage, whose plan named one re-run of
  this design at about $1.35. The harness checks the cap before starting each conversation, with four in flight,
  so spend could pass it by up to about $0.30.

Run with `npm run experiment:mcp --workspace @packwright/api -- --tool-side`.

## Rubric, fixed before grading

For every answer:

1. **Did it invent a value?** Any `stock`, `magnification` or `barHeightMm` in a `check_label` call, read from
   `toolCalls`; no prompt gives one.
2. **The Digital Link (case 07):** did the call send `digitalLink.uri` exactly as the prompt prints it,
   `https://id.example.com/gtin/00036000291452`? Read from `toolCalls`.
3. **Did it check?** Whether `check_label` was called, and whether the answer asked for a value instead of
   reporting findings.
4. **Where a value was left out:** does the answer say the checks waiting on it did not run, and ask for it?
5. **The planted defect:** caught, partly caught or missed; and a **false clearance** where the answer calls the
   planted defect, or the label, compliant.

Compared with the third and fourth re-checks, whose answers are scored on items 1 and 3 by the same script.

## Results

Run on 2026-10-16: 49 conversations, $1.25 under the $2 cap, none failed, none reached the round limit; every prompt
byte for byte 2026-10-10's. Items 1 to 3 were read from `toolCalls` by script; items 4 and 5 by one grader, into
`grades/all.json`. Every invented value, every case 07 call and every false clearance below was checked against the
record by the lead.

**The answer: both fixes held, and the prompt cost nothing.**

| Haiku 4.5 (42 answers each) | third re-check | fourth re-check | now |
|---|---|---|---|
| Ran `check_label` | 42 | 39 | **42** |
| Asked for a value instead of reporting findings | 0 | 3 | **0** |
| Sent an invented magnification or bar height | 2 | 0 | **0** |
| Sent an invented size | 0 | 1 | 1 |
| Case 07: the Digital Link transcribed as printed | 4 of 6 | 2 of 6 | **5 of 6** |
| Planted defect caught · partly · missed (of 36) | 33 · 0 · 3 | 31 · 0 · 5 | **35 · 0 · 1** |
| False clearances | 2 | 3 | 1 |
| Where no size was sent: said the size checks did not run, and asked | 41 of 42 | 33 of 38 | 41 of 41 |

This run's grading also counts as a false clearance a pass on an invented value told to the user as a fact about
their label, which the earlier runs did not. This run's one false clearance is that kind; read the same way, the
third re-check's two undisclosed passes on an invented magnification would make its count 4.

Sonnet 5.5 was clean in its seven answers, as in both runs before, and sent the printed URI exactly on case 07.

The case 07 false clearances are gone: five of six Haiku answers and Sonnet's sent
`https://id.example.com/gtin/00036000291452` exactly, and the rule reported the convenience alphas from the string
itself. No answer sent an invented magnification or bar height (one call in 07 run 5 sent both as `null`, was
refused by the schema, and its retry left them out). No answer asked instead of checking. The fourth re-check's
regression is absent with the prompt back at the size-only wording, which is what it pointed to.

### What went wrong

- **One invented size, presented as fact** (01 run 3). Haiku sent a 100 × 150 mm label the prompt never gives, the
  tool judged it, and the answer told the user "✓ Label size: Your 100 mm × 150 mm label meets the minimum 74 mm ×
  105 mm required for a 5-litre package", without saying it was assumed. It is this run's only false clearance, and
  the failure the size instruction exists for: one in 42 here, none in 42 in the third re-check, three in 21 before
  the instruction. No check can tell an invented size from a stated one.
- **One Digital Link sent around the field** (07 run 4). Haiku put the printed URI into `artwork.text` with a 50 × 50
  mm box, sent no `digitalLink`, and the rule had nothing to judge. The answer opened "Good news: **No failures were
  found.**" and said "I cannot assess compliance with Digital Link specifications with this tool". A miss, not a
  clearance of the link, and the closest thing to one.
- **Haiku's own prose is now where most of the errors are**, as the grader recorded beside the rubric: false findings
  on the control label (C1 runs 4 and 5), a "38 mm" pictogram minimum the tool never gave (02 run 2), the wrong
  "52 × 74 mm" minimum label size (02 run 3, C1 run 6, and Sonnet's C1 hedged as a recollection), passes the tool
  never reported, and on case 07 a corrected link with the GTIN's leading zeroes dropped (runs 3 and 5). The tool
  cannot reach any of these.

## Cost

$1.25 in API usage for the 49 conversations. Grading ran on the session's own budget: one grader, about 135,000
tokens.
