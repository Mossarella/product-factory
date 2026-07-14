import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Returns a clickable magic link for the given email — dev mode ONLY.
// Reads the VerificationToken that Auth.js just created in the DB.
// In production (NODE_ENV=production) this always returns { devLoginUrl: null }.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ devLoginUrl: null })
  }

  const email = request.nextUrl.searchParams.get('email') ?? ''
  if (!email) return NextResponse.json({ devLoginUrl: null })

  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: email,
      expires: { gt: new Date() },
    },
    orderBy: { expires: 'desc' },
  })

  if (!record) return NextResponse.json({ devLoginUrl: null })

  const base = process.env.AUTH_URL ?? 'http://localhost:3000'
  const params = new URLSearchParams({ callbackUrl: '/app', token: record.token, email })
  const devLoginUrl = `${base}/api/auth/callback/resend?${params.toString()}`

  return NextResponse.json({ devLoginUrl })
}
