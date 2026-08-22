import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params

  if (!/^[\w\-]+\.txt$/.test(name)) {
    return NextResponse.json({ error: 'Bad name' }, { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'templates', name)
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain' } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
