import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
    const checkoutSession = event.data.object as Stripe.Checkout.Session
    const userId = checkoutSession.client_reference_id
    if (userId) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: 'pro',
            licenseActivatedAt: new Date(),
            stripeCustomerId: checkoutSession.customer as string,
            stripeSubscriptionId: checkoutSession.subscription as string,
            subscriptionStatus: 'active',
          },
        })
      } catch (err) {
        console.error(`Stripe webhook: could not grant plan to user ${userId}`, err)
      }
    } else {
      console.error('Stripe webhook: checkout.session.completed with no client_reference_id')
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    const isActive = subscription.status === 'active' || subscription.status === 'trialing'
    try {
      await prisma.user.updateMany({
        where: {
          stripeCustomerId: customerId,
          OR: [{ stripeSubscriptionId: subscription.id }, { stripeSubscriptionId: null }],
        },
        data: {
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          plan: isActive ? 'pro' : 'free',
        },
      })
    } catch (err) {
      console.error(`Stripe webhook: could not sync subscription for customer ${customerId}`, err)
    }
  }

  return NextResponse.json({ received: true })
}
