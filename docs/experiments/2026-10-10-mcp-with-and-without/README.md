# With and without Packwright's tools, 2026-10-10

**The question.** The experiment of 2026-10-09 (`../2026-10-09-mcp-without/`) asked whether a model answering
label-regulation questions alone gets them wrong, and found that it does — confident, specific, wrong law around a
problem it mostly finds. This one asks what changes when the same model has Packwright's four MCP tools: whether
citations, misses and false clearances improve, and what new ways of going wrong the tools bring.

**Results:** not yet graded. This file is written in two parts: the design and the rubric now, before any answer is
read, and the results after grading.

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
