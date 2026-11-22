// @vitest-environment node
//
// Reads source files, so it needs Node rather than the jsdom default this
// workspace uses for component tests.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Visitor-facing text uses no em dashes (James's writing rule): a colon, a
 * comma, parentheses or two sentences instead. This holds the markup, every
 * `.vue` template and `index.html`, and the code of every script block and
 * non-test `.ts` file under `apps/web/src`, where the option maps, headings and
 * messages live; and since Task 17b, the code of every non-test file in
 * `packages/label-core/src` outside `rules/fixtures/` and the strings `/mcp` sends
 * (`apps/api/src/mcp/server.ts` and `routes.ts`), less a short list of verbatim regulatory text
 * (`VERBATIM`, below). Server error messages were cleared by hand on 2026-11-22.
 * Code comments are out of scope (decision 20 of
 * `docs/plans/2026-11-19-portfolio-demo-readiness.md`). En dashes in ranges are
 * fine.
 *
 * The character is written as an escape so this file does not break its own rule.
 */
const EM_DASH = '\u2014'

const SRC = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(SRC, '..')

function filesEndingIn(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesEndingIn(path, keep)
    return keep(entry.name) ? [path] : []
  })
}

const vueFiles = (dir: string): string[] => filesEndingIn(dir, (name) => name.endsWith('.vue'))

/** Source files a visitor's text can come from; tests quote copy and are left out. */
const scriptFiles = (dir: string): string[] =>
  filesEndingIn(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

/** Blanks HTML comments but keeps their line breaks, so line numbers still match the file. */
function withoutComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ''))
}

/**
 * An em dash written as a character reference, which the browser renders as one:
 * `&#8212;`, `&#x2014;` (either case of x, with or without leading zeros) or
 * `&mdash;` (entity names are case-sensitive, so `&MDash;` is not one). A numeric
 * one renders even without its closing semicolon, so the digits are bounded instead. One got past
 * this guard in `FindingsRail.vue` until the production-image check of 2026-11-22.
 */
const EM_DASH_REFERENCE = /&(?:#0*8212(?![0-9])|#[xX]0*2014(?![0-9a-fA-F])|mdash;)/

/** `file:line` for each line of markup `text` (from `firstLine`) that shows an em dash. */
function linesWithEmDash(file: string, text: string, firstLine: number): string[] {
  return text
    .split('\n')
    .flatMap((line, index) =>
      line.includes(EM_DASH) || EM_DASH_REFERENCE.test(line)
        ? [`${file}:${firstLine + index}`]
        : [],
    )
}

/** The template block, comments blanked, with the line it starts on. */
function template(path: string): { text: string; firstLine: number } {
  const source = readFileSync(path, 'utf8')
  // The root's opening tag, with or without attributes (`<template lang="html">`).
  const start = source.search(/<template(\s[^>]*)?>/)
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) return { text: '', firstLine: 1 }
  const firstLine = source.slice(0, start).split('\n').length
  return { text: withoutComments(source.slice(start, end)), firstLine }
}

/**
 * Tokens that can end an expression, so a `/` after one divides. After anything
 * else a `/` opens a regular expression, which the scanner must be told to read
 * as one, or a `\//` inside it would read as the start of a comment. A known
 * gap: a regular expression right after `)`, `]` or `}` (`if (ok) /^\/\//`) is
 * read as a division, and an em dash later on that line can be missed. Telling
 * the two apart needs the parser; no file here writes one.
 */
const ENDS_AN_EXPRESSION = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
])

/** One token of TypeScript code: its kind, its text as written, its value, and where it starts. */
interface Token {
  kind: ts.SyntaxKind
  text: string
  value: string
  start: number
}

/**
 * The tokens of TypeScript `code`, comments left out. TypeScript's own scanner
 * reads them, so a comment is skipped exactly, a string or template is read
 * whole, and a template's parts and a regular expression are re-scanned as such.
 */
function tokensOf(code: string): Token[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code)
  // Brace depth inside each template expression still open, innermost last.
  const templates: number[] = []
  const tokens: Token[] = []
  let previous = ts.SyntaxKind.Unknown
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.OpenBraceToken && templates.length > 0) {
      templates[templates.length - 1]! += 1
    } else if (kind === ts.SyntaxKind.CloseBraceToken && templates.length > 0) {
      if (templates[templates.length - 1] === 0) {
        kind = scanner.reScanTemplateToken(false)
        if (kind === ts.SyntaxKind.TemplateTail) templates.pop()
      } else {
        templates[templates.length - 1]! -= 1
      }
    } else if (
      (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) &&
      !ENDS_AN_EXPRESSION.has(previous)
    ) {
      kind = scanner.reScanSlashToken()
    }
    if (kind === ts.SyntaxKind.TemplateHead) templates.push(0)
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      start: scanner.getTokenStart(),
    })
    previous = kind
  }
  return tokens
}

