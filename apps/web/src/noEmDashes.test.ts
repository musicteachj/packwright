// @vitest-environment node
//
// Reads source files, so it needs Node rather than the jsdom default this
// workspace uses for component tests.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Visitor-facing text uses no em dashes (James's writing rule): a colon, a
 * comma, parentheses or two sentences instead. This holds the markup, every
 * `.vue` template and `index.html`, and the code of every script block and
 * non-test `.ts` file under `apps/web/src`, where the option maps, headings and
 * messages live. Server error messages were cleared by hand on 2026-11-22; code
 * comments, `label-core` and MCP output are out of scope (decision 20 of
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

/** `file:line` for each line of `text` (which starts at `firstLine`) that holds an em dash. */
function linesWithEmDash(file: string, text: string, firstLine: number): string[] {
  return text
    .split('\n')
    .flatMap((line, index) => (line.includes(EM_DASH) ? [`${file}:${firstLine + index}`] : []))
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

/**
 * `file:line` for each line of TypeScript `code` (starting at `firstLine`) whose
 * code, not its comments, holds an em dash: TypeScript's own scanner reads the
 * tokens, so a comment is skipped exactly and a string or template is read whole.
 */
function codeLinesWithEmDash(file: string, code: string, firstLine: number): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code)
  const lineOf = (offset: number): number =>
    firstLine + code.slice(0, offset).split('\n').length - 1
  // Brace depth inside each template expression still open, innermost last.
  const templates: number[] = []
  const found = new Set<string>()
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
    // Each em dash by its own line, since a string or template can span several.
    const text = scanner.getTokenText()
    for (let at = text.indexOf(EM_DASH); at !== -1; at = text.indexOf(EM_DASH, at + 1)) {
      found.add(`${file}:${lineOf(scanner.getTokenStart() + at)}`)
    }
    previous = kind
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
})
