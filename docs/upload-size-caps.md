# Spec: Upload size caps on product files

## Overview
No product-file upload route enforces any size limit today — a real
risk on shared multi-tenant object storage. Item 4 of the SaaS-readiness
roadmap.

## Follows the pattern of
- `app/api/profile/avatar/route.ts` + `MAX_AVATAR_BYTES` (`lib/utils.ts`)
  — the only existing size-cap precedent in this codebase. Double-check:
  a cheap `content-length` header pre-check before reading the body, and
  an authoritative `buffer.byteLength` check after `readBodyBuffer`
  resolves (the header is client-supplied and not trustworthy on its
  own — a client can omit it or lie).
- `app/app/settings/page.tsx`'s `handleAvatarChange` — client-side
  pre-check via `file.size` against the same exported constant, plus
  error-state + inline `<p className="text-xs text-red-400">` rendering.
- `tests/integration/profile-avatar.test.ts` — the two size-rejection
  test cases (content-length path, body-length path) to replicate.

## Investigation findings
- 5 product-file POST routes accept uploads, none capped:
  `app/api/products/[name]/file/route.ts` (mascot files),
  `app/api/products/[name]/asset/route.ts` (fixed assets),
  `app/api/products/[name]/veado/route.ts` (scene file),
  `app/api/products/[name]/slot/[slot]/route.ts` (shop-wide Etsy slot
  images). All go through `readBodyBuffer` (`lib/api-files.ts`) **except**
  the slot route, which inlines `Buffer.from(await request.arrayBuffer())`
  directly instead of using the shared helper — needs its own insertion
  point, not a `readBodyBuffer` change.
- `readBodyBuffer` fully materializes the body via `.arrayBuffer()` with
  no early-abort — Next.js's `Request` has no built-in mechanism to
  reject based on `Content-Length` before the body is read, so the
  double-check pattern (header pre-check + byteLength post-check) is
  necessary, not optional.
- **Client-side gap, worse than just "no cap":** `saveProduct()` in
  `app/app/factory/page.tsx` uploads both mascot files and fixed assets
  inside `Promise.all(...)` blocks that `throw new Error(...)` on a
  non-ok response, but `saveProduct` is only ever called as
  `void saveProduct()` / `void onSave()` with **no `.catch()` anywhere**.
  Today, any upload failure (and a future 413 would be one) becomes a
  silent unhandled promise rejection — invisible to the user. Adding
  server-side 413s without also fixing this would make the cap
  effectively invisible when it fires. This needs a companion fix, not
  a separate feature: wrap `saveProduct`'s upload/save flow in a
  try/catch, add `saveError` state, surface it in the UI (mirroring
  the avatar pattern), and add client-side pre-checks via `file.size`/
  `asset.blob.size` so most oversized files never even reach the network.

## Requirements

### 1. `lib/utils.ts` — new constant
Add `export const MAX_PRODUCT_FILE_BYTES = 50 * 1024 * 1024` (50MB) next
to the existing `MAX_AVATAR_BYTES`. Product files (mascot art, scene
files, Etsy slot images) are richer content than an avatar, so a larger
but still bounded default. Trivially adjustable later — a single
constant, not a business rule buried in multiple places.

### 2. Server-side: 4 routes get the double-check
`app/api/products/[name]/file/route.ts`, `.../asset/route.ts`,
`.../veado/route.ts`: insert, mirroring `avatar/route.ts` exactly —
```ts
const contentLength = Number(request.headers.get('content-length') ?? '0')
if (contentLength > MAX_PRODUCT_FILE_BYTES) {
  return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
}
```
before the `try` block, and
```ts
if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) {
  return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
}
```
immediately after `const buffer = await readBodyBuffer(request)`, before
the `putObject` call.

`app/api/products/[name]/slot/[slot]/route.ts`: same two checks, but the
byteLength check goes right after
`const buffer = Buffer.from(await request.arrayBuffer())` since this
route doesn't use `readBodyBuffer`.

### 3. Client-side: `app/app/factory/page.tsx`
- Add `const [saveError, setSaveError] = useState<string | null>(null)`.
- In `saveProduct()`: before uploading, check each file's/asset's `.size`
  against `MAX_PRODUCT_FILE_BYTES` and set `saveError` + return early if
  any exceed it (mirrors `handleAvatarChange`'s pre-check, applied per-file
  since multiple files can be queued at once — name the first offending
  file in the message).
- Wrap the rest of `saveProduct`'s body (uploads + config save) in a
  try/catch: on failure, set `saveError` to the caught error's message
  (or a generic fallback); on success, clear `saveError`.
- Render `{saveError && <p className="text-xs text-red-400">{saveError}</p>}`
  near the Save button — `ProductSelector` already renders `saveFlash`
  next to its Save button, so add a new `saveError: string | null` prop
  to `ProductSelector` and render it the same way, right after the
  existing `{saveFlash && ...}` line.

### 4. Architecture check
No new layers. Constant lives in `lib/utils.ts` next to its sibling
`MAX_AVATAR_BYTES` (confirmed convention — not `config.ts`, not an env
var). No schema/migration changes.

## Tests
Add size-rejection cases to the *existing* integration test files (not
new files — mirrors how avatar's cap test lives inside the existing
`profile-avatar.test.ts`, not a separate file):
- `tests/integration/products-file.test.ts`,
  `products-asset.test.ts`, `products-veado.test.ts`,
  `products-slot.test.ts` — one case each: oversized `content-length`
  header → 413, asserting the `putObject` mock was never called.
  (The body-length path is harder to exercise cheaply in a unit-style
  integration test without actually allocating 50MB+ buffers repeatedly
  across 4 files — the `content-length` case alone already proves the
  guard exists and fires before any storage write; skip a duplicate
  giant-buffer case per route to keep the suite fast, unlike avatar's
  5MB cap which is cheap enough to actually allocate.)

### Out of scope
- A dedicated E2E spec — this is a defensive/negative-path addition to
  existing routes, not new user-facing behavior; the integration tests
  cover the exact 413 boundary logic where it actually lives. Simulating
  a real 50MB+ upload in Playwright would be slow for little added
  confidence. Skipped, same kind of scope call as "no E2E job in CI yet."
- Per-plan tiered limits (e.g. higher caps for a `pro` plan) — flat
  50MB for everyone, consistent with how `MAX_AVATAR_BYTES` has no
  plan tiering either.
- Client-side upload progress/chunking for large files — out of scope,
  files are still uploaded as a single `fetch(body: file)` call same as today.

## Verification
1. Read every changed file, confirm against spec.
2. `npx tsc --noEmit -p tsconfig.ci.json` clean.
3. `npm run lint` — zero new errors.
4. `bun test tests/integration/products-file.test.ts tests/integration/products-asset.test.ts tests/integration/products-veado.test.ts tests/integration/products-slot.test.ts` — new cases pass.
5. `npm run dev` — manually try uploading an oversized file in Factory,
   confirm the client-side pre-check blocks it with a visible error
   message (no network call), and confirm the existing normal-size
   upload flow still works end-to-end.
6. Full `bun test --isolate tests/unit tests/integration` still green.
7. Push branch → PR → watch live CI → merge, per standing workflow.
