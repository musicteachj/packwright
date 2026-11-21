// @vitest-environment node
//
// Reads source files, so it needs Node rather than the jsdom default this
// workspace uses for component tests.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every select draws its chevron the one way, 8px in from its right edge.
 *
 * `SelectField` turns the browser's arrow off (`appearance-none`) and draws its
 * own, and the editor's label-type select in the toolbar copies that by hand.
 * The audit page's market select was a bare `<select>` with the browser's arrow,
 * which sits flush against the edge, so it looked out of line with every other
 * select in the app (James, 2026-11-21). A bare `<select>` anywhere else would
 * bring that back, so the files allowed to write one are listed here.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url))

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** The template, without HTML comments, which may mention a select. */
function template(path: string): string {
  const source = readFileSync(path, 'utf8')
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) return ''
  return source.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')
}

describe('select chevrons', () => {
  it('are drawn by SelectField, or by the one toolbar select that copies it', () => {
    const withSelect = vueFiles(SRC)
      .filter((path) => /<select\b/.test(template(path)))
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .sort()
    expect(withSelect).toEqual(['components/ui/SelectField.vue', 'views/EditorView.vue'])
  })
})
