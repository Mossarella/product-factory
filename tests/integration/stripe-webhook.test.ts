import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const originalSecretKey = process.env.STRIPE_SECRET_KEY
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

type UserUpdateArgs = {
  where: { id: string }
  data: {
    plan: string
    licenseActivatedAt: Date
    stripeCustomerId: string
    stripeSubscriptionId: string
    subscriptionStatus: string
  }
}
type UserUpdateManyArgs = {
  where: {
    stripeCustomerId: string
    OR: Array<{ stripeSubscriptionId: string | null }>
  }
  data: {
    plan: string
    stripeSubscriptionId: string
    subscriptionStatus: string
  }
}

const mockUserUpdate = mock<(args: UserUpdateArgs) => Promise<{}>>(() => Promise.resolve({}))
const mockUserUpdateMany = mock<(args: UserUpdateManyArgs) => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 })
)
const mockConstructEvent = mock(() => ({
  type: 'payment_intent.succeeded',
  data: { object: {} },
}))

mock.module('@/lib/db', () => ({
  prisma: {
    user: { update: mockUserUpdate, updateMany: mockUserUpdateMany },
  },
}))

class MockStripeClass {
  webhooks = { constructEvent: mockConstructEvent }

  constructor(_secretKey: string) {}
}

mock.module('stripe', () => ({ default: MockStripeClass }))

const { POST } = await import('@/app/api/stripe/webhook/route')

function request() {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: 'raw-body-placeholder',
    headers: { 'stripe-signature': 'fake-sig' },
  })
}

function restoreEnv(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET', value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake'
  mockUserUpdate.mockReset()
  mockUserUpdate.mockReturnValue(Promise.resolve({}))
  mockUserUpdateMany.mockReset()
  mockUserUpdateMany.mockReturnValue(Promise.resolve({ count: 1 }))
  mockConstructEvent.mockReset()
  mockConstructEvent.mockReturnValue({
    type: 'payment_intent.succeeded',
    data: { object: {} },
  })
})

afterEach(() => {
  restoreEnv('STRIPE_SECRET_KEY', originalSecretKey)
  restoreEnv('STRIPE_WEBHOOK_SECRET', originalWebhookSecret)
})

describe('POST /api/stripe/webhook', () => {
  it('returns 503 when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET

    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Stripe not configured' })
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid fake signature')
    })

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid fake signature' })
  })

  it('grants pro access for a completed checkout session', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-abc',
          customer: 'cus_123',
          subscription: 'sub_456',
        },
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true })
    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    const update = mockUserUpdate.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'user-abc' })
    expect(update.data.plan).toBe('pro')
    expect(update.data.licenseActivatedAt).toBeInstanceOf(Date)
    expect(update.data.stripeCustomerId).toBe('cus_123')
    expect(update.data.stripeSubscriptionId).toBe('sub_456')
    expect(update.data.subscriptionStatus).toBe('active')
  })

  it('syncs an active subscription update to pro access', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_456', customer: 'cus_123', status: 'active' } },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: {
        stripeCustomerId: 'cus_123',
        OR: [{ stripeSubscriptionId: 'sub_456' }, { stripeSubscriptionId: null }],
      },
      data: expect.objectContaining({
        plan: 'pro',
        subscriptionStatus: 'active',
      }),
    })
  })

  it('removes pro access for a past-due subscription update', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_456', customer: 'cus_123', status: 'past_due' } },
    })

    await POST(request())

    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: {
        stripeCustomerId: 'cus_123',
        OR: [{ stripeSubscriptionId: 'sub_456' }, { stripeSubscriptionId: null }],
      },
      data: expect.objectContaining({ plan: 'free' }),
    })
  })

  it('removes pro access for a deleted subscription', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_456', customer: 'cus_123', status: 'canceled' } },
    })

    await POST(request())

    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: {
        stripeCustomerId: 'cus_123',
        OR: [{ stripeSubscriptionId: 'sub_456' }, { stripeSubscriptionId: null }],
      },
      data: expect.objectContaining({
        plan: 'free',
        subscriptionStatus: 'canceled',
      }),
    })
  })

  it('does not let a delayed deleted subscription event target a newer subscription', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_old', customer: 'cus_123', status: 'canceled' } },
    })

    await POST(request())

    const [update] = mockUserUpdateMany.mock.calls[0]!
    expect(update.where).toEqual({
      stripeCustomerId: 'cus_123',
      OR: [{ stripeSubscriptionId: 'sub_old' }, { stripeSubscriptionId: null }],
    })
  })

  it('does not grant access when the checkout has no client reference ID', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: null } },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('does not grant access for other event types', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })
})
