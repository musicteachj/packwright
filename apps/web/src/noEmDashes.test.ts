// @vitest-environment node
//
// Reads source files, so it needs Node rather than the jsdom default this
// workspace uses for component tests.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Visitor-facing text uses no em dashes (James's writing rule): a colon, a
 * comma, parentheses or two sentences instead. This holds the markup, every
 * `.vue` template and `index.html`, which is where most of the copy lives.
 * Strings in script blocks and server error messages were cleared by hand on
 * 2026-11-22; code comments, `label-core` and MCP output are out of scope
 * (decision 20 of `docs/plans/2026-11-19-portfolio-demo-readiness.md`). En
 * dashes in ranges are fine.
 *
 * The character is written as an escape so this file does not break its own rule.
 */
const EM_DASH = '\u2014'

const SRC = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(SRC, '..')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

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

  it('would catch one: an em dash in a template is reported with its line', () => {
    const text = withoutComments(`<p>fine</p>\n<p>a ${EM_DASH} b</p>\n<!-- a ${EM_DASH} b -->`)
    expect(linesWithEmDash('X.vue', text, 10)).toEqual(['X.vue:11'])
  })
})
