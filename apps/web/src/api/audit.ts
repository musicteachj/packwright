/**
 * The audit endpoint, from the client's side.
 *
 * Shaped like `api/savedLabels.ts` — same guarded parse of an error body, same
 * habit of keeping the server's own account of a refusal rather than reducing it
 * to a status. The two `request` helpers are now near-duplicates, which is
 * recorded in `docs/BACKLOG.md` rather than resolved here: merging them means
 * editing a shipped and tested module in the middle of a feature, and the
 * project's own habit is that a deletion like that is made deliberately rather
 * than while passing through.
 *
 * Nothing this returns is label data. It is an `ExtractionResult` in which every
 * field is unverified, and it stays that way until a user says otherwise.
 */

import type { ExtractionResult, GhsLabelData, GhsRegime } from '@packwright/label-core'
import type { LabelPhoto } from '../audit/normalisePhoto'

/**
 * A refusal, with whatever the server said about it.
 *
 * `detail` is flattened to sentences because the endpoint sends two shapes: Zod
 * issues as `{ path, message }` for a bad body, and plain strings for everything
 * else. One shape reaches the screen, which is the same flattening
 * `EditorView.vue` already does at its save site.
 */
export class AuditError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: readonly string[] = [],
  ) {
    super(message)
    this.name = 'AuditError'
  }

  // No `isUnconfigured`. It read `status === 503` and said that meant no key on
  // the server — which the route also returns when the vision service is rate
  // limited, so the getter was wrong half the time and had no caller to be
  // wrong for. The screen shows `message`, which is the server's own sentence
  // and is right in both cases. A convenience that has to be true and is not is
  // worse than no convenience.
}

const flatten = (detail: unknown): readonly string[] => {
  if (!Array.isArray(detail)) return []
  return detail.map((entry) =>
    typeof entry === 'string'
      ? entry
      : typeof entry === 'object' && entry !== null && 'message' in entry
        ? `${String((entry as { path?: unknown }).path ?? '')} ${String((entry as { message: unknown }).message)}`.trim()
        : String(entry),
  )
}

export interface LabelReading {
  extraction: ExtractionResult<GhsLabelData>
  /** The model that answered, as the server observed it. */
  model: string
}

/** The header the server reads an audit key from (`apps/api/src/audit/routes.ts`). */
export const AUDIT_KEY_HEADER = 'X-Audit-Key'

/**
 * What the server can do for this page: whether it reads photographs at all, and
 * whether it asks for an audit key first.
 */
export interface AuditStatus {
  available: boolean
  keyRequired: boolean
}

/**
 * The server's answer, or `null` where it could not be had or did not make sense.
 *
 * `null` leaves the page as it was before the server could be asked: a photograph
 * may be sent, and any refusal is shown in the server's own words. Guessing either
 * way would be worse, since "no key needed" hides the field a person needs and
 * "unavailable" hides an audit that works.
 */
export async function auditStatus(): Promise<AuditStatus | null> {
  try {
    const response = await fetch('/api/audit/status')
    if (!response.ok) return null
    const body = (await response.json()) as Partial<AuditStatus>
    return typeof body.available === 'boolean' && typeof body.keyRequired === 'boolean'
      ? { available: body.available, keyRequired: body.keyRequired }
      : null
  } catch {
    return null
  }
}

/**
 * Asks the server to read a photograph.
 *
 * `auditKey` is what the person typed, sent only when there is one. It is never
 * part of this bundle: a key the client carried would be a key everyone who loads
 * the page could read (`docs/security-review-2026-10-18.md`, James's decision).
 */
export async function readGhsLabel(
  photo: LabelPhoto,
  regime: GhsRegime,
  auditKey = '',
): Promise<LabelReading> {
  const response = await fetch('/api/audit/ghs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auditKey === '' ? {} : { [AUDIT_KEY_HEADER]: auditKey }),
    },
    body: JSON.stringify({
      regime,
      image: { mediaType: photo.mediaType, data: photo.data },
    }),
  })

  if (response.ok) return (await response.json()) as LabelReading

  // The body is the server's account of the refusal and is worth more than the
  // status alone — but a proxy or an error page will not have sent JSON, and
  // failing to parse one must not replace the real failure with a parse error.
  let message = `The server refused the request (${response.status}).`
  let detail: readonly string[] = []
  try {
    const body = (await response.json()) as { error?: unknown; detail?: unknown }
    if (typeof body.error === 'string') message = body.error
    detail = flatten(body.detail)
  } catch {
    // Left as the status-only message above.
  }
  throw new AuditError(message, response.status, detail)
}
