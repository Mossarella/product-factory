import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function toTemplate(row: { id: string; name: string; assets: string[]; rules: unknown }) {
  return { id: row.id, name: row.name, assets: row.assets, rules: row.rules }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('product_templates').select('id, name, assets, rules').eq('owner_id', user.id).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(toTemplate))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { name?: unknown; assets?: unknown; rules?: unknown }
  if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const assets = body.assets === undefined ? [] : body.assets
  const rules = body.rules === undefined ? [] : body.rules
  if (!Array.isArray(assets) || !assets.every((asset) => typeof asset === 'string')) return NextResponse.json({ error: 'Assets must be an array of strings' }, { status: 400 })
  if (!Array.isArray(rules)) return NextResponse.json({ error: 'Rules must be an array' }, { status: 400 })
  const { data, error } = await supabase.from('product_templates').insert({ owner_id: user.id, name: body.name.trim(), assets, rules: JSON.parse(JSON.stringify(rules)) }).select('id, name, assets, rules').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toTemplate(data), { status: 201 })
}
