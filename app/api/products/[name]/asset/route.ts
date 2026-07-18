import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sanitizeFilename, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'file')
    const directory = userProductPath(userId, productName, 'fixed-assets')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, filename), Buffer.from(await request.arrayBuffer()))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
