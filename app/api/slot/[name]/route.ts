import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { assetPath, contentTypeFor, decodeSegment, firstFile } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { name } = await params
    const decodedName = decodeSegment(name)
    const directory = assetPath(decodedName)
    const filename = firstFile(directory)
    if (!filename) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const filePath = path.join(directory, filename)
    console.log(`serve global slot file: ${decodedName}/${filename}`)
    return new NextResponse(fs.readFileSync(filePath), {
      headers: { 'Content-Type': contentTypeFor(filename) },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
