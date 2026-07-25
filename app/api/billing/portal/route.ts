import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripeClient()
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  let portalSession
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/app/factory`,
    })
  } catch (err) {
    console.error('Could not create billing portal session', err)
    return NextResponse.json({ error: 'Could not create billing portal session' }, { status: 502 })
  }

  return NextResponse.redirect(portalSession.url)
}
