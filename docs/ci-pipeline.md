# Spec: CI pipeline

## Overview
No `.github/workflows` exist at all — nothing runs lint/typecheck/tests
automatically on push or PR. Add a GitHub Actions workflow so every push
and PR gets a real, fast, reliable gate.

## Investigation findings (why this isn't a trivial "just add a yml file")
- No `@types/bun` was installed at all, so every test file's `bun:test`
  import failed to resolve under `tsc` — a real gap, now fixed (see
  below), but fixing it **surfaced ~150 previously-invisible type errors
  across nearly every integration test file**, all of the same shape:
  a `mock(() => Promise.resolve(null))` declaration later reassigned via
  `.mockReturnValue(Promise.resolve(<a completely different shape>))`,
  which TypeScript now correctly flags once `bun:test`'s `mock()` is
  properly typed. Properly typing every mock in the test suite is a
  large, separate undertaking on its own (worth a future backlog item —
  noted in memory, not attempted here). **Scope decision: keep
  `@types/bun` installed (real improvement, no downside), but scope the
  CI/local "typecheck" gate to exclude `tests/` via a dedicated
  `tsconfig.ci.json`** — the actual application code has been kept
  clean all session; this makes the gate meaningful today without
  taking on an unplanned, unrelated mass test-rewrite.
- `npm run lint` has 6 real ERRORS (would fail CI as-is):
  - `components/VersionHistory.tsx` — a genuine `react-hooks/set-state-in-effect`
    violation (calling a named `useCallback` function that itself calls
    `setState` directly inside a `useEffect` body) — fixed by inlining
    the fetch logic directly in the effect, matching how every other
    data-fetching effect in this codebase already does it (none of them
    call out to a named function from inside the effect body).
  - `server.js` (3×) — `require()`-style imports forbidden. This file is
    a **leftover v1-era vanilla Node server** (references `PRODUCTS_DIR`,
    port 1234, PNGTuber-specific slots) sitting unused in the v2 tree —
    nothing in `package.json`/`Makefile` references it. Not deleting it
    unprompted (out of scope for "add CI," and it may be intentionally
    kept for reference) — excluded from ESLint's ignore list instead,
    flagged in the PR for a follow-up decision on whether to delete it.
  - The other 13 findings are `warning`-level (unused vars in test
    files) — warnings don't fail CI by default, left alone.

## Scope decision: no E2E job (yet)
Playwright E2E tests need a running dev server + real Postgres + real
MinIO + seeded data — a genuinely more failure-prone CI setup (service
containers, migration/seed steps, server startup timing) that can't be
locally dry-run without a tool like `act` (not installed, and installing
just to guess-and-check a workflow is worse than verifying the real
thing via an actual GitHub Actions run). Shipping a fast, reliable
lint+typecheck+unit+integration gate now, and calling out E2E-in-CI as a
clear, valuable follow-up rather than shipping something unverified.

## Implementation

### 1. `package.json` (I install the dependency + add scripts myself, same as other tooling this session)
```
npm install --save-dev @types/bun
```
Add scripts:
```json
"typecheck": "tsc --noEmit -p tsconfig.ci.json",
```
(keep the existing `test`/`test:unit`/`test:integration`/`test:live`/
`test:e2e` scripts exactly as they are).

### 2. `tsconfig.ci.json` (new, Codex agent)
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "tests"]
}
```

### 3. `components/VersionHistory.tsx` (Codex agent — fix real lint error)
Current effect:
```ts
  const refresh = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
    if (response.ok) setHistory(await response.json() as BuildHistoryEntry[])
    setLoading(false)
  }, [activeProduct])

  useEffect(() => { void refresh() }, [refresh, refreshSignal])
```
Inline the fetch directly in the effect (matching every other
data-fetching effect in this codebase — none of them call out to a
named function from the effect body), keeping `refresh` available for
the `revert()` function's post-action refresh call:
```ts
  const refresh = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
    if (response.ok) setHistory(await response.json() as BuildHistoryEntry[])
    setLoading(false)
  }, [activeProduct])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
      .then((response) => (response.ok ? response.json() as Promise<BuildHistoryEntry[]> : null))
      .then((data) => {
        if (data) setHistory(data)
        setLoading(false)
      })
  }, [activeProduct, refreshSignal])
```
Keep `refresh()` itself unchanged (still used by `revert()` afterward) —
only the mount/refresh-signal effect changes to not call it directly.

### 4. `eslint.config.mjs` (Codex agent — exclude legacy server.js)
Add `"server.js"` to the existing `globalIgnores([...])` array (alongside
`.next/**"`, `"out/**"`, etc.).

### 5. `.github/workflows/ci.yml` (Codex agent)
```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: bun test tests/unit tests/integration
```
No database/object-storage services needed — `tests/unit`/
`tests/integration` mock `@/lib/db`/`@/lib/object-storage` entirely (the
established convention throughout this codebase), and `npx prisma
generate` only needs the schema file, not a live connection.

## Out of Scope
- E2E-in-CI (see scope decision above) — tracked as a follow-up.
- Fixing the ~150 pre-existing mock-typing errors `@types/bun` surfaced
  across the test suite — tracked as a follow-up in memory, genuinely
  a separate, large undertaking.
- Deleting `server.js` — flagged for the user to decide, not removed
  unprompted.
- `tests/setup.ts`'s `NODE_ENV` assignment error and
  `template-rules.test.ts`'s fixture-shape error — both inside the
  now-excluded `tests/` typecheck scope, pre-existing, unrelated to CI
  setup itself.

## Verification
1. `npx tsc --noEmit -p tsconfig.ci.json` — confirm clean (app code
   only).
2. `npm run lint` — confirm zero errors (warnings OK).
3. `bun test tests/unit tests/integration` — confirm still green.
4. Push this branch and watch the actual GitHub Actions run via `gh run
   watch` — confirm the `test` job passes for real, not just "looks
   right locally."
