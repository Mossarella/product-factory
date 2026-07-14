import Stripe from 'stripe'
import { issueKey } from '@/lib/keys'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const rawBody = Buffer.from(await req.arrayBuffer())
  const sig = req.headers.get('stripe-signature') ?? ''
  const stripe = new Stripe(secretKey)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const key = issueKey()
    console.log(`=== License key issued: ${key} ===`)
  }

  return NextResponse.json({ received: true })
}
