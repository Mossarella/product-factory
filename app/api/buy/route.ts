import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login?next=/api/buy', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))

  const stripe = getStripeClient()
  const priceId = process.env.STRIPE_CREATOR_PRICE_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!stripe || !priceId || !appUrl) {
    return NextResponse.json({ error: 'Stripe billing is not configured' }, { status: 503 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: profile?.stripe_customer_id ?? undefined,
      customer_email: profile?.stripe_customer_id ? undefined : user.email ?? undefined,
      client_reference_id: user.id,
      metadata: { user_id: user.id, tier: 'creator' },
      payment_intent_data: { metadata: { user_id: user.id, tier: 'creator' } },
      allow_promotion_codes: true,
      success_url: `${appUrl}/app?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app?billing=cancelled`,
    })

    if (!session.url) return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 })
    return NextResponse.redirect(session.url)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create Stripe checkout session' }, { status: 502 })
  }
}
