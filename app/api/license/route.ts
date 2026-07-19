import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUserLicense } from '@/lib/license'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const license = await getUserLicense(session.user.id)
  return NextResponse.json(license)
}
