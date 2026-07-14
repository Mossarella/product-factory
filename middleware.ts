import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const needsAuth =
    pathname.startsWith('/app') ||
    pathname.startsWith('/api/products') ||
    pathname === '/api/license' ||
    pathname === '/api/activate' ||
    pathname === '/api/buy'

  if (!isLoggedIn && needsAuth) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  matcher: ['/app/:path*', '/api/products/:path*', '/api/license', '/api/activate', '/api/buy'],
}
