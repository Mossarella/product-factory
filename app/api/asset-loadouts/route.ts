import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapAssetLoadout, normalizeAssetLoadout } from '@/lib/asset-loadouts'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('asset_loadouts')
    .select('id, name, asset_keys, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(mapAssetLoadout))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { name?: unknown; assetKeys?: unknown }
  if (typeof body.name !== 'string') return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!Array.isArray(body.assetKeys) || !body.assetKeys.every((key) => typeof key === 'string')) {
    return NextResponse.json({ error: 'assetKeys must be an array of strings' }, { status: 400 })
  }

  const input = normalizeAssetLoadout({ name: body.name, assetKeys: body.assetKeys })
  if (!input.name || input.name.length > 80) return NextResponse.json({ error: 'Name must be between 1 and 80 characters' }, { status: 400 })

  const { data, error } = await supabase
    .from('asset_loadouts')
    .insert({ owner_id: user.id, name: input.name, asset_keys: input.assetKeys })
    .select('id, name, asset_keys, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A loadout with this name already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(mapAssetLoadout(data), { status: 201 })
}
