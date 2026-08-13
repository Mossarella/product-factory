import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AiNotConfiguredError, generateDescription, suggestTags, reviewListing } from '@/lib/ai'
import type { TemplateData } from '@/lib/templates'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; context?: TemplateData }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.context || !body.action) return NextResponse.json({ error: 'Missing action or context' }, { status: 400 })

  try {
    if (body.action === 'description') return NextResponse.json({ description: await generateDescription(body.context) })
    if (body.action === 'tags') return NextResponse.json({ tags: await suggestTags(body.context) })
    if (body.action === 'review') return NextResponse.json(await reviewListing(body.context))
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return NextResponse.json({ error: 'AI features are not configured' }, { status: 503 })
    return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
  }
}
