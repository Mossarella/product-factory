import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function toProfile(row: { display_name: string | null; shop_name: string | null; shop_contact: string | null; shop_description: string | null; readme_footer: string | null }) {
  return {
    name: row.display_name,
    shopName: row.shop_name,
    shopContact: row.shop_contact,
    shopDescription: row.shop_description,
    readmeFooter: row.readme_footer,
  }
}

async function getAuthenticatedProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null, error: null }
  let { data: profile, error } = await supabase.from('profiles').select('display_name, shop_name, shop_contact, shop_description, readme_footer').eq('id', user.id).maybeSingle()
  if (!profile && !error) {
    const bootstrapName = user.user_metadata?.full_name || user.email || null
    const result = await supabase.from('profiles').upsert({ id: user.id, display_name: bootstrapName }, { onConflict: 'id' }).select('display_name, shop_name, shop_contact, shop_description, readme_footer').single()
    profile = result.data
    error = result.error
  }
  return { supabase, user, profile, error }
}

export async function GET() {
  const { user, profile, error } = await getAuthenticatedProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(profile ? toProfile(profile) : null)
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { name?: unknown; shopName?: unknown; shopContact?: unknown; shopDescription?: unknown; readmeFooter?: unknown }
  if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const text = (value: unknown) => typeof value === 'string' ? value.trim() || null : null
  const { data, error } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name: body.name.trim(),
    shop_name: text(body.shopName),
    shop_contact: text(body.shopContact),
    shop_description: text(body.shopDescription),
    readme_footer: text(body.readmeFooter),
  }, { onConflict: 'id' }).select('display_name, shop_name, shop_contact, shop_description, readme_footer').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toProfile(data))
}
