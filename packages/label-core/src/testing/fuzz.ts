/**
 * Strings for comparing a rewritten function with the one it replaces, for tests only.
 *
 * Seeded, so a failure names an input that can be run again, and drawn from a small
 * alphabet, so the characters a pattern treats specially meet each other often. Written
 * for the linear rewrites of `docs/security-review-2026-10-18.md`, finding 1, where the
 * old implementation stays in the test as the oracle the new one must agree with.
 */
export function fuzzStrings(
  alphabet: readonly string[],
  {
    count = 5_000,
    maxLength = 24,
    seed = 1,
  }: { count?: number; maxLength?: number; seed?: number } = {},
): string[] {
  // mulberry32: a 32-bit generator, enough to vary short strings.
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  return Array.from({ length: count }, () => {
    const length = Math.floor(next() * (maxLength + 1))
    let text = ''
    for (let i = 0; i < length; i++) text += alphabet[Math.floor(next() * alphabet.length)]
    return text
  })
}
