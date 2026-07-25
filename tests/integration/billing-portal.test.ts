import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
const originalSecretKey = process.env.STRIPE_SECRET_KEY
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION
type MockUserRecord = { stripeCustomerId: string } | null
type PortalOptions = Record<string, unknown>

const mockFindUnique = mock<(...args: unknown[]) => Promise<MockUserRecord>>(() => Promise.resolve(null))
const mockCreatePortalSession = mock<(options: PortalOptions) => Promise<{ url: string }>>(() =>
  Promise.resolve({ url: 'https://billing.stripe.test/portal' })
)

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/db', () => ({ prisma: { user: { findUnique: mockFindUnique } } }))

class MockStripeClass {
  billingPortal = { sessions: { create: mockCreatePortalSession } }

  constructor(_secretKey: string) {}
}

mock.module('stripe', () => ({ default: MockStripeClass }))

const { GET } = await import('@/app/api/billing/portal/route')

function request() {
  return new Request('http://localhost/api/billing/portal')
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
  mockFindUnique.mockReset()
  mockFindUnique.mockReturnValue(Promise.resolve(null))
  mockCreatePortalSession.mockReset()
  mockCreatePortalSession.mockReturnValue(Promise.resolve({ url: 'https://billing.stripe.test/portal' }))
})

afterEach(() => {
  if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalSecretKey
})

describe('GET /api/billing/portal', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('returns 503 when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY

    const response = await GET(request())

    expect(response.status).toBe(503)
  })

  it('returns 400 when the user has no Stripe customer', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
  })

  it('creates a portal session and redirects to it', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ stripeCustomerId: 'cus_existing' }))

    const response = await GET(request())

    expect(response.headers.get('location')).toBe('https://billing.stripe.test/portal')
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_existing',
      return_url: 'http://localhost/app/factory',
    })
  })

  it('returns a JSON 502 when Stripe rejects portal session creation', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ stripeCustomerId: 'cus_existing' }))
    mockCreatePortalSession.mockImplementation(() => Promise.reject(new Error('No such customer')))

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Could not create billing portal session' })
  })
})
