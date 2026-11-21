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
 *
 * **The reason unions copy the server's `apps/api/src/audit/refusals.ts`, on
 * purpose.** The web app does not import the API, and `label-core` is not the
 * place for this API's wire format, so the duplication is accepted rather than
 * overlooked. The test "speaks the server's action and refusal reasons, which are
 * copied on purpose" in `audit.test.ts` is its check.
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
    /** Why the server refused, where it said and the reason is one this page knows. */
    readonly reason: AuditRefusalReason | null = null,
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

/** Why the status says no read is possible (the server's `AuditUnavailableReason`). */
export type AuditUnavailableReason = 'budget' | 'ip' | 'unconfigured'

/** Why a read was refused: the status's reasons, and two only a read can meet. */
export type AuditRefusalReason = AuditUnavailableReason | 'unavailable' | 'bot-check'

const UNAVAILABLE_REASONS: readonly string[] = ['budget', 'ip', 'unconfigured']
const REFUSAL_REASONS: readonly string[] = [...UNAVAILABLE_REASONS, 'unavailable', 'bot-check']

/** The header the server reads the bot check's token from (`apps/api/src/audit/turnstile.ts`). */
export const TURNSTILE_HEADER = 'X-Turnstile-Token'

/**
 * What the server can do for this page: whether a read is possible now, why not
 * if not, and the bot check's site key where the server asks for one.
 */
export interface AuditStatus {
  available: boolean
  reason: AuditUnavailableReason | null
  siteKey: string | null
}

/**
 * The server's answer, or `null` where it could not be had or did not make sense.
 *
 * Anything but a 200 is `null`, the status limiter's 429 included. The page reads
 * `null` as no read being possible and offers the sample, since a status it could
 * not read is no evidence that a read would be accepted.
 */
export async function auditStatus(): Promise<AuditStatus | null> {
  try {
    const response = await fetch('/api/audit/status')
    if (response.status !== 200) return null
    const body = (await response.json()) as {
      available?: unknown
      reason?: unknown
      siteKey?: unknown
    }
    if (typeof body.available !== 'boolean') return null
    const reason = body.reason
    if (reason !== null && !(typeof reason === 'string' && UNAVAILABLE_REASONS.includes(reason))) {
      return null
    }
    if (body.siteKey !== null && typeof body.siteKey !== 'string') return null
    return {
      available: body.available,
      reason: reason as AuditUnavailableReason | null,
      siteKey: body.siteKey,
    }
  } catch {
    return null
  }
}

/**
 * Asks the server to read a photograph.
 *
 * `turnstileToken` is the bot check's token, sent only when there is one. A
 * server that asks for no bot check is sent none.
 */
export async function readGhsLabel(
  photo: LabelPhoto,
  regime: GhsRegime,
  turnstileToken: string | null,
): Promise<LabelReading> {
  const response = await fetch('/api/audit/ghs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(turnstileToken === null ? {} : { [TURNSTILE_HEADER]: turnstileToken }),
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
  let reason: AuditRefusalReason | null = null
  try {
    const body = (await response.json()) as { error?: unknown; detail?: unknown; reason?: unknown }
    if (typeof body.error === 'string') message = body.error
    detail = flatten(body.detail)
    if (typeof body.reason === 'string' && REFUSAL_REASONS.includes(body.reason)) {
      reason = body.reason as AuditRefusalReason
    }
  } catch {
    // Left as the status-only message above.
  }
  throw new AuditError(message, response.status, detail, reason)
}
