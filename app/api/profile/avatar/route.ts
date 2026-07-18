import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { avatarPath, clearDirectory, contentTypeFor, firstFile, sanitizeFilename } from '@/lib/api-files'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'avatar')
    const directory = avatarPath(userId)
    clearDirectory(directory)
    fs.writeFileSync(path.join(directory, filename), Buffer.from(await request.arrayBuffer()))

    const image = `/api/profile/avatar?v=${Date.now()}`
    await prisma.user.update({ where: { id: userId }, data: { image } })
    return NextResponse.json({ image })
  } catch {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const directory = avatarPath(session.user.id)
    const filename = firstFile(directory)
    if (!filename) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const filePath = path.join(directory, filename)
    return new NextResponse(fs.readFileSync(filePath), {
      headers: { 'Content-Type': contentTypeFor(filename) },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
