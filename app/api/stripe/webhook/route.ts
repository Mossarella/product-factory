import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function metadataFor(event: Stripe.Event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    return {
      userId: session.metadata?.user_id ?? session.client_reference_id ?? null,
      tier: session.metadata?.tier ?? 'creator',
      providerOrderId: session.id,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
    }
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent
  return {
    userId: paymentIntent.metadata?.user_id ?? null,
    tier: paymentIntent.metadata?.tier ?? 'creator',
    providerOrderId: paymentIntent.id,
    customerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id ?? null,
    amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency,
  }
}

export async function POST(request: Request) {
  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')
  if (!stripe || !webhookSecret || !signature) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe webhook signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true })
  }

  const metadata = metadataFor(event)
  if (!metadata.userId || metadata.tier !== 'creator') {
    return NextResponse.json({ error: 'Stripe payment is missing valid Product Factory metadata' }, { status: 422 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') return NextResponse.json({ received: true, pending: true })
  }

  const admin = createAdminClient()
  const { error: purchaseError } = await admin.from('billing_purchases').upsert({
    owner_id: metadata.userId,
    provider: 'stripe',
    provider_order_id: metadata.providerOrderId,
    tier: metadata.tier,
    amount_cents: metadata.amountCents,
    currency: metadata.currency,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }, { onConflict: 'provider_order_id' })
  if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 })

  const { error: entitlementError } = await admin.from('account_entitlements').upsert({
    owner_id: metadata.userId,
    tier: metadata.tier,
    provider_customer_id: metadata.customerId,
    provider_order_id: metadata.providerOrderId,
    purchased_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' })
  if (entitlementError) return NextResponse.json({ error: entitlementError.message }, { status: 500 })

  const { error: profileError } = await admin.from('profiles').update({
    plan: 'pro',
    stripe_customer_id: metadata.customerId,
    license_activated_at: new Date().toISOString(),
    subscription_status: 'paid',
  }).eq('id', metadata.userId)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ received: true, tier: metadata.tier })
}
