import NextAuth from 'next-auth'
import authConfig from './auth.config'
import { checkRateLimit } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl

  if (req.method === 'POST' && pathname.startsWith('/api/products/') && pathname.endsWith('/ai')) {
    const result = checkRateLimit(`ai:${req.auth?.user?.id ?? 'anonymous'}`, 10, 60_000)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
      )
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/signin/nodemailer') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const result = checkRateLimit(`signin:${ip}`, 5, 15 * 60_000)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
      )
    }
  }

  const isLoggedIn = !!req.auth

  const needsAuth =
    pathname.startsWith('/app') ||
    pathname.startsWith('/api/products') ||
    pathname === '/api/license' ||
    pathname === '/api/activate' ||
    pathname === '/api/buy' ||
    pathname === '/api/billing/portal'

  if (!isLoggedIn && needsAuth) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  matcher: [
    '/app/:path*',
    '/api/products/:path*',
    '/api/license',
    '/api/activate',
    '/api/buy',
    '/api/billing/portal',
    '/api/auth/:path*',
  ],
}
