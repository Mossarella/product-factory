import { describe, expect, it } from 'bun:test'
import { checkRateLimit } from '@/lib/rate-limit'

describe('checkRateLimit()', () => {
  it('allows the first limit calls within the window', () => {
    const key = 'allows-first-limit-calls'

    expect(checkRateLimit(key, 3, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(checkRateLimit(key, 3, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(checkRateLimit(key, 3, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })

  it('blocks the limit + 1 call within the window', () => {
    const key = 'blocks-limit-plus-one'

    checkRateLimit(key, 2, 1_000)
    checkRateLimit(key, 2, 1_000)

    const result = checkRateLimit(key, 2, 1_000)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps buckets independent for different keys', () => {
    checkRateLimit('independent-key-one', 1, 1_000)

    expect(checkRateLimit('independent-key-one', 1, 1_000).allowed).toBe(false)
    expect(checkRateLimit('independent-key-two', 1, 1_000)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it('allows the same key again after the window elapses', async () => {
    const key = 'allows-after-window-elapses'

    checkRateLimit(key, 1, 50)
    expect(checkRateLimit(key, 1, 50).allowed).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(checkRateLimit(key, 1, 50)).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })
})
