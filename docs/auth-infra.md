# Spec: Auth infrastructure — Prisma schema, lib/db.ts, auth.ts, middleware.ts, login page

## Stack
- Next.js 16 App Router, TypeScript
- next-auth@beta (Auth.js v5), @auth/prisma-adapter
- Prisma + PostgreSQL
- Resend for magic link email
- Dark zinc/violet monospace theme

---

## File 1: prisma/schema.prisma

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth.js required tables ──────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
  products      Product[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}

// ─── Product data ─────────────────────────────────────────────────────────────

model Product {
  id              String       @id @default(cuid())
  userId          String
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String
  sku             String       @default("")
  productName     String       @default("")
  etsyTitle       String       @default("")
  description     String       @default("") @db.Text
  notes           String       @default("") @db.Text
  contact         String       @default("")
  price           Float        @default(0)
  currency        String       @default("USD")
  licenseType     String       @default("personal")
  commercialPrice Float?
  folders         String[]
  etsyTags        String[]
  complete        Boolean      @default(false)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  files           MascotFile[]

  @@unique([userId, name])
  @@index([userId])
}

model MascotFile {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  filename  String
  origName  String
  folder    String  @default("Main")
  variant   String  @default("")
}
```

---

## File 2: lib/db.ts

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

---

## File 3: auth.ts

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/auth.ts`:

```ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? 'Product Factory <noreply@resend.dev>',
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?check-email=1',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id
      }
      return session
    },
  },
})
```

---

## File 4: types/next-auth.d.ts

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}
```

---

## File 5: app/api/auth/[...nextauth]/route.ts

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

---

## File 6: middleware.ts

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/middleware.ts`:

```ts
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
```

---

## File 7: app/login/page.tsx

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/login/page.tsx`:

This is a CLIENT component ('use client').

```tsx
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const checkEmail = searchParams['check-email'] === '1'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(checkEmail)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const result = await signIn('resend', { email: trimmed, redirect: false })
      if (result?.error) {
        setError('Could not send magic link. Try again.')
      } else {
        setSent(true)
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-2">MossarellaStudio</p>
          <h1 className="text-2xl font-bold text-zinc-100">Product Factory</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to manage your digital products</p>
        </div>

        {sent ? (
          <div className="border border-emerald-800 bg-emerald-950/40 p-6">
            <p className="text-emerald-400 font-bold mb-2">Check your email</p>
            <p className="text-zinc-400 text-sm">
              We sent a magic link to <span className="text-zinc-200">{email || 'your email'}</span>.
              Click the link to sign in — no password needed.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 text-xs text-zinc-600 hover:text-zinc-400"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-widest text-zinc-600 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full border border-violet-600 bg-violet-600 px-4 py-2.5 text-sm text-zinc-100 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link →'}
            </button>
            <p className="text-xs text-zinc-600 text-center">
              No password. No account setup. Just enter your email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
```

---

## Verification
- All 7 files created
- Print: === COMPLETE: auth infrastructure ===
