# Spec: Sidebar + Morning Report Dashboard

## Goal
Add a persistent sidebar to the `/app` shell and a Morning Report dashboard at `/app/dashboard`.
The factory UI moves from `/app` to `/app/factory`.

---

## Route changes

| Before | After |
|---|---|
| `/app` (factory) | `/app` → redirect to `/app/dashboard` |
| — | `/app/dashboard` (new) — Morning Report |
| — | `/app/factory` (new) — product factory (same code) |

The factory page at `app/app/page.tsx` must be **moved** (copy + delete original) to `app/app/factory/page.tsx`.
`app/app/page.tsx` becomes a simple redirect: `redirect('/app/dashboard')`.

---

## Files to create / modify

### 1. `components/Sidebar.tsx` (new, client component)

Persistent left sidebar ~220px wide. Dark monospace theme consistent with the rest of the app.

Structure:
```
┌────────────────────────┐
│  FACTORY               │  ← brand, top-left, bold
│  MossarellaStudio      │  ← subtitle muted
├────────────────────────┤
│  [icon] Dashboard      │  ← active: violet left border + bg highlight
│  [icon] Factory        │
├────────────────────────┤
│  (spacer flex-1)       │
├────────────────────────┤
│  user@email.com        │  ← session user email, truncated
│  Sign out              │  ← calls signOut() from next-auth/react
└────────────────────────┘
```

- Use `usePathname()` from `next/navigation` for active state
- Active item: `border-l-2 border-violet-500 bg-zinc-800/60 text-zinc-100`
- Inactive item: `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40`
- Icons: use simple inline SVG (no icon library dependency) — just a 16x16 grid square for Dashboard, box for Factory
- Sign out button calls `signOut()` from `next-auth/react` with `callbackUrl: '/'`
- The component accepts a `user` prop: `{ email: string | null | undefined; name: string | null | undefined }`
- Brand area links to `/app/dashboard`

Styling:
```
aside: h-screen w-56 flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 fixed left-0 top-0 z-30
```
(The main content area must have `ml-56` to clear the fixed sidebar.)

### 2. `app/app/layout.tsx` (modify)

Wrap children with sidebar layout. This is a server component that calls `auth()` to get the session user for the sidebar.

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Product Factory — MossarellaStudio',
  description: 'Pack your digital products. List on Etsy.',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar user={{ email: session.user.email, name: session.user.name }} />
      <main className="ml-56 flex-1 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

### 3. `app/app/page.tsx` (replace with redirect)

```tsx
import { redirect } from 'next/navigation'
export default function AppRoot() {
  redirect('/app/dashboard')
}
```

### 4. `app/app/factory/page.tsx` (new — copy of current `app/app/page.tsx`)

Copy the ENTIRE current contents of `app/app/page.tsx` verbatim to `app/app/factory/page.tsx`. Do not modify the content at all.

### 5. `app/api/dashboard/route.ts` (new)

Server-only API route. Requires auth. Queries Prisma + checks filesystem to compute stats.

```ts
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR } from '@/lib/api-files'

function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter(f => !f.startsWith('.')).length === 0
  } catch {
    return true // dir doesn't exist = no hero
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: { name: true, complete: true, description: true, etsyTitle: true, files: { select: { id: true } } },
  })

  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(p => !p.description || p.description.trim() === '').length

  // Last export: not tracked yet, return null
  const lastExport: string | null = null

  return NextResponse.json({ total, readyToPublish, needsReview, missingHero, needReadme, lastExport })
}
```

### 6. `app/app/dashboard/page.tsx` (new — server component)

Morning Report page. Fetches stats via direct Prisma query (not fetch, since server component).

Design:
```
Good morning, Moss          ← greeting based on hour, name from session
Today is Tuesday, 15 Jul    ← formatted date

┌────────────────────────────────────────────────────────────────────┐
│  TOTAL PRODUCTS     READY TO PUBLISH     NEEDS REVIEW              │
│       42                  3                   5                    │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│  MISSING HERO    NEED README    LAST EXPORT                        │
│       2              1           Yesterday                         │
└────────────────────────────────────────────────────────────────────┘
```

Full component spec:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR } from '@/lib/api-files'

function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter((f: string) => !f.startsWith('.')).length === 0
  } catch {
    return true
  }
}

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name ? name.split(' ')[0] : 'there'
  return `Good ${time}, ${first}`
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: { name: true, complete: true, description: true, etsyTitle: true, files: { select: { id: true } } },
  })

  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(p => !p.description || p.description.trim() === '').length

  const stats = [
    { label: 'Total Products', value: total, color: 'text-zinc-100' },
    { label: 'Ready to Publish', value: readyToPublish, color: 'text-emerald-400' },
    { label: 'Needs Review', value: needsReview, color: 'text-amber-400' },
    { label: 'Missing Hero', value: missingHero, color: missingHero > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Need README', value: needReadme, color: needReadme > 0 ? 'text-red-400' : 'text-zinc-500' },
    { label: 'Last Export', value: 'Never', color: 'text-zinc-600' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      {/* Greeting */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-100 font-mono">{greeting(session.user.name)}</h1>
        <p className="text-zinc-500 text-sm mt-1 font-mono">{formatDate()}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-2">{s.label}</p>
            <p className={`text-4xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick link to factory */}
      <div className="mt-8">
        <a
          href="/app/factory"
          className="inline-block border border-violet-700 bg-violet-700/20 px-5 py-2.5 text-sm text-violet-300 hover:bg-violet-700/40 font-mono transition-colors"
        >
          Open Factory →
        </a>
      </div>
    </div>
  )
}
```

---

## Constraints
- Do NOT change any API route logic or product data model
- Do NOT add new npm packages — no icon libraries, no chart libraries
- Use only Tailwind utility classes consistent with the existing dark monospace theme (zinc palette, violet accents)
- The sidebar must be `'use client'` because it uses `usePathname()` and `signOut()`
- `app/app/layout.tsx` must be a server component (calls `auth()`)
- The factory page at `app/app/factory/page.tsx` must be byte-for-byte identical to the current `app/app/page.tsx` content
- After creating `app/app/factory/page.tsx`, replace `app/app/page.tsx` with the redirect only
