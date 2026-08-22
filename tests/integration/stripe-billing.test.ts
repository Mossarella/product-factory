import { beforeEach, describe, expect, mock, test } from 'bun:test'

const OWNER_ID = 'owner-stripe'
const calls = {
  checkout: [] as Array<Record<string, unknown>>,
  purchases: [] as Array<Record<string, unknown>>,
  entitlements: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
}

const stripeMock = {
  checkout: {
    sessions: {
      create: mock(async (payload: Record<string, unknown>) => {
        calls.checkout.push(payload)
        return { url: 'https://checkout.stripe.test/session_123' }
      }),
    },
  },
  webhooks: {
    constructEvent: mock((body: string, signature: string, secret: string) => {
      if (signature !== 'valid-signature' || secret !== 'whsec_test') throw new Error('invalid signature')
      return {
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            payment_status: 'paid',
            amount_total: 2900,
            currency: 'usd',
            customer: 'cus_123',
            client_reference_id: OWNER_ID,
            metadata: { user_id: OWNER_ID, tier: 'creator' },
          },
        },
      }
    }),
  },
}

const userClient = {
  auth: { getUser: mock(async () => ({ data: { user: { id: OWNER_ID, email: 'owner@example.com' } } })) },
  from: mock((table: string) => {
    if (table === 'profiles') {
      const builder = {
        select: mock(() => builder),
        eq: mock(() => builder),
        maybeSingle: mock(async () => ({ data: { stripe_customer_id: null }, error: null })),
      }
      return builder
    }
    throw new Error(`unexpected user table ${table}`)
  }),
}

const adminClient = {
  from: mock((table: string) => {
    if (table === 'billing_purchases') return { upsert: mock(async (payload: Record<string, unknown>) => { calls.purchases.push(payload); return { error: null } }) }
    if (table === 'account_entitlements') return { upsert: mock(async (payload: Record<string, unknown>) => { calls.entitlements.push(payload); return { error: null } }) }
    if (table === 'profiles') {
      return {
        update: mock((payload: Record<string, unknown>) => ({
          eq: mock(async () => { calls.profiles.push(payload); return { error: null } }),
        })),
      }
    }
    throw new Error(`unexpected admin table ${table}`)
  }),
}

mock.module('@/lib/stripe', () => ({ getStripeClient: () => stripeMock }))
mock.module('@/lib/supabase/server', () => ({ createClient: async () => userClient }))
mock.module('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))

const { GET: startCheckout } = await import('@/app/api/buy/route')
const { POST: stripeWebhook } = await import('@/app/api/stripe/webhook/route')

beforeEach(() => {
  calls.checkout = []
  calls.purchases = []
  calls.entitlements = []
  calls.profiles = []
  process.env.STRIPE_CREATOR_PRICE_ID = 'price_creator_test'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

describe('Stripe one-time billing', () => {
  test('creates a Creator Checkout session and redirects the owner', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
    const response = await startCheckout()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://checkout.stripe.test/session_123')
    expect(calls.checkout[0]).toMatchObject({
      mode: 'payment',
      client_reference_id: OWNER_ID,
      metadata: { user_id: OWNER_ID, tier: 'creator' },
      line_items: [{ price: 'price_creator_test', quantity: 1 }],
    })
  })

  test('rejects a webhook with an invalid signature', async () => {
    const response = await stripeWebhook(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'invalid' },
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid Stripe webhook signature' })
  })

  test('records a paid purchase and grants Creator entitlement', async () => {
    const response = await stripeWebhook(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'valid-signature' },
    }))
    expect(response.status).toBe(200)
    expect(calls.purchases[0]).toMatchObject({ owner_id: OWNER_ID, provider: 'stripe', provider_order_id: 'cs_123', tier: 'creator', status: 'completed' })
    expect(calls.entitlements[0]).toMatchObject({ owner_id: OWNER_ID, tier: 'creator', provider_customer_id: 'cus_123', provider_order_id: 'cs_123' })
    expect(calls.profiles[0]).toMatchObject({ plan: 'pro', stripe_customer_id: 'cus_123', subscription_status: 'paid' })
  })
})
