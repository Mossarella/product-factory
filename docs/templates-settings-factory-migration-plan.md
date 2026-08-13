# Plan: Product Templates, Settings, and Factory Supabase Cutover

## Context

The Collection, dashboard, and build foundation have been migrated on the uncommitted Supabase foundation worktree. This plan migrates the next three user-facing domains while preserving the existing game-inventory HUD and current API response contracts.

## Repository constraints

- Work remains on the current migration worktree; do not commit until explicitly requested.
- All authenticated access uses Supabase SSR `createClient()` and `auth.getUser()`.
- Every user-owned Postgres query includes `owner_id = user.id`; RLS remains the second isolation boundary.
- Private Storage is accessed server-side only.
- Keep API field translation at route boundaries and preserve the existing camelCase frontend contract.
- Do not redesign the HUD or change product packaging semantics.

## Blueprint files

- `app/api/products/route.ts` — authenticated Supabase route pattern and owner filtering.
- `app/api/products/[name]/config/route.ts` — product metadata mapping and explicit update fields.
- `lib/supabase/server.ts` — typed SSR client creation.
- `lib/supabase/storage.ts` — user-rooted private Storage path conventions.
- `app/app/factory/page.tsx` — existing orchestration/state machine that must remain behaviorally stable.
- `tests/integration/products-config.test.ts` — current route integration-test style.

## Implementation batches

### Batch 1 — Product Templates CRUD

Modify `app/api/product-templates/route.ts` and `app/api/product-templates/[id]/route.ts` to use Supabase Auth and `product_templates`. Add focused integration tests for CRUD, validation, unauthenticated access, and cross-user isolation. Do not touch the static `/api/templates/[name]` filesystem route.

### Batch 2 — Profile Settings

Modify `app/api/profile/route.ts` to use the `profiles` table with an idempotent bootstrap and an explicit editable-field allowlist. Add tests for bootstrap, update mapping, protected fields, unauthorized requests, and cross-user isolation.

### Batch 3 — Avatar Storage

Inspect the current profile schema and avatar UI contract. If avatar metadata columns are absent, add a focused Supabase migration for `avatar_storage_path` and `avatar_mime`; then migrate `app/api/profile/avatar/route.ts` to private Storage. Add size, MIME, upload, download, and authorization tests.

### Batch 4 — Factory adapters

After the APIs pass, update only any remaining Factory client assumptions. Keep product, template, profile, and build calls behind existing API routes. Add a focused browser smoke test for load, template selection, save, and build creation.

### Batch 5 — Activate and billing follow-up

Migrate `/api/activate` to Supabase Auth first. Treat Stripe checkout and portal routes as a separate approval/review slice because they create external sessions and depend on subscription/customer fields not yet represented in the Supabase profile schema.

## Verification ladder

1. Run `git diff --check`.
2. Run the focused Product Templates and profile tests.
3. Run TypeScript validation and confirm only known unrelated legacy errors remain, if any.
4. Run owner-isolation tests for every migrated route.
5. Run the Factory browser smoke flow without changing HUD layout.
6. Scan completed scopes for Auth.js, Prisma, and legacy object-storage imports.
7. Do not commit or remove legacy dependencies until all adjacent routes and full test gates pass.

## Approval gate

Application code changes should begin only after this plan is approved. The strategy document is available at `docs/templates-settings-factory-supabase-migration.md`.
