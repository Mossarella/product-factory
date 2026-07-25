import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
const originalPriceId = process.env.STRIPE_PRICE_ID
const originalSecretKey = process.env.STRIPE_SECRET_KEY
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION
type MockUserRecord = { stripeCustomerId: string | null; email: string } | null
type CheckoutOptions = Record<string, unknown>

const mockFindUnique = mock<(...args: unknown[]) => Promise<MockUserRecord>>(() => Promise.resolve(null))
const mockCreateCheckoutSession = mock<(options: CheckoutOptions) => Promise<{ url: string }>>(() =>
  Promise.resolve({ url: 'https://checkout.stripe.test/session' })
)

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/db', () => ({ prisma: { user: { findUnique: mockFindUnique } } }))

class MockStripeClass {
  checkout = { sessions: { create: mockCreateCheckoutSession } }

  constructor(_secretKey: string) {}
}

mock.module('stripe', () => ({ default: MockStripeClass }))

const { GET } = await import('@/app/api/buy/route')

function request() {
  return new Request('http://localhost/api/buy')
}

function restoreEnv(name: 'STRIPE_PRICE_ID' | 'STRIPE_SECRET_KEY', value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  currentSession = MOCK_SESSION
  process.env.STRIPE_PRICE_ID = 'price_test_123'
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
  mockFindUnique.mockReset()
  mockFindUnique.mockReturnValue(Promise.resolve(null))
  mockCreateCheckoutSession.mockReset()
  mockCreateCheckoutSession.mockReturnValue(Promise.resolve({ url: 'https://checkout.stripe.test/session' }))
})

afterEach(() => {
  restoreEnv('STRIPE_PRICE_ID', originalPriceId)
  restoreEnv('STRIPE_SECRET_KEY', originalSecretKey)
})

describe('GET /api/buy', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('returns 503 when the price ID is not configured', async () => {
    delete process.env.STRIPE_PRICE_ID

    const response = await GET(request())

    expect(response.status).toBe(503)
  })

  it('returns 503 when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY

    const response = await GET(request())

    expect(response.status).toBe(503)
  })

  it('creates a subscription checkout session and redirects to it', async () => {
    const response = await GET(request())

    expect(response.headers.get('location')).toBe('https://checkout.stripe.test/session')
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
      mode: 'subscription',
      line_items: [{ price: 'price_test_123', quantity: 1 }],
      client_reference_id: MOCK_USER.id,
      customer_email: MOCK_USER.email,
      success_url: 'http://localhost/app/factory?upgraded=1',
      cancel_url: 'http://localhost/app/factory',
    })
  })

  it('uses the existing Stripe customer instead of customer email', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ stripeCustomerId: 'cus_existing', email: MOCK_USER.email }))

    await GET(request())

    const [options] = mockCreateCheckoutSession.mock.calls[0]!
    expect(options.customer).toBe('cus_existing')
    expect(options.customer_email).toBeUndefined()
  })

  it('uses the user email when no Stripe customer exists', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ stripeCustomerId: null, email: MOCK_USER.email }))

    await GET(request())

    const [options] = mockCreateCheckoutSession.mock.calls[0]!
    expect(options.customer).toBeUndefined()
    expect(options.customer_email).toBe(MOCK_USER.email)
  })

  it('returns a JSON 502 when Stripe rejects checkout session creation', async () => {
    mockCreateCheckoutSession.mockImplementation(() => Promise.reject(new Error('No such customer')))

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Could not create checkout session' })
  })
})
