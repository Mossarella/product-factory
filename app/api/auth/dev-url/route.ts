import { NextRequest, NextResponse } from 'next/server'
import { getDevLoginUrl } from '@/lib/dev-auth'

// Returns a clickable magic link for the given email — dev mode ONLY.
// Auth.js stores hashed tokens in the DB, so we read the plain URL captured
// when sendVerificationRequest ran. In production this always returns null.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ devLoginUrl: null })
  }

  const email = request.nextUrl.searchParams.get('email') ?? ''
  if (!email) return NextResponse.json({ devLoginUrl: null })

  const devLoginUrl = getDevLoginUrl(email)
  return NextResponse.json({ devLoginUrl })
}
