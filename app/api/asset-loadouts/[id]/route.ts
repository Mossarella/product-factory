import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapAssetLoadout, normalizeAssetLoadout } from '@/lib/asset-loadouts'

interface Context {
  params: Promise<{ id: string }>
}

async function getOwnedId(context: Context) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, id: null }
  const { id } = await context.params
  return { supabase, user, id }
}

export async function PATCH(request: Request, context: Context) {
  const { supabase, user, id } = await getOwnedId(context)
  if (!user || !id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { name?: unknown; assetKeys?: unknown }
  const update: { name?: string; asset_keys?: string[] } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return NextResponse.json({ error: 'Name must be a string' }, { status: 400 })
    const name = body.name.trim().replace(/\s+/g, ' ')
    if (!name || name.length > 80) return NextResponse.json({ error: 'Name must be between 1 and 80 characters' }, { status: 400 })
    update.name = name
  }
  if (body.assetKeys !== undefined) {
    if (!Array.isArray(body.assetKeys) || !body.assetKeys.every((key) => typeof key === 'string')) {
      return NextResponse.json({ error: 'assetKeys must be an array of strings' }, { status: 400 })
    }
    update.asset_keys = normalizeAssetLoadout({ name: '', assetKeys: body.assetKeys }).assetKeys
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })

  const { data, error } = await supabase
    .from('asset_loadouts')
    .update(update)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, name, asset_keys, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Loadout not found' }, { status: 404 })
    if (error.code === '23505') return NextResponse.json({ error: 'A loadout with this name already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(mapAssetLoadout(data))
}

export async function DELETE(_request: Request, context: Context) {
  const { supabase, user, id } = await getOwnedId(context)
  if (!user || !id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('asset_loadouts')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count !== 1) return NextResponse.json({ error: 'Loadout not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
