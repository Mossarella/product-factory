import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_my_license')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const license = data?.[0]
  return NextResponse.json({
    plan: license?.plan === 'pro' ? 'pro' : 'free',
    activatedAt: license?.activated_at ?? undefined,
    subscriptionStatus: license?.subscription_status ?? undefined,
  })
}
