import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
const ORIGINAL_STRIPE_CHECKOUT_URL = process.env.STRIPE_CHECKOUT_URL
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))

const { GET } = await import('@/app/api/buy/route')

beforeEach(() => {
  currentSession = MOCK_SESSION
})

afterEach(() => {
  currentSession = MOCK_SESSION
  if (ORIGINAL_STRIPE_CHECKOUT_URL === undefined) {
    delete process.env.STRIPE_CHECKOUT_URL
  } else {
    process.env.STRIPE_CHECKOUT_URL = ORIGINAL_STRIPE_CHECKOUT_URL
  }
})

describe('GET /api/buy', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns 503 when Stripe is not configured', async () => {
    delete process.env.STRIPE_CHECKOUT_URL

    const res = await GET()

    expect(res.status).toBe(503)
  })

  it('redirects to Stripe with the user id as client_reference_id', async () => {
    process.env.STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/test_abc'

    const res = await GET()
    const location = res.headers.get('location')

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(location).not.toBeNull()
    expect(location).toContain('buy.stripe.com/test_abc')
    expect(new URL(location!).searchParams.get('client_reference_id')).toBe(MOCK_USER.id)
  })
})
