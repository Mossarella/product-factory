import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { updateSession } from '@/lib/supabase/proxy'

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { response, user } = await updateSession(request)

  if (request.method === 'POST' && pathname.startsWith('/api/products/') && pathname.endsWith('/ai')) {
    const result = checkRateLimit(`ai:${user?.id ?? 'anonymous'}`, 10, 60_000)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      )
    }
  }

  const needsAuth =
    pathname.startsWith('/app') ||
    pathname.startsWith('/api/products') ||
    pathname === '/api/license' ||
    pathname === '/api/activate' ||
    pathname === '/api/buy' ||
    pathname === '/api/billing/portal'

  if (!user && needsAuth) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/app/:path*',
    '/api/products/:path*',
    '/api/license',
    '/api/activate',
    '/api/buy',
    '/api/billing/portal',
    '/auth/callback',
  ],
}
