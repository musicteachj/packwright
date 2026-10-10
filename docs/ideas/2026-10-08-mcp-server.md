# Idea: Packwright as an MCP server

> **Status: an idea, not a plan.** Explored with Claude on 2026-10-08. Nothing is decided and nothing is built.
> Revisit after the agreed pre-deployment work, before or alongside phase 8.

## The explanation that made it click

*Kept word for word from the conversation of 2026-10-08, because this is the version that made sense. Read this
first.*

### The one-sentence version

MCP lets someone chatting with an AI, like Claude or ChatGPT, have that AI use Packwright's checker in the
middle of the conversation, instead of answering from memory.

### A story

Maria designs packaging for a small cleaning-products company. She doesn't know Packwright exists. She uses
Claude every day for work.

**Today, without Packwright,** she types into Claude:

> "I'm labelling a 1-litre bottle of acetone for sale in the EU. Here's my label text: … Is anything missing?"

Claude answers from memory. It sounds confident and might be right. But AIs are known to invent regulation
numbers that don't exist, or miss requirements, and Maria has no way to tell.

**With Packwright's MCP connected,** she types exactly the same thing. This time:

1. Claude realises it has a label-checking tool available.
2. Claude sends her label details to Packwright.
3. Packwright's rules check them. These are the same rules your website runs, not AI guessing.
4. Packwright sends back a list: what's wrong, and the exact regulation for each problem.
5. Claude explains that list to Maria in plain language.

In her chat it might look like this (illustrative wording):

> "I checked this with Packwright. Two problems: the label is missing a required precautionary statement, and
> the hazard pictogram is smaller than the minimum size. Each finding comes with its regulation reference.
> Packwright also notes it couldn't check X, because you didn't give the bottle's dimensions."

Maria never opened your website. She stayed in her Claude chat the whole time.

### Who "others" are

"Others" means people like Maria: anyone chatting with an AI assistant who has connected Packwright to it.
That includes:
- a hiring manager trying out your work;
- a designer or regulatory person checking a label.

They use Packwright through their AI chat instead of through your website.

### An analogy

Ask someone to multiply 4,837 × 293 in their head and they'll probably give a confident answer that might be
wrong. Hand them a calculator and they get it right every time.

AIs answering regulation questions from memory are the person doing it in their head. Packwright is the
calculator. **MCP is how you hand the AI the calculator.** It's the standard way AI chat apps connect to tools.

### How it works, in four plain steps

1. You add a small piece to Packwright's server: a web address, `/mcp`, that AI chat apps know how to talk to.
2. A person adds that address to their AI chat app once, in its settings. It's like installing an app.
3. When they ask a label question, their AI calls that address, sending the label details.
4. Packwright runs its rules and sends the answer back, and the AI explains it.

### What it isn't

- It doesn't change your website. The website keeps working exactly as it does.
- It doesn't change which AI Packwright uses.
- Packwright itself never uses it. It only exists so other people's AI chats can use Packwright.

### And it isn't tied to Claude

MCP is a **shared standard**, like USB-C or a website. A website works in Chrome, Safari or Firefox because they
all speak the same web standards; you don't build one website per browser. MCP works the same way: build it
once, and any assistant that supports MCP can use it. Claude, ChatGPT, Cursor and VS Code all do. You don't
switch anything. The person using it picks their own AI, and Packwright works with whichever they chose.

## Why it is worth doing (and not just "adding MCP")

1. **The use is real.** AI label-compliance review is a product category in 2026 (RegASK's agentic label
   workflow, ManageArtworks ComplAi, Food Label Maker AI), and GS1's product-data world is starting to expose
   tools over MCP (GS1 Belgium & Luxembourg).
2. **It answers the hard question.** Studies of legal AI find fabricated citations in 17–33% of answers.
   Packwright's founding rule is that a model never writes a verdict or a citation. Over MCP the agent talks,
   Packwright's rules decide, and every citation arrives as data.
3. **It fits the design already there.** `docs/DESIGN.md`: "The LLM reads. The rule engine judges." MCP lets
   *anyone's* model do the reading.
4. **It fills a portfolio gap.** None of the four projects (Open Door, Packwright, Folio, Smart Resume Builder)
   has MCP or an evaluation of AI answers.

## Only worth doing as the whole package

1. **One shared judge.** Today the rules run only in the browser. The "draw it, run the rules, report" step
   moves into `label-core`, and the website uses it from there — so the website and the MCP server can never
   give different verdicts.
2. **The MCP server.** A few read-only tools: check a label, list the rules, look up the exact text of a GHS
   statement, check a barcode number. Every answer lists the checks that could not run and says that no
   findings is not a statement of compliance.
