# Spec: Image-First Collection Inventory

## Overview

Redesign the authenticated Collection page as a dense, image-first digital-product inventory inspired by the supplied game inventory reference. The page should make the six sample products immediately understandable through visual tiles, compact labels, rarity-like readiness accents, and an information-rich detail pane while preserving virtual-stock workflows such as sample loading, selection, duplication, deletion, download, Etsy metadata review, and packaging readiness.

The Collection is a stockroom for digital products. It does not track sales, conversion, or product performance.

## Follows the pattern of

- `app/app/collection/page.tsx` — existing selection, detail, sample-loading, duplicate, delete, download, Etsy metadata, and packaging behavior.
- `components/EtsySlots.tsx` — existing compact dark media-preview cards and status treatment.
- `components/FixedAssets.tsx` — existing image-preview card conventions for asset inventory.
- `tests/e2e/collection.spec.ts` — existing Collection workflow and sample-loader regression coverage.

## Requirements

### Functional

- Keep the existing Collection route and authenticated data flow unchanged.
- Preserve the `Load sample collection` action and display all six sample products as visual inventory tiles.
- Give every sample product a deterministic, non-network-dependent placeholder image derived from its product identity. Placeholder art may be generated with CSS/SVG in the client and does not require persisted database image fields for this slice.
- Keep product selection accessible from each tile and preserve the current detail-pane sections for pricing, Etsy listing, folders, build/download state, version history, template validation, duplication, and deletion.
- Add visible inventory metadata such as SKU, category/type, price, readiness status, and file/package count where available.
- Use game-inventory visual cues: dark panels, dense grid, compact type, strong thumbnail area, thin rarity/status accent, selected outline, and small metadata labels. This is an inspiration, not a copy of any game’s branding or assets.
- Ensure the six sample placeholders are visibly distinct: wall-art print, coloring book, weekly planner, wedding invitation, social templates, and clipart bundle.

### Non-functional

- Follow the active v2 rules: Next.js App Router, TypeScript, Tailwind utility classes, existing UI primitives, and the current dark dashboard language.
- Do not add a sales dashboard, performance analytics, checkout, payment, or ecommerce behavior.
- Do not introduce remote image dependencies, external image URLs, or new database schema fields for this visual slice.
- Responsive behavior must remain usable from approximately 360px through desktop. The grid may reduce columns on narrow screens and show the detail pane below or beside the grid as appropriate.
- Keep accessibility: product tiles remain buttons with meaningful accessible names; decorative artwork is hidden from assistive technology or given an appropriate concise label; status and selected state remain perceivable without color alone.

## Architecture check

- Layer: authenticated web UI and deterministic presentation helper only.
- Imports allowed: existing UI primitives, `cn`, existing product types, and local pure presentation helpers.
- Imports forbidden: direct database access from the page, external image services, sales/performance APIs, and new persistence fields for thumbnails.

## Test tier this change must climb

- Unit: add coverage for the deterministic placeholder mapping so all six sample product names produce stable, distinct visual variants.
- E2E: preserve the existing sample-loader and product-selection flow.
- UI E2E + visual review: assert six image-first tiles, placeholder markers/art labels, selected state, and existing detail content after selecting a sample item.

## Implementation

### Files to create

#### 1. `lib/product-placeholder.ts`

Create a pure helper that maps a product name/category to a deterministic placeholder variant. Return the visual tokens needed by the tile: theme classes, glyph/monogram, category label, and readiness accent. Keep the helper free of React and browser APIs so it can be unit tested.

### Files to modify

#### 2. `app/app/collection/page.tsx`

Replace the current initial-only two-column list with an image-first inventory grid. Add a compact inventory header with count, search, sample-loader action, and a short stockroom explanation. Render each tile with a large placeholder-art panel, overlay metadata, product name, category/SKU, price, and status accent. Preserve existing button semantics and detail-pane behavior.

#### 3. `tests/e2e/collection.spec.ts`

Extend the sample-collection test to assert six visual product tiles and select a tile by its accessible product name before checking the existing detail sections. Avoid brittle assertions tied to exact decorative glyphs.

#### 4. `tests/unit/product-placeholder.test.ts`

Test deterministic output, distinct variants for the six sample products, and a safe fallback for an unknown product name.

## Files Summary

| Action | Path | Blueprint |
|--------|------|-----------|
| CREATE | `lib/product-placeholder.ts` | Pure helper based on current `lib/types.ts` and sample product naming |
| CREATE | `tests/unit/product-placeholder.test.ts` | Existing Bun unit-test style |
| MODIFY | `app/app/collection/page.tsx` | Existing Collection page and `components/EtsySlots.tsx` preview-card language |
| MODIFY | `tests/e2e/collection.spec.ts` | Existing Collection Playwright flow |

## Out of Scope

- Persisting thumbnail images or changing the Prisma schema.
- Uploading or generating production artwork.
- Sales, conversion, performance, checkout, or payment tracking.
- Rebuilding the Factory, Etsy Listing, Dashboard, or navigation pages.

## Verification

1. Run the project typecheck.
2. Run `bun test tests/unit/product-placeholder.test.ts` through the repository’s Bun-compatible runner.
3. Run the focused Collection Playwright test.
4. Open `/app/collection` in the live preview, authenticate with the existing development bypass, load the sample collection, and visually confirm the dense image-first grid and preserved detail pane.
5. Run `git diff --check` and leave the feature uncommitted for review.
