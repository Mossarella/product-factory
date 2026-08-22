import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

function toTemplate(row: { id: string; name: string; assets: string[]; rules: unknown }) {
  return { id: row.id, name: row.name, assets: row.assets, rules: row.rules }
}

interface RouteContext {
  params: Promise<{ id: string }>
}

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await authenticatedClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('product_templates').select('id, name, assets, rules').eq('owner_id', user.id).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(toTemplate(data))
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { supabase, user } = await authenticatedClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json() as { name?: unknown; assets?: unknown; rules?: unknown }
  const update: { name?: string; assets?: string[]; rules?: Json } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    update.name = body.name.trim()
  }
  if (body.assets !== undefined) {
    if (!Array.isArray(body.assets) || !body.assets.every((asset) => typeof asset === 'string')) return NextResponse.json({ error: 'Assets must be an array of strings' }, { status: 400 })
    update.assets = body.assets
  }
  if (body.rules !== undefined) {
    if (!Array.isArray(body.rules)) return NextResponse.json({ error: 'Rules must be an array' }, { status: 400 })
    update.rules = JSON.parse(JSON.stringify(body.rules)) as Json
  }
  const { data, error } = await supabase.from('product_templates').update(update).eq('owner_id', user.id).eq('id', id).select('id, name, assets, rules').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(toTemplate(data))
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await authenticatedClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('product_templates').delete().eq('owner_id', user.id).eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
