import { markKeyUsed, validateKey } from '@/lib/keys'
import { readLicense, writeLicense } from '@/lib/license'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { key } = await req.json() as { key: string }
  const record = validateKey(key)

  if (!record) {
    return NextResponse.json({ error: 'Invalid license key' }, { status: 404 })
  }

  const license = readLicense()
  if (record.used) {
    if (license.key === key) {
      return NextResponse.json({ plan: 'pro', activatedAt: license.activatedAt })
    }

    return NextResponse.json({ error: 'Key already activated' }, { status: 409 })
  }

  const activatedAt = new Date().toISOString()
  writeLicense({ key, plan: record.plan, activatedAt })
  markKeyUsed(key)

  return NextResponse.json({ plan: 'pro', activatedAt })
}
