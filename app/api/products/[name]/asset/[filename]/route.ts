import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { contentTypeFor, sanitizeFilename, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string; filename: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, filename } = await params
  const productName = decodeURIComponent(name)
  const safeFilename = sanitizeFilename(decodeURIComponent(filename))

  try {
    const filePath = userProductPath(userId, productName, 'fixed-assets', safeFilename)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    return new NextResponse(fs.readFileSync(filePath), {
      headers: { 'Content-Type': contentTypeFor(safeFilename) },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
