import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'

const ORIGINAL_STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY
})

afterEach(() => {
  if (ORIGINAL_STRIPE_SECRET_KEY === undefined) {
    delete process.env.STRIPE_SECRET_KEY
  } else {
    process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_SECRET_KEY
  }
})

describe('getStripeClient', () => {
  it('returns null when STRIPE_SECRET_KEY is unset', () => {
    expect(getStripeClient()).toBeNull()
  })

  it('returns a Stripe instance when STRIPE_SECRET_KEY is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'

    expect(getStripeClient()).toBeInstanceOf(Stripe)
  })

  it('returns the same instance on repeated calls', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'

    expect(getStripeClient()).toBe(getStripeClient())
  })
})
