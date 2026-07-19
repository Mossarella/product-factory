# Spec: Production hardening (deploy config, security headers, rate limiting)

## Overview
Item 5 of the SaaS-readiness roadmap. Three previously-completely-absent
areas, confirmed by investigation: no Dockerfile/deploy config, no
security headers anywhere, no rate limiting anywhere (any authenticated
user can currently hammer the Anthropic-backed AI route with zero
backpressure — real cost-abuse risk).

User decisions (asked directly, not guessed):
- **Rate limit store: in-memory.** No new infra/dependency. Known
  limitation: only coordinates within a single running instance — fine
  for this app's current single-instance deploy shape.
- **Deploy target: Docker container** (self-hosted VM / Fly / Railway /
  similar). Build a real production Dockerfile + `output: 'standalone'`,
  not Vercel-specific config.

## 1. Deploy config

### `next.config.ts` — add `output: 'standalone'`
Currently empty (`{ /* config options here */ }`). Standalone output
produces a pruned `.next/standalone` folder with only the files needed
to run, so the Docker image doesn't ship the full `node_modules`.

### `Dockerfile` (new) — multi-stage build
Standard Next.js standalone-output pattern: `deps` stage (`npm ci`),
`builder` stage (`npx prisma generate` + `npm run build`), `runner`
stage (copies `.next/standalone`, `.next/static`, `public/`, `assets/`,
runs as non-root, `CMD ["node", "server.js"]` — the standalone build
emits its own minimal `server.js`, unrelated to the legacy
`server.js` v1 file at the repo root, which is not touched or copied
into the image). Exposes port 3000. Needs `prisma generate` in the build
stage since the Prisma client is generated, not just installed.

### `.dockerignore` (new)
Excludes `node_modules`, `.next`, `.git`, `tests`, `docs`, `*.md`
(except none needed at runtime), `.env*`, `docker-compose.yml` — nothing
the runtime image needs, keeps build context small.

