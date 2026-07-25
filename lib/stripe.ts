import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null
  if (!client) client = new Stripe(secretKey)
  return client
}
