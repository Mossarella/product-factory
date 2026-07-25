import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const priceId = process.env.STRIPE_PRICE_ID
  const stripe = getStripeClient()
  if (!priceId || !stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true },
  })
  const origin = new URL(request.url).origin

  let checkoutSession
  try {
    checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: session.user.id,
      ...(user?.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: session.user.email ?? undefined }),
      success_url: `${origin}/app/factory?upgraded=1`,
      cancel_url: `${origin}/app/factory`,
    })
  } catch (err) {
    console.error('Could not create checkout session', err)
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 502 })
  }

  if (!checkoutSession.url) {
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 502 })
  }
  return NextResponse.redirect(checkoutSession.url)
}
