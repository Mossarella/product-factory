import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.STRIPE_CHECKOUT_URL
  if (!url) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const checkoutUrl = new URL(url)
  checkoutUrl.searchParams.set('client_reference_id', session.user.id)
  return NextResponse.redirect(checkoutUrl.toString())
}
