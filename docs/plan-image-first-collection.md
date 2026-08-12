# Plan: Image-First Collection Inventory

## Context

The active v2 Next.js Collection page currently uses initial-based product buttons and a text-heavy detail pane. Redesign the inventory surface to feel like a dark game stockroom while retaining the existing virtual packaging and Etsy metadata workflow.

## CLAUDE.md constraints that apply

- Work on v2 only; do not touch legacy v0/v1 branches.
- Use Tailwind utility classes and the existing UI primitives; no component library additions.
- Keep the Collection behavior authenticated and preserve the existing API contracts.
- Do not commit or merge until the user explicitly approves after reviewing the live preview.

## Blueprint files

- `app/app/collection/page.tsx` — preserve its existing fetch/select/detail/action behavior while replacing the tile presentation.
- `components/EtsySlots.tsx` — follow its compact dark media-preview card language.
- `tests/e2e/collection.spec.ts` — preserve the current sample-loader and detail assertions.

## Test tier

- Unit: deterministic placeholder mapping helper.
- E2E: sample collection loading and product selection.
- UI E2E + visual review: six image-first tiles, selected state, responsive grid, and preserved detail content.

## Risk level

Medium: user-facing visual change with preserved behavior and a new deterministic presentation helper. Use independent diff review plus live visual verification, but no schema or auth changes.

## Implementation

### Agent 1 — placeholder model and unit coverage

Files: `lib/product-placeholder.ts`, `tests/unit/product-placeholder.test.ts`

- Create a pure, deterministic name-to-visual-variant helper with six distinct sample variants and a safe fallback.
- Add Bun unit coverage for determinism, distinct variants, stable category labels, and unknown-name fallback.

### Agent 2 — Collection visual redesign

File: `app/app/collection/page.tsx`

- Replace the initial-only two-column list with a responsive image-first inventory grid.
- Use the helper to render deterministic placeholder art and category labels.
- Preserve tile button accessibility, sample-loader action, search behavior, selection state, and every existing detail/action block.
- Maintain a compact, dark HUD-style visual system using Tailwind classes only.

### Agent 3 — E2E regression updates

File: `tests/e2e/collection.spec.ts`

- Extend the sample-load flow to assert the six inventory tiles and image-placeholder markers.
- Keep selection and existing detail assertions for Pricing & License, Etsy Listing, and sample price.
- Keep duplicate coverage aligned with role/button semantics.

## Verification

1. Read all changed files and inspect the diff.
2. Run typecheck and focused unit tests.
3. Run focused Collection Playwright coverage.
4. Run `git diff --check`.
5. Start/refresh the live preview and inspect `/app/collection` at desktop and narrow viewport sizes.
6. Fix only verified issues; do not commit until the user approves the preview.
