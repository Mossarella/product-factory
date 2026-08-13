# Plan: Release Bundle Export Foundation

## Context

Product Factory currently creates versioned product ZIPs and stores build manifests, but it does not have an immutable release-level record. This slice adds the database foundation for a later release bundle containing the ZIP and Etsy metadata artifacts.

## Constraints

- Use the existing Supabase/Postgres schema and generated database type conventions.
- Keep all queries and policies owner-scoped.
- Do not introduce mutable release updates or client-facing delete access.
- Do not commit automatically; the user controls commit timing.

## Implementation

1. Add `supabase/migrations/0007_product_releases.sql` with the `product_releases` table, foreign keys, indexes, unique owner/product/build constraint, RLS enablement, and select/insert policies.
2. Extend `lib/supabase/database.types.ts` with the generated-style `product_releases` table contracts.
3. Add focused regression coverage for the release snapshot shape and idempotency key using the existing Bun test conventions.
4. Update `docs/supabase-migration-todo.md` to track the release foundation separately from the later bundle/UI work.

## Verification

- `git diff --check`
- `npm run typecheck`
- Focused Bun unit/integration tests when Bun is available
- Independent read of the migration and generated type diff

## Out of scope

Remote migration application, final ZIP/Etsy bundle assembly, release UI, release download routes, and Playwright release flow will be handled after this foundation slice is reviewed.
