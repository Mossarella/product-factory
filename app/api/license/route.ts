import { readLicense } from '@/lib/license'
import { NextResponse } from 'next/server'

export async function GET() {
  const license = readLicense()
  return NextResponse.json(license)
}
