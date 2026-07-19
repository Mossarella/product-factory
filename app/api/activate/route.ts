import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { redeemKey } from '@/lib/keys'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await request.json() as { key: string }
  const result = await redeemKey(key, session.user.id)

  if ('error' in result) {
    const status = result.error === 'Invalid license key' ? 404 : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result)
}
