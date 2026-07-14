import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.STRIPE_CHECKOUT_URL
  if (!url) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  return NextResponse.redirect(url)
}