### Startup-time env validation — `lib/env.ts` + `instrumentation.ts` (both new)
Today every env var is read ad hoc with `??`/`||` fallbacks that produce
silently-broken behavior in production (e.g. `S3_BUCKET ?? ''` fails
opaquely at first S3 call, not at boot). Fix: a `validateEnv()` function
in `lib/env.ts`, called from `instrumentation.ts`'s `register()` (the
Next.js-native startup hook, runs once per server process, Node runtime
only — skips Edge middleware, which is fine since these vars aren't
needed there).
- **Hard-fail in production only** (`NODE_ENV === 'production'`) if any
  of the unconditionally-required vars are missing/empty: `DATABASE_URL`,
  `AUTH_SECRET`, `AUTH_URL`, `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Throws a single clear error
  listing every missing var by name, refusing to boot rather than
  serving broken requests.
- **Warn-only** (console.warn, don't crash) in production for
  feature-gated vars that already degrade gracefully at request time:
  `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY` — these
  already have (or, for Stripe, presumably have) their own
  missing-config handling at the point of use (`lib/ai.ts`'s
  `AiNotConfiguredError` → 503 is the existing precedent).
- **No-op entirely** outside production (dev/test) — don't add friction
  to `npm run dev`/`bun test`, which already work fine today without this.

## 2. Security headers

### `next.config.ts` — add a `headers()` function
Applies to all routes (`source: '/(.*)'`). Set:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **No CSP for now** — this app serves user-uploaded images/GIFs/video
  through `next/image`-less `<img>` tags, inline styles via Tailwind's
  `@apply`, and dynamically-generated Etsy preview content; a correct
  CSP needs careful auditing of every asset source (MinIO/S3 endpoint,
  Stripe checkout redirect, etc.) to avoid breaking legitimate
  functionality. Getting a CSP subtly wrong silently breaks images/scripts
  in a way that's easy to miss in a review. Flagging as an explicit,
  separate follow-up rather than shipping a guessed policy.

## 3. Rate limiting

### `lib/rate-limit.ts` (new) — in-memory fixed-window counter
```ts
const buckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
```
No cleanup timer needed for this scale — stale entries are naturally
overwritten on next use of the same key, and the key space is bounded by
active users/IPs, not unbounded.

### Applied in `middleware.ts` (extends the existing auth-gate logic)
Two targeted checks, chosen from investigation as the highest-value
(most expensive / most abusable), not a blanket per-route limiter:
1. **AI route** — `POST` to a path matching `/api/products/[name]/ai`
   (already covered by the existing `/api/products/:path*` matcher):
   10 requests / 60s, keyed by `req.auth.user.id` (only reachable by
   authenticated users already, per the existing auth gate).
2. **Magic-link sign-in** — `POST` to `/api/auth/signin/resend` (or
   the general signin path): 5 requests / 15 minutes, keyed by IP
   (`x-forwarded-for` header, first entry, falling back to `'unknown'` —
   Next.js `NextRequest` no longer exposes `.ip` directly). Requires
   adding `/api/auth/:path*` to `middleware.ts`'s `matcher` array (it's
   not covered today) — the rate-limit check runs before the existing
   `needsAuth` gate logic, unaffected by it since sign-in is necessarily
   pre-auth.

Both return `NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })`
when exceeded, mirroring the existing early-return style already used
in this file for the auth redirect.

### Out of scope (documented, not attempted)
- Blanket rate limiting on every API route — scoped to the two
  investigation-confirmed highest-risk targets only, to keep this
  change reviewable and avoid accidentally throttling normal use of
  upload/CRUD routes that are already bounded by the 50MB file cap.
- Multi-instance-coordinated limiting (Redis/Upstash) — explicit user
  decision, in-memory only for now.
- CSP — see above, separate follow-up.

## Tests
- `tests/unit/rate-limit.test.ts` (new) — pure logic, no mocks needed:
  allows up to `limit` requests within the window, rejects the
  `limit + 1`th, resets after the window elapses (can advance time by
  constructing two `checkRateLimit` calls with a controlled clock —
  check how other pure-logic unit tests in `tests/unit/` handle
  time-dependent logic, if any, before inventing a pattern; if none
  exist, structure the window small enough (e.g. mock via a short
  `windowMs` like 50ms and a real `setTimeout`/sleep in the test) to
  avoid needing to fake `Date.now()`, since `Date.now()` faking has
  caused issues elsewhere in this session's tooling).
- `tests/unit/env.test.ts` (new) — `validateEnv()` throws with all
  required-var names listed when `NODE_ENV === 'production'` and vars
  are missing; is a no-op when `NODE_ENV !== 'production'`.
- Middleware rate-limit integration: existing middleware has no test
  file today (confirmed no `tests/*middleware*`) — adding Playwright
  E2E coverage for the AI-route 429 would require making 11 real
  Anthropic-backed AI calls per test run (slow, costs real API spend
  and is unnecessary since the rate-limit logic itself is unit-tested in
  isolation) — skipped, same class of scope call as prior "no E2E for
  this" decisions this session, documented explicitly rather than
  silently absent.

## Verification
1. Read every changed/created file, confirm against spec.
2. `npx tsc --noEmit -p tsconfig.ci.json` clean.
3. `npm run lint` — zero new errors.
4. `bun test tests/unit/rate-limit.test.ts tests/unit/env.test.ts` pass.
5. `npm run build` succeeds with `output: 'standalone'` (confirms the
   Docker-relevant Next config change doesn't break the build).
6. `docker build .` succeeds and the resulting image starts and serves
   traffic (`docker run` + curl a page) — the only real way to confirm
   the Dockerfile actually works, not just "looks right."
7. Manually hit the AI route >10 times in <60s against the running dev
   server, confirm a 429 with `Retry-After` after the 11th.
8. Full `bun test --isolate tests/unit tests/integration` still green.
9. Push branch → PR → watch live CI → merge, per standing workflow.
