# Plan: Reusable Asset Loadouts

## Context

Fixed assets currently belong to one product configuration. Users repeatedly select the same shop-level assets when packaging similar products. This feature introduces named, owner-scoped presets that store selected asset keys and can be applied to another product without duplicating binaries.

## Repository constraints

The project is on the active `claude/supabase-foundation` migration branch for this session. Supabase Auth, Postgres, RLS, and private Storage are the only supported backend boundaries for new work. The HUD uses existing shadcn primitives and Tailwind utility classes. No direct Prisma, Auth.js, or legacy object-storage imports are allowed.

## Blueprint files

- `components/FixedAssetManager.tsx` for fixed-asset selection and upload behavior.
- `app/app/factory/page.tsx` for product state, configuration persistence, and API orchestration.
- `app/api/products/[name]/config/route.ts` for owner-scoped Supabase route patterns.
- `supabase/migrations/0001_stockroom_foundation.sql` for RLS and index conventions.

## Test tier

This change earns unit, integration, and UI E2E coverage. Unit tests cover normalization and missing-asset filtering. Integration tests cover authenticated CRUD and owner isolation. UI E2E covers saving and applying a loadout in Factory; live magic-link credentials are not required for the automated gate.

## Implementation slices

### Slice A — Schema and pure helper

Create `0005_asset_loadouts.sql`, update Supabase types, and add `lib/asset-loadouts.ts`. The table stores `owner_id`, `name`, `asset_keys`, and timestamps with a unique owner/name constraint. RLS allows only the owner to select, insert, update, or delete. The helper trims names, de-duplicates keys, and filters keys against currently available fixed assets.

### Slice B — API routes

Create collection and detail routes for authenticated list/create/update/delete operations. Every query includes the authenticated owner filter. Invalid names, empty key lists, malformed IDs, and duplicate names return explicit 4xx responses without exposing another user’s records.

### Slice C — Factory integration

Load the owner’s loadouts when Factory opens, add a compact selector and management controls to `FixedAssetManager`, apply only available asset keys to the active product, preserve product-specific uploaded overrides, and persist the changed configuration through the existing save path.

### Slice D — Verification

Run unit and integration tests, then TypeScript validation and diff hygiene. Inspect the route and UI diffs independently. Run the UI flow against a local app with mocked authenticated responses if the live Supabase magic-link environment is unavailable.

## Risk level

Medium. The schema and owner isolation are new, while the UI reuses existing fixed-asset state and the existing product configuration save path. The primary risks are accidental cross-user access, silently dropping unavailable assets, and confusing product-specific overrides with reusable presets.

## Out of scope

Binary copying, public sharing, auto-application on product creation, Stripe gating, and changes to ZIP assembly are deferred.
