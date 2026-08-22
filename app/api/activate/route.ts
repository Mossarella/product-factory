import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { key?: unknown } | null
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  if (!key) return NextResponse.json({ error: 'License key is required' }, { status: 400 })

  const { data, error } = await supabase.rpc('redeem_license_key', { p_key: key })
  if (error) {
    const status = error.message.includes('Invalid or already-used') ? 404 : 409
    return NextResponse.json({ error: error.message }, { status })
  }
  const result = data?.[0]
  if (!result) return NextResponse.json({ error: 'License activation failed' }, { status: 409 })
  return NextResponse.json({ plan: result.plan, activatedAt: result.activated_at })
}
