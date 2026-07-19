# Spec: Store profile avatar in Postgres, cap upload at 5MB

## Overview
User avatars (`app/api/profile/avatar/route.ts`) are currently stored on
the local filesystem (`avatars/<userId>/`, via `lib/api-files.ts`'s
`AVATARS_DIR`/`avatarPath()`), with zero file-size validation anywhere in
the request path. Move avatar bytes into Postgres (`User` table) instead,
and add a 5MB upload cap — the first file-size guard in this codebase.

## Follows the pattern of
- `app/api/products/[name]/build/[version]/route.ts` — serving raw bytes
  via `new NextResponse(buffer, { headers: { 'Content-Type': ... } })`,
  same shape needed here except the buffer now comes from Postgres
  (`Bytes` column, which the Prisma client returns as a Node `Buffer`)
  instead of `fs.readFileSync`.
- `lib/api-files.ts`'s existing `readBodyBuffer()`/`contentTypeFor()`/
  `sanitizeFilename()` helpers — reused as-is, just no longer paired with
  filesystem writes for this one route.

## Why this shape
- `User.image` stays exactly as it is today: a plain `String?` holding
  the cache-busting URL `/api/profile/avatar?v=<timestamp>`, which is
  what the NextAuth JWT session (`auth.ts`'s `jwt`/`session` callbacks)
  and every `<AvatarImage src={image}>` usage (Settings page, Sidebar)
  already expect. **No changes needed there** — only what the GET/POST
  handlers do internally changes; the session/JWT plumbing and the
  `<Avatar>` display components are untouched.
- New columns hold the actual bytes: `User.avatarData Bytes?` and
  `User.avatarMime String?`. `Bytes?` (not `Bytes` non-null) so a user
  who never uploaded one just has `null` — matches `image` also being
  optional today.
- `AVATARS_DIR`/`avatarPath()` in `lib/api-files.ts` become dead code
  once this ships (confirmed via full-codebase search: nothing else
  references them) — delete them rather than leave unused exports.
  `clearDirectory()`/`firstFile()` stay — those are still used by other
  filesystem-backed features (fixed assets, mascot files, shop-wide
  slots) and must not be touched.
- The 5MB cap constant (`MAX_AVATAR_BYTES = 5 * 1024 * 1024`) needs to be
  usable from BOTH the server route (`app/api/profile/avatar/route.ts`)
  AND the client component (`app/app/settings/page.tsx`, for instant
  client-side feedback before even attempting the upload) — it can't live
  in `lib/api-files.ts` since that file imports `fs`/`path` and would
  break if pulled into a `'use client'` component. `lib/utils.ts` is
  already a plain, dependency-free, client-safe module imported by the
  settings page (for `avatarColor`/`getInitials`) — add the constant
  there instead, and have the route import it from there too.
- Size is checked twice server-side: against the `Content-Length` header
  up front (cheap, rejects before buffering an oversized body into
  memory at all), and again against the actual buffered byte length
  after reading the body (in case `Content-Length` is missing or wrong)
  — both return `413`.

## Implementation

### 1. `prisma/schema.prisma` (I run this migration myself, same precedent as the prior six)
Add to `User`:
```prisma
avatarData Bytes?
avatarMime String?
```
Run `npx prisma migrate dev --name add_avatar_data`.

### 2. `lib/api-files.ts` (Codex agent — remove dead code)
Delete the `AVATARS_DIR` constant and the `avatarPath()` function
entirely. Leave every other export untouched (`clearDirectory`,
`firstFile`, `contentTypeFor`, `sanitizeFilename`, `readBodyBuffer`,
`MIME`, etc. are still used elsewhere).

### 3. `lib/utils.ts` (Codex agent — add shared constant)
Add near the top:
```ts
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
```

### 4. `app/api/profile/avatar/route.ts` (Codex agent, depends on 2+3 — full rewrite)
```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { MAX_AVATAR_BYTES } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
  }

  try {
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 413 })
    }

    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'avatar')
    const image = `/api/profile/avatar?v=${Date.now()}`

    await prisma.user.update({
      where: { id: userId },
      data: { avatarData: buffer, avatarMime: contentTypeFor(filename), image },
    })
    return NextResponse.json({ image })
  } catch {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarData: true, avatarMime: true },
  })
  if (!user?.avatarData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(user.avatarData, {
    headers: { 'Content-Type': user.avatarMime ?? 'application/octet-stream' },
  })
}
```
No more `fs`/`path`/`clearDirectory`/`firstFile`/`avatarPath` imports in
this file at all.

### 5. `app/app/settings/page.tsx` (Codex agent, depends on 3)
Add an `avatarError` state and check client-side before uploading, and
surface server-side error messages (e.g. the 413 case) too:
```tsx
import { MAX_AVATAR_BYTES, avatarColor, getInitials } from '@/lib/utils'
...
const [avatarError, setAvatarError] = useState<string | null>(null)
...
async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  setAvatarError(null)
  if (file.size > MAX_AVATAR_BYTES) {
    setAvatarError('Image must be 5MB or smaller.')
    return
  }
  const res = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: { 'X-Filename': file.name },
    body: file,
  })
  if (res.ok) {
    const data = await res.json() as { image: string }
    await update({ image: data.image })
  } else {
    const body = await res.json().catch(() => ({}))
    setAvatarError(body.error || 'Could not upload image')
  }
}
```
Render `{avatarError && <p className="text-xs text-red-400">{avatarError}</p>}`
directly below the existing avatar `<Avatar>`/upload-button row.

## Out of Scope
- No DELETE/remove-avatar handler (not requested).
- No image resizing/compression/thumbnailing — stored as-is, same as
  today's filesystem behavior.
- Not touching `.gitignore`'s now-unused `/avatars/` entry or deleting
  any leftover files already on disk under `avatars/` — harmless, out of
  scope for this change.

## Tests (mandatory)
- `tests/integration/profile-avatar.test.ts` (new) — mock `@/auth` and
  `@/lib/db` (`prisma.user.update`/`findUnique`), no `fs` mock needed at
  all now (this route touches zero filesystem APIs post-change):
  - `POST`: 401 unauthenticated; 413 when `Content-Length` exceeds
    `MAX_AVATAR_BYTES`; 413 when the actual body exceeds it even without
    a (or with a wrong) `Content-Length` header; 200 on success — assert
    `prisma.user.update` was called with `avatarData`/`avatarMime`/
    `image` and the response JSON has the `image` URL.
  - `GET`: 401 unauthenticated; 404 when `user.avatarData` is null;
    200 with the correct `Content-Type` header and body bytes when set.
- `tests/e2e/*.spec.ts` (new, or add to an existing settings-related spec
  if one exists — check `tests/e2e/settings.spec.ts` first) — log in,
  go to `/app/settings`, upload a small real image file, confirm the
  avatar `<img>` updates; separately hit the avatar POST endpoint
  directly via `page.request.post` with a >5MB buffer and assert a `413`
  JSON error (faster/more reliable than driving a multi-MB file through
  an `<input type=file>` in the browser).

## Verification
1. `npx prisma migrate dev --name add_avatar_data` — confirm additive.
2. `npx tsc --noEmit`, `bun test tests/unit tests/integration`.
3. `bun x playwright test tests/e2e/settings.spec.ts` (or wherever the
   new test lands) green.
4. Manually: upload a real image on `/app/settings`, confirm it displays
   immediately and persists after a hard reload (bytes now round-trip
   through Postgres, not the filesystem); try a file over 5MB, confirm
   the inline error appears without a network round trip completing
   successfully.
