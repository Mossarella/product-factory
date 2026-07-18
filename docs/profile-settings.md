# Spec: Profile/Settings menu + sidebar avatar badge

## Overview
Add profile customization: a small avatar badge pinned at the bottom of
the sidebar that opens a dropdown (name, email, Settings link, Sign out),
and a new `/app/settings` page where the user can edit their display name
and upload a display image (avatar). Email is shown read-only.

## Follows the pattern of
- `components/FixedAssets.tsx`'s `AssetSlot` — hidden `<input type="file">`
  + ref + `Button` "Pick file" triggering `.click()` — exact pattern for
  the new avatar upload control.
- `components/ProductSelector.tsx`'s save-flash UX (`saveFlash` state,
  "Saved!" text after a successful save) — exact pattern for the display
  name save confirmation.
- `lib/utils.ts`'s `avatarColor(name)` — reused as-is for the new
  user-avatar fallback background color (don't invent a new color scheme).
- `app/api/products/[name]/file/route.ts` + `app/api/slot/[name]/route.ts`
  + `lib/api-files.ts` — raw binary POST body + `x-filename` header
  (no multipart parsing anywhere in this app), local-disk storage guarded
  by `resolveWithin()`, served back via a GET route using `firstFile()` +
  `contentTypeFor()` + `fs.readFileSync()`. The new avatar upload/serve
  routes are a direct copy of this shape, scoped per-user.

## Requirements

### Functional
1. Sidebar footer (currently: raw email text + "Sign out" button) becomes
   a small `Avatar` (image or initials-fallback) that opens a
   `DropdownMenu` on click, showing: name (bold), email (muted), a
   "Settings" item linking to `/app/settings`, a separator, and a
   destructive-styled "Sign out" item (same `signOut({ callbackUrl: '/' })`
   call as today).
2. `/app/settings` page: a single "Profile" `Card` with:
   - Avatar preview + "Upload image" button → uploads a new avatar.
   - Display name `Input` + "Save" `Button` → updates the name, shows a
     brief "Saved!" confirmation.
   - Email shown read-only (not editable).
3. After saving the name or uploading an avatar, the sidebar's avatar/name
   must update immediately, with no page reload and no re-login — this
   requires Auth.js's session `update()` mechanism (see Architecture check).
4. No new top-level sidebar nav-array entry — Settings is reached only via
   the avatar dropdown's menu item.

### Non-functional
- shadcn/ui only (this project's Base UI-flavored variant — confirm any
  newly-added `components/ui/*.tsx` files import from `@base-ui/react/*`,
  NOT `@radix-ui/*`, matching every existing file in that directory).
- No schema migration — `User.name`/`User.image` already exist in
  `prisma/schema.prisma` (both `String?`).
- Every new pure function needs a unit test; the full profile-update flow
  needs an E2E test (mandatory project testing rule).

## Architecture check
- Layer: presentation + light API routes, matching every other feature in
  this app (no service/usecase layer exists — pages call `fetch()` against
  `app/api/*` routes directly, which call Prisma directly).
- `auth.ts` changes: this project's session strategy is `'jwt'`
  (`session: { strategy: 'jwt' }`), meaning `auth()`/`useSession()` read
  from a signed cookie, not a fresh DB read per request. Editing `User.name`/
  `User.image` in the DB does NOT automatically change what an already-
  signed-in user's session shows. Auth.js's supported fix: call
  `update(partialSession)` from `next-auth/react` on the client after a
  successful save, which POSTs to `/api/auth/session` with
  `trigger: 'update'`; the `jwt` callback must merge that partial payload
  into the token, and the `session` callback must map the token back onto
  `session.user`. This requires a `<SessionProvider>` in the client tree
  (does not exist yet anywhere in this app) so `useSession()`/`update()`
  work at all.
- Imports allowed: new API routes import `@/auth`, `@/lib/db`,
  `@/lib/api-files`, matching every existing route. New client components
  import `@/components/ui/*`, `@/lib/utils`, `next-auth/react`.
- Imports forbidden: `components/ui/*` files must stay client-safe (no
  `@/lib/db`/`@/auth` imports) — same constraint as every existing
  `components/ui/*` file.

## Implementation

### 1. `lib/utils.ts` — add `getInitials()`
Add alongside existing exports (`avatarColor`, `greeting`, `formatDate`,
`tagKey`), don't touch them:
```ts
export function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim()
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean)
    const initials = parts.slice(0, 2).map((part) => part[0]).join('')
    if (initials) return initials.toUpperCase()
  }
  const localPart = email?.trim().split('@')[0]
  if (localPart) return localPart.slice(0, 2).toUpperCase()
  return '?'
}
```
Add unit tests to `tests/unit/utils.test.ts` (same file/style as the
existing `describe`/`it` blocks): two-word name ("Joe Mama" → "JM"),
single-word name ("Cher" → "C"), no name falls back to email local-part
("bob@x.com" with no name → "BO"), both null/undefined → "?".

### 2. `lib/api-files.ts` — add avatar path helper
Add after the existing `PRODUCTS_DIR`/`ASSETS_DIR` constants:
```ts
export const AVATARS_DIR = path.join(ROOT, 'avatars')
```
Add after `assetPath()`:
```ts
export function avatarPath(userId: string): string {
  return resolveWithin(AVATARS_DIR, userId)
}
```
Don't touch any other existing export in this file.

### 3. `auth.ts` — live session updates
Read the current file first (43 lines). Replace the `callbacks` block:
```ts
callbacks: {
  jwt({ token, user, trigger, session }) {
    if (user) token.sub = user.id
    if (trigger === 'update' && session) {
      if (typeof session.name === 'string') token.name = session.name
      if (typeof session.image === 'string') token.picture = session.image
    }
    return token
  },
  session({ session, token }) {
    if (session.user && token.sub) {
      session.user.id = token.sub
      session.user.name = (token.name as string | null) ?? session.user.name
      session.user.image = (token.picture as string | null) ?? null
    }
    return session
  },
},
```
Keep everything else in the file (adapter, providers, pages, session
strategy) exactly as-is.

### 4. `components/SessionProviderWrapper.tsx` (new, client component)
```tsx
'use client'

import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'

export function SessionProviderWrapper({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return <SessionProvider session={session}>{children}</SessionProvider>
}
```

### 5. `app/app/layout.tsx` — wrap in the session provider
Read the current file first (23 lines). It currently does:
```tsx
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
```
Change to wrap the whole returned tree in `<SessionProviderWrapper
session={session}>`, and stop passing the `user` prop to `<Sidebar>`
(Sidebar will read `useSession()` internally instead — see step 7):
```tsx
return (
  <SessionProviderWrapper session={session}>
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="ml-56 flex-1 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  </SessionProviderWrapper>
)
```
Import `SessionProviderWrapper` from `@/components/SessionProviderWrapper`.
Keep the `await auth()` + redirect guard exactly as-is (still a server
component doing the auth check before rendering).

### 6. Install shadcn primitives
Run `npx shadcn@latest add avatar dropdown-menu -y`. **Verify** the
generated `components/ui/avatar.tsx` and `components/ui/dropdown-menu.tsx`
import from `@base-ui/react/*` (this project's actual primitive engine),
not `@radix-ui/*` — every other file in `components/ui/` does (e.g.
`select.tsx` imports `{ Select as SelectPrimitive } from '@base-ui/react/select'`).
If the CLI generates Radix imports instead, stop and report back rather
than proceeding — do not silently add a `@radix-ui/*` dependency to a
Base-UI-only project.

### 7. `components/Sidebar.tsx` — avatar + dropdown, drop the `user` prop
Read the current file first (108 lines). Changes:
- Remove the `SidebarProps`/`user` prop entirely — the component takes no
  props now (`export function Sidebar()`), same as how
  `app/app/factory/page.tsx` and other client pages call `useSession()`
  directly rather than prop-drilling session data.
- Add `'use client'` if not already present (it already has `'use client'`
  at the top — confirm and keep it).
- Add `import { useSession, signOut } from 'next-auth/react'` (signOut is
  already imported — just add `useSession` alongside it) and
  `import { avatarColor, getInitials } from '@/lib/utils'`.
- Add `const { data: session } = useSession()` near the top of the
  component, and derive `const name = session?.user?.name ?? null`,
  `const email = session?.user?.email ?? null`,
  `const image = session?.user?.image ?? null`.
- Replace the footer block (currently, verbatim):
  ```tsx
  {/* User */}
  <div className="border-t border-zinc-800 px-5 py-4">
    <p className="text-xs text-zinc-500 font-mono truncate mb-2">{user.email ?? 'unknown'}</p>
    <Button
      variant="ghost"
      size="xs"
      onClick={() => signOut({ callbackUrl: '/' })}
      className="h-auto rounded-none p-0 font-mono font-normal text-zinc-600 transition-colors hover:text-zinc-400"
    >
      Sign out
    </Button>
  </div>
  ```
  with a `DropdownMenu` whose trigger wraps an `Avatar`:
  ```tsx
  <div className="border-t border-zinc-800 px-5 py-4">
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-none outline-none">
        <Avatar className="h-8 w-8 rounded-none">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className={cn('rounded-none font-mono text-xs text-white', avatarColor(name ?? email ?? 'user'))}>
            {getInitials(name, email)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-xs text-zinc-500 font-mono">{name ?? email ?? 'Account'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56 rounded-none">
        <div className="px-2 py-1.5">
          <p className="text-sm font-mono text-zinc-100 truncate">{name ?? 'Account'}</p>
          <p className="text-xs font-mono text-zinc-500 truncate">{email ?? 'unknown'}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings" className="font-mono text-sm">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-sm text-red-400 focus:text-red-400"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  ```
  (adjust the exact `DropdownMenu*`/`Avatar*` component APIs to whatever
  the actual generated `components/ui/avatar.tsx`/`dropdown-menu.tsx`
  export — read those files after step 6 completes and correct prop names/
  structure as needed; the JSX above is the intended shape/behavior, not
  necessarily byte-exact API). Import `cn` from `@/lib/cn`,
  `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator`/
  `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`,
  `Avatar`/`AvatarFallback`/`AvatarImage` from `@/components/ui/avatar`.
- Everything else in the file (the `NAV` array, the nav `<Link>` list, the
  brand link at top) stays completely untouched.

### 8. `app/app/layout.tsx` — remove the now-unused `user` prop wiring
(Covered in step 5 above — just confirm the `<Sidebar user={{...}} />`
call becomes bare `<Sidebar />`.)

### 9. `app/api/profile/route.ts` (new)
```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
    select: { name: true },
  })
  return NextResponse.json(updated)
}
```

### 10. `app/api/profile/avatar/route.ts` (new)
Mirrors `app/api/products/[name]/file/route.ts` (upload) and
`app/api/slot/[name]/route.ts` (serve), scoped per-user via `avatarPath()`:
```ts
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { avatarPath, clearDirectory, contentTypeFor, firstFile, sanitizeFilename } from '@/lib/api-files'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'avatar')
    const directory = avatarPath(userId)
    clearDirectory(directory)
    fs.writeFileSync(path.join(directory, filename), Buffer.from(await request.arrayBuffer()))

    const image = `/api/profile/avatar?v=${Date.now()}`
    await prisma.user.update({ where: { id: userId }, data: { image } })
    return NextResponse.json({ image })
  } catch {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const directory = avatarPath(session.user.id)
    const filename = firstFile(directory)
    if (!filename) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const filePath = path.join(directory, filename)
    return new NextResponse(fs.readFileSync(filePath), {
      headers: { 'Content-Type': contentTypeFor(filename) },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
```
(`clearDirectory` already exists in `lib/api-files.ts` — reuse it, don't
reimplement directory-clearing logic.)

### 11. `app/app/settings/page.tsx` (new, client component)
```tsx
'use client'

import { useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { avatarColor, getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const email = session?.user?.email ?? null
  const image = session?.user?.image ?? null

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      await update({ name: trimmed })
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 2000)
    }
    setSaving(false)
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: file,
    })
    if (res.ok) {
      const data = await res.json() as { image: string }
      await update({ image: data.image })
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-mono font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Your profile and account details.</p>
      </div>

      <Card className="gap-4 px-4 py-4 font-mono">
        <h2 className="text-xs text-zinc-600 uppercase tracking-widest">Profile</h2>

        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-none">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback className={cn('rounded-none text-lg text-white', avatarColor(name || email || 'user'))}>
              {getInitials(name, email)}
            </AvatarFallback>
          </Avatar>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            Upload image
          </Button>
        </div>

        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Display name</Label>
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Button type="button" variant="default" disabled={saving} onClick={() => void saveName()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {saveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Email</Label>
          <p className="text-sm text-zinc-300">{email ?? '—'}</p>
        </div>
      </Card>
    </div>
  )
}
```

## Files Summary
| Action | Path | Blueprint |
|--------|------|-----------|
| MODIFY | `lib/utils.ts` | existing exports in same file |
| MODIFY | `tests/unit/utils.test.ts` | existing describe blocks in same file |
| MODIFY | `lib/api-files.ts` | existing `PRODUCTS_DIR`/`assetPath()` pattern |
| MODIFY | `auth.ts` | — |
| CREATE | `components/SessionProviderWrapper.tsx` | — |
| MODIFY | `app/app/layout.tsx` | — |
| CREATE | `components/ui/avatar.tsx`, `components/ui/dropdown-menu.tsx` | via `shadcn add`, follow existing `components/ui/select.tsx` Base UI convention |
| MODIFY | `components/Sidebar.tsx` | `components/FolderManager.tsx` chip/button conventions for styling |
| CREATE | `app/api/profile/route.ts` | `app/api/products/[name]/rename/route.ts` (simple auth-gated mutation) |
| CREATE | `app/api/profile/avatar/route.ts` | `app/api/products/[name]/file/route.ts` + `app/api/slot/[name]/route.ts` |
| CREATE | `app/app/settings/page.tsx` | `components/ProductSelector.tsx` save-flash pattern, `components/FixedAssets.tsx` upload pattern |
| CREATE | `tests/e2e/settings.spec.ts` | `tests/e2e/dashboard.spec.ts` dev-bypass convention |

## Out of Scope
- No Language/Appearance/Passkeys sections (not requested — only Profile).
- No new top-level sidebar nav-array entry for Settings.
- No role/multi-tenancy concept (this app doesn't have one).
- No avatar file-size/dimension validation (matches this app's existing
  laissez-faire upload behavior elsewhere — no size limits anywhere today).

## Verification
1. `npx tsc --noEmit`, `bun test tests/unit`, `bun x playwright test tests/e2e/settings.spec.ts`.
2. `npm run dev` → dev-bypass login → open the sidebar avatar badge,
   confirm the dropdown shows name/email, opens upward (not clipped),
   and has Settings + Sign out. Go to `/app/settings`, change the display
   name and save — confirm the sidebar updates immediately with no reload.
   Upload a small image — confirm it shows in both the settings preview
   and the sidebar badge. Reset the seeded dev user's name/avatar back
   afterward since this is real dev data, not disposable test fixtures.
