import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { MAX_AVATAR_BYTES } from '@/lib/utils'

function avatarPath(userId: string) {
  return productStoragePath(userId, 'profile', 'avatar')
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_AVATAR_BYTES) return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
  try {
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_AVATAR_BYTES) return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'avatar')
    const contentType = contentTypeFor(filename)
    const { error } = await supabase.storage.from(PRODUCT_FILES_BUCKET).upload(avatarPath(user.id), buffer, { contentType, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ image: `/api/profile/avatar?v=${Date.now()}` })
  } catch {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: object, error } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(avatarPath(user.id))
  if (error || !object) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(await object.arrayBuffer(), { headers: { 'Content-Type': object.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=0, must-revalidate' } })
}
