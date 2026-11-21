/**
 * Cloudflare's Turnstile bot check, as one widget the audit page can hold.
 *
 * The public photo audit asks for a Turnstile token with every read, and the server
 * verifies it with Cloudflare before it reads a byte of the photograph
 * (`apps/api/src/audit/turnstile.ts`). This is the browser's half: it loads
 * Cloudflare's script with explicit rendering, draws the widget into a box the page
 * gives it, keeps the token the widget hands back, and forgets it when it expires,
 * when the check fails, or when the page resets it after a read. A token is good
 * for one siteverify call only, so the page resets after every attempt.
 *
 * **The script loads only once a site key is known.** A server that asks for no bot
 * check sends no site key, and a visitor to it then makes no request to Cloudflare
 * at all.
 *
 * **`TURNSTILE_ACTION` is declared again here, on purpose.** It must equal the
 * server's, which siteverify's `action` is checked against. `label-core` is not the
 * place for it (it holds the engine, not this API's wire format) and the web app
 * does not import the API, so the duplication is accepted, and the test "speaks the
 * server's action and refusal reasons, which are copied on purpose" in
 * `api/audit.test.ts` pins it.
 *
 * The render options and the three callbacks are Cloudflare's client-side rendering
 * API (`turnstile.render(container, { sitekey, action, callback, 'expired-callback',
 * 'error-callback' })`, with `reset(widgetId)` and `remove(widgetId)`). Source:
 * Cloudflare's "Client-side rendering" and "Widget configurations" pages, read on
 * 2026-11-21: the explicit-render script URL, `render` returning a widget id, the
 * option and callback names, a token single use and good for 300 seconds, and an
 * `action` of at most 32 letters, digits, `_` or `-` (`'audit'` is one).
 */

import { onScopeDispose, ref, watchEffect, type Ref, type ShallowRef } from 'vue'

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The action the widget declares; the server's `TURNSTILE_ACTION` (see the module note). */
export const TURNSTILE_ACTION = 'audit'

interface TurnstileRenderOptions {
  sitekey: string
  action: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export interface TurnstileWidget {
  /** The widget's current token, or `null` until it has one, and again once it is spent. */
  token: Readonly<Ref<string | null>>
  /** Whether the check failed, or Cloudflare's script could not be loaded. */
  failed: Readonly<Ref<boolean>>
  /** Forgets the token and asks the widget for a new one. */
  reset(): void
}

/** Cloudflare's script, added to the page at most once however many widgets ask for it. */
let loading: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile !== undefined) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => {
      // Forgotten, so a later widget may try again; this one reports a failed check.
      script.remove()
      loading = null
      reject(new Error('The bot check could not be loaded'))
    })
    document.head.append(script)
  })
  return loading
}

export function useTurnstile(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  siteKey: Readonly<Ref<string | null>>,
): TurnstileWidget {
  const token = ref<string | null>(null)
  const failed = ref(false)
  const ready = ref(window.turnstile !== undefined)

  /** The widget on the page, and the box and key it was drawn with. */
  let drawn: { id: string; box: HTMLElement; key: string } | null = null

  function removeDrawn() {
    if (drawn === null) return
    window.turnstile?.remove(drawn.id)
    drawn = null
    token.value = null
  }

  let disposed = false

  watchEffect(() => {
    const box = container.value
    const key = siteKey.value
    if (drawn !== null && (drawn.box !== box || drawn.key !== key)) removeDrawn()
    if (box === null || key === null || drawn !== null) return
    if (!ready.value) {
      loadTurnstile().then(
        () => {
          if (!disposed) ready.value = true
        },
        () => {
          if (!disposed) failed.value = true
        },
      )
      return
    }
    const id = window.turnstile!.render(box, {
      sitekey: key,
      action: TURNSTILE_ACTION,
      callback: (issued) => {
        token.value = issued
        failed.value = false
      },
      'expired-callback': () => {
        token.value = null
      },
      'error-callback': () => {
        token.value = null
        failed.value = true
      },
    })
    if (id !== undefined) drawn = { id, box, key }
  })

  onScopeDispose(() => {
    disposed = true
    removeDrawn()
  })

  return {
    token,
    failed,
    reset() {
      token.value = null
      failed.value = false
      if (drawn !== null) window.turnstile?.reset(drawn.id)
    },
  }
}
