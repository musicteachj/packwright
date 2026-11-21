import { effectScope, nextTick, ref, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TURNSTILE_ACTION, TURNSTILE_SCRIPT_URL, useTurnstile } from './turnstile'

interface RenderOptions {
  sitekey: string
  action: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

/**
 * Cloudflare's script, faked. With `window.turnstile` already there the loader
 * resolves at once, so no script is added and nothing reaches Cloudflare.
 */
function fakeTurnstile() {
  const fake = {
    render: vi.fn((_container: HTMLElement, _options: RenderOptions) => 'widget-1'),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  window.turnstile = fake
  return fake
}

/** The options the page's widget was rendered with, so a test can call back as Cloudflare would. */
const optionsOf = (fake: ReturnType<typeof fakeTurnstile>) => fake.render.mock.calls[0]![1]

function widgetIn(
  box: HTMLElement | null = document.createElement('div'),
  key: string | null = 'site-key',
) {
  const container = shallowRef<HTMLElement | null>(box)
  const siteKey = ref<string | null>(key)
  const scope = effectScope()
  const widget = scope.run(() => useTurnstile(container, siteKey))!
  return { widget, container, siteKey, scope }
}

let fake: ReturnType<typeof fakeTurnstile>

beforeEach(() => {
  fake = fakeTurnstile()
})
afterEach(() => {
  Reflect.deleteProperty(window, 'turnstile')
})

describe('the bot check', () => {
  it('renders once both the box and the site key are there', async () => {
    const { container, siteKey, scope } = widgetIn(null, null)
    await nextTick()
    expect(fake.render).not.toHaveBeenCalled()

    const box = document.createElement('div')
    container.value = box
    await nextTick()
    expect(fake.render).not.toHaveBeenCalled()

    siteKey.value = 'site-key'
    await nextTick()
    expect(fake.render).toHaveBeenCalledTimes(1)
    expect(fake.render).toHaveBeenCalledWith(box, {
      sitekey: 'site-key',
      action: 'audit',
      callback: expect.any(Function),
      'expired-callback': expect.any(Function),
      'error-callback': expect.any(Function),
    })
    expect(TURNSTILE_ACTION).toBe('audit')
    scope.stop()
  })

  it('holds the token the widget hands back', async () => {
    const { widget, scope } = widgetIn()
    await nextTick()
    expect(widget.token.value).toBeNull()

    optionsOf(fake).callback('tok')
    expect(widget.token.value).toBe('tok')
    expect(widget.failed.value).toBe(false)
    scope.stop()
  })

  it('forgets a token that expired, and marks a failed check', async () => {
    const { widget, scope } = widgetIn()
    await nextTick()

    optionsOf(fake).callback('tok')
    optionsOf(fake)['expired-callback']()
    expect(widget.token.value).toBeNull()
    expect(widget.failed.value).toBe(false)

    optionsOf(fake).callback('tok')
    optionsOf(fake)['error-callback']()
    expect(widget.token.value).toBeNull()
    expect(widget.failed.value).toBe(true)
    scope.stop()
  })

  it('reset forgets the token and asks the widget for a new one', async () => {
    const { widget, scope } = widgetIn()
    await nextTick()
    optionsOf(fake).callback('tok')

    widget.reset()
    expect(widget.token.value).toBeNull()
    expect(fake.reset).toHaveBeenCalledWith('widget-1')
    scope.stop()
  })

  it('removes the widget with its scope', async () => {
    const { scope } = widgetIn()
    await nextTick()
    expect(fake.remove).not.toHaveBeenCalled()

    scope.stop()
    expect(fake.remove).toHaveBeenCalledWith('widget-1')
  })

  it('adds the script once, however many widgets there are', async () => {
    // A fresh copy of the module, so its loader has never run.
    Reflect.deleteProperty(window, 'turnstile')
    vi.resetModules()
    const fresh = await import('./turnstile')
    const scope = effectScope()
    scope.run(() => {
      for (const box of [document.createElement('div'), document.createElement('div')]) {
        fresh.useTurnstile(shallowRef(box), ref('site-key'))
      }
    })
    await nextTick()

    const scripts = document.head.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
    try {
      expect(scripts).toHaveLength(1)

      // Once it has loaded, both widgets render.
      const loaded = fakeTurnstile()
      scripts[0]!.dispatchEvent(new Event('load'))
      await vi.waitFor(() => expect(loaded.render).toHaveBeenCalledTimes(2))
    } finally {
      scope.stop()
      for (const script of scripts) script.remove()
    }
  })
})