/** Whether a token is a whole string: a quoted literal or a template without substitutions. */
const isWholeString = (token: Token): boolean =>
  token.kind === ts.SyntaxKind.StringLiteral ||
  token.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral

/**
 * Whether a token is a string or a part of a template, the only tokens whose value
 * is their own: the scanner leaves the last string's value on the tokens after it.
 */
const isStringPart = (token: Token): boolean =>
  isWholeString(token) ||
  token.kind === ts.SyntaxKind.TemplateHead ||
  token.kind === ts.SyntaxKind.TemplateMiddle ||
  token.kind === ts.SyntaxKind.TemplateTail

/**
 * `file:line` for each line of TypeScript `code` (starting at `firstLine`) whose
 * code, not its comments, holds an em dash. A string whose whole value is one of
 * the `allowed` texts is spared; a string that merely contains one is not.
 */
function codeLinesWithEmDash(
  file: string,
  code: string,
  firstLine: number,
  allowed: readonly string[] = [],
): string[] {
  const lineOf = (offset: number): number =>
    firstLine + code.slice(0, offset).split('\n').length - 1
  const found = new Set<string>()
  for (const token of tokensOf(code)) {
    if (isWholeString(token) && allowed.includes(token.value)) continue
    // Each em dash by its own line, since a string or template can span several.
    const { text } = token
    let seen = false
    for (let at = text.indexOf(EM_DASH); at !== -1; at = text.indexOf(EM_DASH, at + 1)) {
      found.add(`${file}:${lineOf(token.start + at)}`)
      seen = true
    }
    // One written as an escape (`\u2014`) is in the string's value, not its text.
    if (!seen && isStringPart(token) && token.value.includes(EM_DASH)) {
      found.add(`${file}:${lineOf(token.start)}`)
    }
  }
  return [...found]
}

/** Each `<script>` block of a `.vue` file, with the line its code starts on. */
function scriptBlocks(path: string): { code: string; firstLine: number }[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => {
    const start = match.index + match[0].indexOf('>') + 1
    return { code: match[2]!, firstLine: source.slice(0, start).split('\n').length }
  })
}

describe('no em dashes in visitor-facing markup', () => {
  it('finds none in any .vue template, outside HTML comments', () => {
    const found = vueFiles(SRC).flatMap((path) => {
      const { text, firstLine } = template(path)
      return linesWithEmDash(relative(ROOT, path), text, firstLine)
    })
    expect(found).toEqual([])
  })

  it('finds none in index.html, outside HTML comments', () => {
    const path = join(ROOT, 'index.html')
    const found = linesWithEmDash('index.html', withoutComments(readFileSync(path, 'utf8')), 1)
    expect(found).toEqual([])
  })

  it('finds none in the code of any .vue script block, outside comments', () => {
    const found = vueFiles(SRC).flatMap((path) =>
      scriptBlocks(path).flatMap(({ code, firstLine }) =>
        codeLinesWithEmDash(relative(ROOT, path), code, firstLine),
      ),
    )
    expect(found).toEqual([])
  })

  it('finds none in the code of any non-test .ts file, outside comments', () => {
    const found = scriptFiles(SRC).flatMap((path) =>
      codeLinesWithEmDash(relative(ROOT, path), readFileSync(path, 'utf8'), 1),
    )
    expect(found).toEqual([])
  })

  it('would catch one in code: a string, a template part, after a regex; never a comment', () => {
    const code = [
      `// a ${EM_DASH} comment`,
      `/* a ${EM_DASH} block */ const fine = 1`,
      `const quoted = 'a ${EM_DASH} b'`,
      `const templated = \`a \${fine} ${EM_DASH} \${fine} b\``,
      String.raw`const slashes = /^\/\// ; const after = '` + EM_DASH + `'`,
      `const spanning = \`first line`,
      `second ${EM_DASH} line\``,
      `const ratio = fine / 2 // ${EM_DASH} not code`,
    ].join('\n')
    expect(codeLinesWithEmDash('X.ts', code, 10)).toEqual([
      'X.ts:12',
      'X.ts:13',
      'X.ts:14',
      'X.ts:16',
    ])
  })

  it('would catch one: an em dash in a template is reported with its line', () => {
    const text = withoutComments(`<p>fine</p>\n<p>a ${EM_DASH} b</p>\n<!-- a ${EM_DASH} b -->`)
    expect(linesWithEmDash('X.vue', text, 10)).toEqual(['X.vue:11'])
  })

  it('would catch one written as a character reference, in any of its spellings', () => {
    const text = withoutComments(
      [
        '<p>a &#8212; b</p>',
        '<p>a &#x2014; b</p>',
        '<p>a &mdash; b</p>',
        '<p>a &#8211; and &MDash; and &#82120; b</p>',
        '<p>a &#8212 b</p>',
        '<!-- a &mdash; b -->',
      ].join('\n'),
    )
    expect(linesWithEmDash('X.vue', text, 1)).toEqual(['X.vue:1', 'X.vue:2', 'X.vue:3', 'X.vue:5'])
  })
})

