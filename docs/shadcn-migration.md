# Spec: shadcn/ui migration (whole app)

## Overview
Introduce shadcn/ui so recurring hand-typed Tailwind patterns (buttons, cards, badges,
inputs, dialogs, tabs) become reusable components. Layout Tailwind (flex/grid/spacing)
stays as-is. The current visual look (zinc-950 background, violet-600/700 accents,
monospace font, flat/square corners) must be preserved exactly via shadcn's CSS-variable
theme. Ships as multiple small PRs, each its own branch off `claude/v2-nextjs`, per the
mandatory push workflow in `CLAUDE.md`.

## Follows the pattern of
- No prior shadcn usage exists — this spec establishes the pattern for the rest of the app.
- `lib/utils.ts` — existing helper-module convention (small named exports, tested in `tests/unit/`).
- `tests/integration/*.test.ts` — `mock.module()` convention for future integration tests if any batch touches API logic (most won't).

## Catalogued patterns (source of truth for variant design)
- **Buttons** (5 variants): primary solid violet, translucent violet "pill" CTA, zinc
  outline/default, destructive red, icon/text-only link. Sizes: `xs` (px-2 py-1 text-xs),
  `sm` (px-3 py-1.5 text-sm), `default` (px-4 py-2/2.5 text-sm).
- **Cards/panels**: `border border-zinc-800` + varying `bg-zinc-900` opacity + padding
  (p-3/4/5/6), dashed empty-state variant, "selected" state (`border-violet-500 bg-zinc-800/80`).
- **Status badges**: `STATUS_STYLES`-style dot+label+color (ready/in-progress/empty),
  plus plain tag chips (`border border-zinc-700 px-2 py-0.5 text-xs`).
- **Form inputs**: canonical `inputClass`/`labelClass` from `components/ProductInfo.tsx`,
  re-typed ad hoc in 6+ other files. Textareas = same class + `min-h-[72px]`.
- **Dialog/Tabs**: no true modal exists (the `FileManager.tsx` floating image preview is
  cursor-following, not modal — stays custom). No true tab bar outside `Sidebar.tsx`; the
  loadout list / asset-type chip grid in `fixed-assets/page.tsx` are the best Tabs candidates.

## Requirements

### Functional
- Same behavior, same visual appearance, before and after each batch's migration.
- New shared primitives live in `components/ui/*`, imported via `@/components/ui/*`.
- `cn()` helper lives at `lib/cn.ts` (not `lib/utils.ts`, to avoid colliding with the
  existing `avatarColor`/`greeting`/`formatDate`/`tagKey` exports there). Configure
  `components.json`'s `aliases.utils` to `@/lib/cn` so generated components import from there.

### Non-functional
- No new light/dark toggle — app is single-theme dark, CSS variables set once in `:root`.
- `--radius: 0rem` — app has no rounded corners except the one-off `rounded-full` status dot.
- Every new function must have unit test coverage per the mandatory testing rule; every
  migrated page keeps/gains an E2E smoke test; no integration tests needed unless a batch
  touches API route logic (none currently do).

## Theme (CSS variables in `app/globals.css`, single `:root`, no `.dark` split)
| Variable | Value |
|---|---|
| `--background` | zinc-950 |
| `--foreground` | zinc-100 |
| `--card` / `--popover` | zinc-900 |
| `--card-foreground` / `--popover-foreground` | zinc-100 |
| `--primary` | violet-600 |
| `--primary-foreground` | zinc-100 |
| `--secondary` | zinc-800 |
| `--secondary-foreground` | zinc-100 |
| `--muted` | zinc-900 |
| `--muted-foreground` | zinc-500 |
| `--accent` | violet-500 |
| `--accent-foreground` | zinc-100 |
| `--destructive` | red-900 |
| `--destructive-foreground` | red-100 |
| `--border` | zinc-800 |
| `--input` | zinc-700 |
| `--ring` | violet-500 |
| `--radius` | 0rem |

Font unchanged (Geist Sans/Mono via `next/font`).

## Button variant → cva mapping
- `default` → primary solid violet (`bg-primary text-primary-foreground border border-primary hover:bg-violet-500`)
- `secondary` → translucent violet pill (`border-violet-700 bg-violet-700/20 text-violet-300 hover:bg-violet-700/40`)
- `outline` → zinc bordered (`border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700`)
- `ghost` → text-only, no border, hover tint
- `destructive` → red (`border-red-900 bg-red-950 text-red-400 hover:bg-red-900`)
- `link` → underline violet text
- Sizes: `xs`, `sm`, `default` (add `xs` alongside shadcn's stock `sm`/`default`/`lg`/`icon`)

## Batch plan
| Batch | Scope | Files | Status |
|---|---|---|---|
| 0 | Setup + pilot (this spec's immediate scope) | `components.json`, `app/globals.css`, `lib/cn.ts`, `components/ui/*` (button, card, badge, input, textarea, label, separator, dialog, tabs, status-badge), `app/login/page.tsx` | done — PR #1 |
| 1 | Simple shared components | `LicenseBanner.tsx`, `FolderManager.tsx`, `ProductSelector.tsx`, `ReadmePreview.tsx` | in progress |
| 2 | Complex shared components | `EtsySlots.tsx`, `EtsyListing.tsx`, `ProductInfo.tsx`, `FileManager.tsx` | not started |
| 3 | Loadout manager (Tabs) | `components/FixedAssets.tsx`, `app/app/fixed-assets/page.tsx` | not started |
| 4 | Dashboard + Collection | `app/app/dashboard/page.tsx`, `app/app/collection/page.tsx` | not started |
| 5 | Factory + Sidebar + landing/layouts | `app/app/factory/page.tsx`, `components/Sidebar.tsx`, `app/page.tsx`, `app/app/layout.tsx`, `app/layout.tsx` | not started |

Each batch = its own branch + PR into `claude/v2-nextjs`. Update the Status column as batches land.

## Architecture check
- Layer: presentation only (`components/ui/*`, page components). No changes to `lib/`
  business logic, `app/api/*` routes, or Prisma schema in any batch.
- Imports allowed: `components/ui/*` may import Radix primitives, `class-variance-authority`,
  `@/lib/cn`. Pages/components import from `@/components/ui/*`.
- Imports forbidden: `components/ui/*` must not import `@/lib/db`, `@/auth`, or any
  server-only module — these are client-safe presentational components.

## Batch 0 — Implementation

### Files to create
1. `lib/cn.ts` — `export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }`
2. `components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`,
   `label.tsx`, `separator.tsx`, `dialog.tsx`, `tabs.tsx` — via `npx shadcn@latest add`,
   then hand-edited to match the variant mapping above.
3. `components/ui/status-badge.tsx` — small wrapper: dot + label, `variant: 'ready' | 'in-progress' | 'empty'`
   (colors: emerald-400/amber-400/zinc-600 per the existing `STATUS_STYLES` object in
   `app/app/collection/page.tsx`), for reuse across later batches.
4. `tests/unit/cn.test.ts` — verifies `cn()` merges/dedupes conflicting Tailwind classes.
5. `tests/e2e/login.spec.ts` — smoke test: page loads, email input + submit button present,
   follows the `test.skip(!!process.env.CI, ...)` pattern already used in `tests/e2e/dashboard.spec.ts`.

### Files to modify
1. `app/globals.css` — replace ad hoc `--background`/`--foreground` + `prefers-color-scheme`
   block with the full CSS variable theme table above (single `:root`, no media query).
2. `components.json` (created by `shadcn init`, then edited) — set `aliases.utils` to `@/lib/cn`.
3. `package.json` — new deps from the CLI (`class-variance-authority`, `clsx`, `tailwind-merge`,
   relevant `@radix-ui/*` packages, `lucide-react`).
4. `app/login/page.tsx` — migrate to use `Button`, `Input`, `Label`, `Card` from `components/ui/*`,
   same layout/copy/behavior as today.

## Out of Scope (Batch 0)
- Any file in `components/*.tsx` other than the new `components/ui/*` primitives.
- The `FileManager.tsx` floating image preview (stays custom).
- Any behavior/logic change anywhere.

## Verification
1. `npm run dev` → visit `/login`, confirm identical look to before (zinc-950 bg, violet CTA).
2. `bun test tests/unit/cn.test.ts` passes.
3. `bun x playwright test tests/e2e/login.spec.ts` passes.
4. `npx tsc --noEmit` (or `next build`) — no type errors.

## Batch 1 — Implementation

Scope: `components/LicenseBanner.tsx`, `components/FolderManager.tsx`,
`components/ProductSelector.tsx`, `components/ReadmePreview.tsx`. All four are
presentational-only changes — no state/logic/prop changes, same behavior.

### New primitive needed
`ProductSelector.tsx` has a native `<select>` styled like an input — batch 0
didn't install a Select primitive. Add it now: `npx shadcn add select`.

### Variant mapping per file
- **LicenseBanner.tsx**: the three colored status banners (pro/success/free-plan)
  → `Card` with the existing border/bg color classes passed via `className`
  (emerald for pro/success, zinc for the free-plan banner — same pattern as the
  login page's colored panels in batch 0). License-key `<input>` → `Input`.
  "Activate" button → `Button variant="outline"`. "Upgrade → $29" button
  (`bg-violet-900 border-violet-700`) → `Button variant="secondary"`.
- **FolderManager.tsx**: folder chip `<span>` → `Badge variant="outline"`
  wrapping the label + the ▲▼✕ inline action buttons (keep those as plain
  `<button>` with their existing hover-color-only styling — they're single-glyph
  micro-controls, not worth forcing into `Button` if it disrupts the inline
  chip layout; use judgment). "Folder name" `<input>` → `Input`. "Add" button
  → `Button variant="outline"`.
- **ProductSelector.tsx**: the shared `buttonClass` constant (reused ~8×) →
  `Button variant="outline"`, replacing the constant entirely. The product
  `<select>` → shadcn `Select`. "Upgrade" text-link → `Button variant="link"
  size="xs"`. "Download ZIP" button (`bg-violet-900`) → `Button
  variant="secondary"`. The "Save product" button conditionally shows an
  emerald "dirty" state — keep that as a literal className override (not a new
  cva variant) on top of `Button variant="outline"`, same pattern as batch 0's
  colored Card panels. Rename/duplicate/create name-input → `Input`. The
  `zipPreviewText` `<pre>` block → wrap in `Card`.
- **ReadmePreview.tsx**: "Refresh" button → `Button variant="outline"`. The
  preview `<pre>` block → wrap in `Card`.

### Files to modify
`components/LicenseBanner.tsx`, `components/FolderManager.tsx`,
`components/ProductSelector.tsx`, `components/ReadmePreview.tsx`.

### Files to create
`components/ui/select.tsx` (via CLI).

### Out of scope (Batch 1)
No prop/behavior changes. No changes to `app/app/factory/page.tsx` (which
renders these components) — that's batch 5.

### Verification
1. `npx tsc --noEmit` — no new errors.
2. `npm run dev` → the Factory page (`/app/factory`, requires auth) renders
   these components — visually spot-check against current look if a session
   is available; otherwise rely on type-check + structural review since these
   components aren't yet covered by an E2E spec that would need auth.
