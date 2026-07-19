import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { MAX_AVATAR_BYTES } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
  }

  try {
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
    }

    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'avatar')
    const image = `/api/profile/avatar?v=${Date.now()}`

    await prisma.user.update({
      where: { id: userId },
      data: { avatarData: new Uint8Array(buffer), avatarMime: contentTypeFor(filename), image },
    })
    return NextResponse.json({ image })
  } catch {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarData: true, avatarMime: true },
  })
  if (!user?.avatarData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(user.avatarData, {
    headers: { 'Content-Type': user.avatarMime ?? 'application/octet-stream' },
  })
}