3. **The with/without test.** About ten realistic requests, each given to an AI twice — on its own, and with
   Packwright connected. Count invented regulations, missed problems and wrong "it's compliant" answers. This is
   the evidence: *"without Packwright the AI cited a regulation that doesn't exist in N of 10 cases; with it,
   none."*
4. **Live, with deployment.** A public `/mcp` address a hiring manager can add to Claude in a minute.

Without these — four tools, a second copy of the rules, no test, laptop only — it is box-ticking, and not worth
building.

A cheap first step before committing: run only the "without" half (a few dollars of API calls) to see whether
current AIs really do get these regulations wrong.

## How deployment would work

No new AWS service. Phase 8 already plans one container on the shared ECS Fargate cluster, behind
`portfolio-alb`, at `packwright.jameslittlefield.net`. The MCP server is one more address, `/mcp`, on the same
Express server in that container.

- Anthropic's (or OpenAI's) servers call `/mcp`, so it must be public HTTPS — which phase 8 provides.
- **No login, on purpose**: the tools only read and judge; nothing saved, nothing that spends money. Saving
  labels and the photo audit stay out.
- **Rate limit** `/mcp`, and set `TRUST_PROXY_HOPS=1` behind the load balancer so each caller gets their own limit.
- Treat tool names and inputs like a public API: renaming one breaks people's connections.
- Test locally first with the **MCP Inspector** (the official debugging tool), then in Claude Code / Desktop,
  then the live URL as a Claude connector.

## Costs

- **AI: none to James.** Packwright never calls an AI in the MCP path; the person's own AI does the thinking and
  their subscription pays for it.
- **AWS: essentially none extra** — the same container phase 8 already pays for (about $3–4/month). Abuse can
  slow it but not run up a bill, as long as `/mcp` is rate-limited and ECS does not add containers
  automatically. An on/off setting would let it be shut off without touching the rest of the app.
- **One-off:** the with/without test costs a few dollars of Anthropic usage, run when chosen.

## Who can use it — three options (undecided)

1. **Public `/mcp`.** Anyone can add it; most portfolio value; protected by a rate limit and an off switch.
   Exposure is the same as the public website, which already lets anyone check a label.
2. **Private.** A secret key or a login; logins are a meaningful chunk of extra work.
3. **Never deployed.** Runs only on James's computer; shown with a recording and the test results.

## When to plan it

Not yet. Detailed planning waits until its turn, because the ingredient-order rule split changes the rules
the shared judge wraps, and the MCP libraries are new enough that a plan written now would need re-checking.
The suggested order, recorded 2026-10-08:

1. The backlog-slimming pass.
2. The ingredient-order rule split.
3. **The cheap "without" experiment:** a few fixture labels given to an AI with no tool. If it rarely invents
   regulations or misses problems, rethink before building.
4. **If it confirms the case, plan the MCP work in detail**, then build the shared judge and the server.
5. Phase 8 deployment, shipping the app with its live `/mcp` address.
6. The full with/without eval, before or after phase 8.

## Open decisions

- Whether the order above holds (it is a suggestion, not agreed).
- Public, private, or local only.
- ~~Whether to run the cheap "without" experiment first.~~ Run on 2026-10-09, and it confirms the case: Claude
  Sonnet 5.5 found most planted defects but put a wrong or nonexistent citation in 31 of 36 answers and cleared a
  defective label three times. `docs/experiments/2026-10-09-mcp-without/README.md`.

## Risks to remember

- Reads as box-ticking unless the whole package ships.
- A wrong answer here hurts the one project whose value is being right — hence one shared judge, and results
  that say what was not checked.
- Packwright cannot make another AI's user confirm what that AI read from a photo; it can only say it judged
  the document as supplied.
- Must not delay deployment, which is the bigger portfolio gap.
- The protocol is new: the stateless spec revision is from July 2026 and SDK v2 is recent.

## Sources (read 2026-10-08)

- MCP spec 2026-07-28 changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- MCP TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/servers/tools — npm `@modelcontextprotocol/server`
  2.3.1, `@modelcontextprotocol/express` 2.0.2 (fit the repo's zod 4.4.3 and Express 5)
- MCP Apps extension: https://apps.extensions.modelcontextprotocol.io/api/
- Claude custom connectors: https://claude.com/docs/connectors/custom/remote-mcp.md
- RegASK label review: https://web11.bernama.com/en/press/news.php?id=2522606 and
  https://www.bernama.com/en/news.php?id=2584263
- GS1 Belgium & Luxembourg MCP server: https://pypi.org/project/gs1belu-mpm-upload-mcp/
- Citation hallucination in legal AI: https://arxiv.org/pdf/2606.00898
