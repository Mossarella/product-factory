# Spec: Release Bundle Export Foundation

## Overview

The Release Bundle Export feature creates an immutable, owner-scoped release record for a successfully packaged product version. The build route embeds Etsy and release-summary artifacts, while the release API copies that verified ZIP into a private release path, persists its hash and snapshots, exposes release history, and serves owner-scoped downloads.

## Follows the pattern of

- `supabase/migrations/0006_product_events.sql` — owner-scoped table, explicit indexes, and authenticated RLS policies.
- `lib/supabase/database.types.ts` — generated-style `Row`, `Insert`, and `Update` table contracts.
- `app/api/products/[name]/build/route.ts` — product/build ownership and versioning conventions.

## Requirements

### Functional

- Store one immutable release snapshot for an owner, product, and build version.
- Link each release to the exact `product_builds` row used as its package source.
- Persist release-level artifact paths, hashes, and the Etsy listing snapshot as JSON data so future edits cannot mutate an existing release.
- Enforce idempotency with a unique owner/product/build constraint.
- Track release creation time without mutable update timestamps.

### Non-functional

- Every row is owner-scoped by `owner_id` and protected by RLS.
- Authenticated users may select and insert only their own release rows.
- No update or delete policy is added in this foundation slice; release records are immutable through the client-facing API.
- The migration must reference existing `auth.users`, `products`, and `product_builds` tables only.

## Proposed table

| Column | Type | Rule | Purpose |
|---|---|---|---|
| `id` | `uuid` | Primary key, generated | Release identity |
| `owner_id` | `uuid` | Required, `auth.users` foreign key | Tenant boundary |
| `product_id` | `uuid` | Required, product foreign key | Product snapshot owner |
| `build_id` | `uuid` | Required, product_builds foreign key | Exact package source |
| `version` | `integer` | Required | Human-facing build version |
| `bundle_storage_path` | `text` | Required | Private release bundle object path |
| `bundle_filename` | `text` | Required | Download filename |
| `bundle_size` | `bigint` | Required, non-negative | Artifact size |
| `bundle_sha256` | `text` | Required | Integrity hash |
| `listing_snapshot` | `jsonb` | Required, default `{}` | Immutable Etsy metadata snapshot |
| `release_summary` | `jsonb` | Required, default `{}` | Product/version/validation summary |
| `created_at` | `timestamptz` | Required, default `now()` | Release timestamp |

## Test tier this change must climb

- Unit: Type-level and pure release snapshot contract coverage if a helper is introduced.
- Integration: Migration/schema contract and owner-scoped insert/select behavior using the existing Supabase packaging test conventions.
- E2E: Not required for schema-only foundation; required in the final release workflow slice.

## API contract

- `POST /api/products/{name}/release` finalizes a packaged build version into an immutable release. Repeated requests for the same owner, product, and build return the existing release without duplication.
- `GET /api/products/{name}/release` lists release history for the authenticated owner and product.
- `GET /api/products/{name}/release/{version}` downloads the private release bundle after an owner-scoped lookup.

## Out of scope

This slice does not add the release UI or Stripe, marketplace synchronization, or sales analytics.

## Verification

1. Run `git diff --check`.
2. Run `npm run typecheck` and record only pre-existing failures.
3. Run the focused integration/unit commands if Bun is available.
4. Inspect the migration for owner isolation, immutability, and the unique idempotency constraint.
