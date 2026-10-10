# Use Packwright from your AI

> **Not live yet.** Packwright has no public address until it is deployed (phase 8 of `docs/DESIGN.md`). Until
> then, `https://packwright.jameslittlefield.net/mcp` below is where it will be, not where it is.

Packwright can be added to Claude, or to any assistant that speaks the Model Context Protocol, as a set of tools.
Ask your assistant about a label and it can have Packwright draw the label, run the rules this website runs, and
answer with every finding and the regulation each one cites — rather than recalling a citation, which is where
assistants go wrong.

It is free and needs no account. Packwright runs no AI on this path and keeps nothing you send it; your own
assistant does the explaining, on your own plan.

## What it offers

| Tool | What it does |
|---|---|
| `check_label` | Checks a GS1 retail (UPC-A), GHS chemical or US food label from its details. Answers with each finding — severity, message, measurement and citation — the checks that did not run and what each needs, and what could not be drawn. |
| `list_rules` | Every rule Packwright implements, with the provisions it cites. |
| `ghs_statement_text` | The exact text of a GHS hazard or precautionary statement, from the verified tables — or a plain "no verified text". Never generated. |
| `check_gtin` | Whether a GTIN-8, -12, -13 or -14 has the right check digit, and the right one if not. |

All four only read. None saves anything, exports a PDF, or reads a photograph.

**A report with no failures is not a statement that your label is compliant.** It means the checks Packwright
performs found nothing. Every answer says so, and points to [what is not checked](WHAT-IS-NOT-CHECKED.md).

## Claude on the web, desktop and mobile

Add it once to your claude.ai account, as a custom connector:

1. Go to **Customize > Connectors** and choose **Add custom connector**.
2. Enter the URL `https://packwright.jameslittlefield.net/mcp`.
3. Leave the authentication settings alone — Packwright needs no sign-in — and choose **Add**.

On a Team or Enterprise plan an Owner adds it, under **Organization settings > Connectors**, and members connect
from **Customize > Connectors**. On the Free plan a custom connector uses your one slot.

## Claude Code

```sh
claude mcp add --transport http packwright https://packwright.jameslittlefield.net/mcp
```

## Limits

Each address may make 60 tool calls an hour; connecting and listing the tools are not counted. Calls made
through claude.ai all arrive from Anthropic's addresses, so they share a much larger allowance between them. A
call over a limit is answered with HTTP 429; wait and try again.

Sources for the steps above: Claude's "Add a custom connector" and Claude Code's MCP documentation, read
2026-10-10.
