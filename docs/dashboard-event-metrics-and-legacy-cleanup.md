# Spec: Dashboard Event Metrics and Legacy Cleanup

## Overview
Replace dashboard placeholders with owner-scoped, event-backed counts for successful packaging and reused fixed assets. At the same time, remove dead Prisma, Auth.js, Nodemailer, and S3/MinIO infrastructure that no longer participates in the Supabase application runtime.

## Follows the pattern of

| Area | Blueprint | Purpose |
|---|---|---|
| Dashboard data | `app/api/dashboard/route.ts` and `app/app/dashboard/page.tsx` | Preserve existing Supabase query and HUD presentation patterns. |
| Packaging events | `app/api/products/[name]/build/route.ts` | Record events only after a build has been persisted successfully. |
| Supabase schema | `supabase/migrations/0005_asset_loadouts.sql` | Follow migration style, owner-scoped RLS, and timestamp conventions. |
| Dependency cleanup | `package.json`, `package-lock.json`, `auth.ts`, `auth.config.ts`, `lib/db.ts`, `lib/object-storage.ts` | Remove unused runtime and development infrastructure only after source import scans. |

## Requirements

### Functional

Create an owner-scoped `product_events` table with a UUID primary key, `owner_id`, optional `product_id`, an event type constrained to `package_created` or `asset_reused`, JSON metadata, and `created_at`. Add indexes for owner/time and owner/event/time, plus RLS policies for authenticated owner select and insert. The migration must be idempotent where practical.

On a successful package build, record one `package_created` event with the build version and one `asset_reused` event per fixed asset included in the package. Events are telemetry only: if event recording fails after the build and product version update have succeeded, return the successful build response and log the telemetry failure rather than rolling back a valid package.

Update the dashboard API and server page to query only the authenticated user’s events and expose `productsPackaged` and `filesReused` metrics. `productsPackaged` counts successful package events; `filesReused` counts asset-reuse events. Replace the existing Last Export placeholder with the latest successful package timestamp, while retaining the existing readiness and quality metrics.

Remove the unused Auth.js route/configuration, session wrapper, Prisma database helper and seed path, Nodemailer/Auth.js/Prisma/S3 dependencies, and the MinIO Docker compose services when source scans confirm no active imports. Preserve Stripe dependencies because billing is explicitly deferred rather than removed. Historical documentation may remain, but active runtime and package manifests must no longer reference the removed systems.

### Non-functional

The dashboard must retain the dark, image-heavy game-inventory HUD aesthetic and remain responsive. All event queries and inserts must be owner-scoped through both explicit filters and RLS. No service-role credential, cross-user aggregation, or performance/sales analytics is introduced.

## Test tier

- Unit: add pure metric aggregation coverage if a helper is extracted.
- Integration: cover successful package event recording and non-fatal event insert failure; cover dashboard event aggregation with owner filtering.
- E2E: keep the existing packaging flow test as the live end-to-end confirmation.
- Static cleanup gate: run source import scans, package lock consistency, typecheck, and lint.

## Files summary

| Action | Path | Purpose |
|---|---|---|
| CREATE | `supabase/migrations/0006_product_events.sql` | Events schema, indexes, and RLS. |
| CREATE | `lib/dashboard-events.ts` | Typed event aggregation helper. |
| MODIFY | `app/api/products/[name]/build/route.ts` | Emit successful package and asset-reuse events. |
| MODIFY | `app/api/dashboard/route.ts` | Read event metrics and latest package timestamp. |
| MODIFY | `app/app/dashboard/page.tsx` | Display real event metrics in the existing HUD. |
| MODIFY | `tests/integration/products-build-supabase.test.ts` | Verify event emission and non-fatal telemetry errors. |
| MODIFY | dashboard tests | Verify aggregation and owner-scoped event reads. |
| DELETE | dead Auth.js/Prisma/S3 source files and dependencies | Remove obsolete infrastructure after import verification. |

## Out of scope

Stripe checkout, portal, and webhook migration remain deferred. No product performance, sales, conversion, or marketplace analytics are added. No automatic commit or push is performed.

## Verification

Run `git diff --check`, package-lock consistency, typecheck, lint, available unit/integration tests, and source scans proving removed packages have no active importers. Apply the new migration only through the project’s Supabase migration process; do not commit credentials.
