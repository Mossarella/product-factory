# Spec: Reusable Asset Loadouts

## Overview

Reusable asset loadouts let users save a selected set of fixed assets as a named shop-level preset and apply that preset to another digital product. The feature reduces repeated asset selection while preserving per-product overrides and owner isolation.

## Follows the pattern of

- `components/FixedAssetManager.tsx` — existing fixed-asset selection and upload interaction.
- `app/app/factory/page.tsx` — existing product configuration save flow and fixed-asset state.
- `app/api/products/[name]/config/route.ts` — owner-scoped Supabase configuration persistence.
- `supabase/migrations/0001_stockroom_foundation.sql` — existing owner-scoped table and RLS migration style.

## Requirements

### Functional

- Users can create a named loadout from the currently selected fixed assets.
- Users can list, rename, delete, and apply their own loadouts.
- Applying a loadout updates the active product’s selected asset keys without deleting uploaded product-specific overrides.
- A loadout stores asset keys and metadata references, not duplicated binary objects.
- Missing or retired assets are shown as unavailable and are not silently applied.
- Product configuration remains the source of truth for the active product selection.
- Every API query and mutation is scoped to the authenticated Supabase user.

### Non-functional

- Use Supabase Postgres with RLS; no Prisma, Auth.js, or legacy object storage.
- Preserve the existing dark, compact, image-first HUD style and responsive behavior.
- Use existing shadcn/Tailwind UI patterns.
- Do not change ZIP packaging semantics in this slice.

## Architecture check

- Schema layer: a new `asset_loadouts` table with `owner_id`, `name`, `asset_keys`, timestamps, and a unique owner/name constraint.
- API layer: `/api/asset-loadouts` collection and `/api/asset-loadouts/[id]` detail routes using the typed Supabase server client.
- UI layer: a loadout control in the existing fixed-asset manager, wired through Factory state.
- Imports forbidden: Prisma, Auth.js, S3/MinIO helpers, or service-role credentials in browser code.

## Test tier this change must climb

- Unit: loadout normalization and missing-asset filtering.
- Integration: authenticated CRUD, owner isolation, and apply payload behavior for the API routes.
- UI E2E: applying a loadout changes the selected fixed assets in Factory; live Supabase auth is not required for the unit/integration gate.

## Implementation

### Files to create

- `supabase/migrations/0005_asset_loadouts.sql` — table, indexes, RLS, and owner/name uniqueness.
- `lib/supabase/database.types.ts` — generated-type additions for the new table.
- `app/api/asset-loadouts/route.ts` — authenticated list/create.
- `app/api/asset-loadouts/[id]/route.ts` — authenticated update/delete.
- `lib/asset-loadouts.ts` — pure normalization and available-key filtering.
- `tests/unit/asset-loadouts.test.ts` — pure helper coverage.
- `tests/integration/asset-loadouts.test.ts` — route contract and owner-isolation coverage.

### Files to modify

- `app/app/factory/page.tsx` — load presets, apply selected keys, and refresh product configuration state.
- `components/FixedAssetManager.tsx` — add the loadout selector, save, rename, delete, and apply controls.
- `docs/supabase-migration-todo.md` — record completion after verification.

## Out of Scope

- Copying or transforming asset binaries.
- Cross-user or public loadout sharing.
- Automatic application during product creation.
- Stripe, billing, or subscription gating.

## Verification

1. Run the focused unit and integration tests with the repository’s installed Bun-compatible command.
2. Run TypeScript validation and `git diff --check`.
3. Verify an authenticated Factory session can save a preset, switch products, apply it, and persist the resulting product configuration.
4. Leave the feature changes uncommitted for live-preview review unless explicitly instructed otherwise.
