import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEntitlement } from '@/lib/entitlements'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_my_license')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const license = data?.[0]
  try {
    const entitlement = await getEntitlement(supabase)
    return NextResponse.json({
      plan: entitlement.tier === 'free' ? 'free' : 'pro',
      tier: entitlement.tier,
      activatedAt: license?.activated_at ?? undefined,
      subscriptionStatus: license?.subscription_status ?? undefined,
      productCount: entitlement.productCount,
      productLimit: entitlement.productLimit,
      storageUsedBytes: entitlement.storageUsedBytes,
      storageLimitBytes: entitlement.storageLimitBytes,
      maxFileBytes: entitlement.maxFileBytes,
      etsyEnabled: entitlement.etsyEnabled,
      releaseRetention: entitlement.releaseRetention,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load entitlement' }, { status: 500 })
  }
}