const LABEL_CORE = join(ROOT, '..', '..', 'packages', 'label-core', 'src')
/** What `/mcp` sends: the server's tool text, and the route's own refusals. */
const MCP_FILES = ['server.ts', 'routes.ts'].map((name) =>
  join(ROOT, '..', 'api', 'src', 'mcp', name),
)

/**
 * Text that keeps its em dashes, by file (relative to the repository root) and the
 * whole value of the string literal, each with the reason. Only a string that is
 * exactly an entry is spared. Verbatim regulatory text stays as its source
 * prints it, since changing regulatory text is forbidden (CLAUDE.md); a glyph table
 * measures the character itself, as a key and not as text anyone reads. A test below
 * fails if an entry is no longer a whole string in its file, word for word.
 */
const CLP_ANNEX_V =
  'CLP Annex V column 2, verbatim (consolidated text of 01.09.2025; the module note in classification.ts)'
const GLYPH_WIDTH =
  'the em dash glyph as a key in a font width table, so a label that prints one is measured'
const VERBATIM: Readonly<Record<string, readonly { text: string; source: string }[]>> = {
  'packages/label-core/src/ghs/classification.ts': [
    {
      text: 'Specific Target Organ Toxicity \u2014 Single exposure, hazard category 3 Respiratory tract irritation Narcotic effects',
      source: CLP_ANNEX_V,
    },
    {
      text: 'Specific Target Organ Toxicity \u2014 Single exposure, hazard categories 1, 2',
      source: CLP_ANNEX_V,
    },
    {
      text: 'Specific Target Organ Toxicity \u2014 Repeated exposure, hazard categories 1, 2',
      source: CLP_ANNEX_V,
    },
    {
      text: 'Hazardous to the aquatic environment \u2014 Acute hazard category: Acute 1 \u2014 Long-term hazard categories: Chronic 1, Chronic 2',
      source: CLP_ANNEX_V,
    },
    {
      text: 'Hazardous to the aquatic environment \u2014 Long-term hazard',
      source: CLP_ANNEX_V,
    },
  ],
  'packages/label-core/src/text/metrics.ts': [{ text: '\u2014', source: GLYPH_WIDTH }],
}

/** A path relative to the repository root, with forward slashes on every platform. */
const repoPath = (path: string): string =>
  relative(join(ROOT, '..', '..'), path)
    .split(sep)
    .join('/')

describe("no em dashes in label-core's visitor-visible text, or in what /mcp sends", () => {
  it('finds none in the code of label-core and the MCP server, outside comments and the verbatim list', () => {
    const files = [
      ...filesEndingIn(
        LABEL_CORE,
        (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
      ).filter((path) => !repoPath(path).includes('/rules/fixtures/')),
      ...MCP_FILES,
    ]
    const found = files.flatMap((path) => {
      const file = repoPath(path)
      const allowed = (VERBATIM[file] ?? []).map((entry) => entry.text)
      return codeLinesWithEmDash(file, readFileSync(path, 'utf8'), 1, allowed)
    })
    expect(found).toEqual([])
  })

  it('lists only text that is still a whole string in its file, word for word', () => {
    const missing = Object.entries(VERBATIM).flatMap(([file, entries]) => {
      const strings = tokensOf(readFileSync(join(ROOT, '..', '..', file), 'utf8'))
        .filter(isWholeString)
        .map((token) => token.value)
      return entries
        .filter((entry) => !strings.includes(entry.text))
        .map((entry) => `${file}: ${entry.text}`)
    })
    expect(missing).toEqual([])
  })

  it('would catch one written as an escape, at the line its string starts', () => {
    const code = [
      'const fine = 1',
      String.raw`const escaped = 'not checked \u2014 see below'`,
    ].join('\n')
    expect(codeLinesWithEmDash('X.ts', code, 1)).toEqual(['X.ts:2'])
  })

  it('spares a listed string only whole, never a longer string that contains it', () => {
    const listed = `Hazardous ${EM_DASH} Long-term`
    const code = [`const a = '${listed}'`, `const b = '${listed} is not drawn'`].join('\n')
    expect(codeLinesWithEmDash('X.ts', code, 1, [listed])).toEqual(['X.ts:2'])
  })
})
