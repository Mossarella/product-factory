# Spec: Product Factory HUD Shell Restyle

## Overview

Extend the approved Collection inventory aesthetic across the authenticated Product Factory pages while preserving each page's existing workflows. The change also removes horizontal overflow from the Collection detail pane and makes Dashboard resilient when optional object storage is not configured in development.

## Follows the pattern of

- `app/app/collection/page.tsx` — approved image-first inventory language: near-black canvas, violet HUD accents, monospace labels, compact bordered panels, and dense responsive layout.
- `app/app/layout.tsx` and `components/Sidebar.tsx` — existing authenticated shell and navigation boundaries.
- `app/app/factory/page.tsx`, `app/app/product-templates/page.tsx`, and `app/app/settings/page.tsx` — existing page behavior and data-fetching patterns to preserve.

## Requirements

### Functional

- The Collection detail pane must never create horizontal page scrolling. Long product names, Etsy titles, descriptions, tags, folder names, and action controls must wrap or compress within the available width.
- Dashboard must render when S3/object-storage environment variables are absent. Missing optional hero objects should be treated as missing assets, not as a fatal page error.
- Dashboard, Factory, Product Templates, and Settings must retain their existing actions, API calls, forms, and navigation.
- Apply a consistent HUD visual system: dark canvas, thin translucent borders, violet/emerald/amber status accents, uppercase monospace section labels, compact panels, and responsive spacing.

### Non-functional

- Tailwind utility classes only; no component library additions and no custom CSS file required.
- Preserve existing shadcn-style primitives and `cn()` conventions.
- Responsive from approximately 360px wide through desktop.
- No sales/performance tracking features are added.
- No commit or merge is made before user review.

## Test tier

- Unit: Dashboard object-storage fallback behavior if the helper is changed.
- E2E: authenticated Dashboard render, Collection sample loading, and existing Collection selection flow.
- UI visual review: all authenticated pages at desktop and narrow viewport widths, with special attention to Collection detail overflow.

## Implementation

### Files to modify

- `lib/object-storage.ts` — return `false` from `objectExists` when the optional bucket is not configured.
- `app/app/collection/page.tsx` — add `min-w-0`, wrapping, responsive action layout, and overflow-safe text utilities to the detail panel.
- `app/app/dashboard/page.tsx` — apply the HUD panel language while preserving the existing stats.
- `app/app/factory/page.tsx` — apply shared HUD chrome to the page root, navigation/control panels, and section labels.
- `app/app/product-templates/page.tsx` — apply shared HUD chrome to list/editor panels and controls.
- `app/app/settings/page.tsx` — apply shared HUD chrome to profile/shop sections and form surfaces.
- `components/Sidebar.tsx` — align navigation chrome with the Collection HUD visual system if needed.
- Relevant E2E/unit tests — cover Dashboard render, overflow-safe structure, and preserved Collection workflows.

## Out of Scope

- No new product, sales, analytics, or performance features.
- No database schema changes.
- No asset upload/storage redesign.
- No commit, push, PR, or merge.

## Verification

1. Run `pnpm exec eslint` on changed files and `pnpm exec tsc --noEmit` with known baseline failures separated from new diagnostics.
2. Run the focused unit/E2E tests available in the repository.
3. Authenticate with `test@example.com` in development and verify `/app/dashboard`, `/app/collection`, `/app/factory`, `/app/product-templates`, and `/app/settings`.
4. Verify Collection at a narrow viewport does not produce horizontal overflow and that the right detail pane wraps long content.
