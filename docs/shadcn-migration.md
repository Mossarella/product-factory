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
| 1 | Simple shared components | `LicenseBanner.tsx`, `FolderManager.tsx`, `ProductSelector.tsx`, `ReadmePreview.tsx` | done — PR #2 |
| 2 | Complex shared components | `EtsySlots.tsx`, `EtsyListing.tsx`, `ProductInfo.tsx`, `FileManager.tsx` | done — PR #3 |
| 3 | Loadout manager (Tabs) | `components/FixedAssets.tsx`, `app/app/fixed-assets/page.tsx` | done — PR #4 |
| 4 | Dashboard + Collection | `app/app/dashboard/page.tsx`, `app/app/collection/page.tsx` | done — PR #5 |
| 5 | Factory orchestrator + Sidebar + landing | `app/app/factory/page.tsx`, `components/Sidebar.tsx`, `app/page.tsx` | done — PR #6 |

Each batch = its own branch + PR into `claude/v2-nextjs`. Migration complete —
all 6 PRs stacked (#1 → #2 → #3 → #4 → #5 → #6), merge in order.

### Cross-batch bug found and fixed during batch 5 verification
While verifying batch 5's new loadout `Select` in `app/app/factory/page.tsx`,
found that Base UI's `SelectValue` doesn't derive its label from `SelectItem`
children — it only resolves labels from an explicit `items` prop on the root
`Select`. This was silently broken since batch 1 (`ProductSelector.tsx`
showed the raw product name instead of "✓/○ name — date") and batch 2
(`ProductInfo.tsx`'s License select showed lowercase "personal" instead of
"Personal"), invisible in testing because most other Select usages happen to
have identical value/label strings. Fixed with new commits directly on the
`batch1` and `batch2` branches (not bundled into batch 5's diff, since the
bug lived there), then cascaded forward through `batch3`/`batch4`/`batch5`
via `git rebase --onto` — each PR (#2, #3) now has its own correct commit
history, and #4/#5/#6 carry the fix through cleanly. See PR #2 and #3 for
the actual fix commits.

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

## Batch 2 — Implementation

Scope: `components/EtsySlots.tsx`, `components/EtsyListing.tsx`,
`components/ProductInfo.tsx`, `components/FileManager.tsx`. Presentational-only
— no state/logic/prop changes anywhere in this batch.

### Variant mapping per file
- **EtsySlots.tsx**: each slot row (`border bg-zinc-900 p-2`, border color
  flips to violet-500 while dragging) → `Card`, keeping the conditional
  className (dragging ? violet border : zinc-800 border) passed through as
  before. Thumbnail placeholder box stays a plain `<div>` (media placeholder,
  not a button/card/input pattern). "Pick file"/"Replace" → `Button
  variant="outline" size="xs"`. "✕ Clear" → `Button variant="destructive"
  size="xs"`.
- **EtsyListing.tsx**: the readiness-checklist items are text-only buttons
  whose color depends on state (emerald/yellow/zinc) — keep as plain
  `<button>` (not worth forcing into `Button` since the per-item dynamic
  color logic doesn't map to a fixed variant) OR use `Button variant="ghost"`
  with the dynamic color passed via `className` if it composes cleanly via
  `cn()` — use judgement, test that the color actually renders (tailwind-merge
  must let the passed text-color win over ghost's default). Tag-count pill
  (`border-zinc-700 px-2 py-0.5 text-xs ${tagColor}`) → `Badge
  variant="outline"` with `tagColor` passed via `className`. "Suggest" →
  `Button variant="outline" size="xs"`. Tag chips (label + ✕ remove) →
  `Badge variant="outline"` wrapping the label and the existing plain ✕
  `<button>` (same pattern as batch 1's FolderManager chip). Tag `<input>` →
  `Input`; "Add" → `Button variant="outline" size="xs"`. "Refresh
  Description"/"Copy Description" → `Button variant="outline"`. Description
  `<pre>` → wrap in `Card`. "Copy full listing" (solid violet, full width) →
  `Button variant="default" className="w-full"`.
- **ProductInfo.tsx**: `inputClass`/`labelClass` constants are removed.
  `<input>`/`<textarea>` → `Input`/`Textarea`. IMPORTANT: the field caption
  (currently `<span className={labelClass}>`) is nested INSIDE an outer
  `<label className="flex-1">` that wraps both the caption and the control —
  there's no `htmlFor`/`id` pairing. Do NOT replace that inner `<span>` with
  the `Label` component — `Label` renders an actual `<label>` tag, and
  nesting `<label>` inside `<label>` is invalid HTML. Keep the caption as a
  plain `<span className="mb-1 block text-xs uppercase tracking-wide
  text-zinc-500">` (same classes as the old `labelClass`, just inlined) and
  leave the outer `<label>` wrapper structure exactly as it is today. The
  Currency/License native `<select>` elements → shadcn `Select` (same
  compound-component pattern used in batch 1's `ProductSelector.tsx` — read
  that file's diff for the established pattern: `Select`/`SelectTrigger`/
  `SelectValue`/`SelectContent`/`SelectItem`, `onValueChange` receives the
  value directly). Price/Commercial-price `<input type="number">` → `Input
  type="number"`.
- **FileManager.tsx** (largest, most complex — the floating cursor-following
  image-zoom preview at the bottom of the file, `id="imgZoom"`, is explicitly
  OUT OF SCOPE, do not touch it, it stays a bespoke fixed-position div per the
  spec's Dialog/Tabs section above): the drag-and-drop dropzone stays a plain
  `<div>` (bespoke interactive drop target, not a reusable pattern). Folder
  coverage chips (`rounded border-zinc-800 bg-zinc-900 px-2 py-1`) → `Badge
  variant="outline"`. The bulk-selection action bar and the select-all bar
  (both `border-zinc-800 bg-zinc-900 p-2`) → `Card`. Per-file row (`border
  zinc-800 bg-zinc-900 p-2`) → `Card`. The bulk-folder `<select>` and each
  per-file folder `<select>` → shadcn `Select` (same pattern as above). Native
  checkboxes (`type="checkbox"`) stay untouched — no Checkbox primitive was
  installed and the app never styled them beyond browser default. "Apply"
  (solid violet) → `Button variant="default" size="xs"`. "Delete selected"
  (red) → `Button variant="destructive" size="xs"`. "Deselect all" and
  "Group by folder"/"Ungroup files" (both currently bordered but NOT
  filled/bg'd) → `Button variant="outline" size="xs"`, it's fine if they pick
  up `outline`'s default `bg-zinc-800` even though the original had no
  background — use judgement, minor. Per-row Variant `<input>` → `Input`.
  Per-row ✕ remove button stays a plain `<button>` (single-glyph micro-control,
  same precedent as batch 1's folder-chip arrows).

### Files to modify
`components/EtsySlots.tsx`, `components/EtsyListing.tsx`,
`components/ProductInfo.tsx`, `components/FileManager.tsx`.

### Out of scope (Batch 2)
No prop/behavior changes. The `FileManager.tsx` floating zoom preview stays
custom. No changes to `app/app/factory/page.tsx` — that's batch 5.

### Verification
1. `npx tsc --noEmit` — no new errors.
2. Sign in via the dev magic-link bypass, create/select a product, and
   screenshot `/app/factory` to visually confirm all four components (same
   approach used to verify batch 1) — clean up any test product created
   afterward (DB row + `products/<userId>/<name>/` directory).

## Batch 3 — Implementation

Scope: `components/FixedAssets.tsx`, `app/app/fixed-assets/page.tsx`.
Presentational-only — no state/logic/prop changes anywhere in this batch,
EXCEPT the loadout-list Tabs migration described below, which is a structural
change to how selection is wired (still same net behavior).

### FixedAssets.tsx (the `AssetSlot` sub-component + its exported wrapper)
- Each `AssetSlot` row (`border-zinc-800 bg-zinc-900/50 p-3`) → `Card`.
- The thumbnail placeholder box stays a plain `<div>` (media placeholder).
- The non-builtin label `<input>` → `Input`.
- "Pick file" → `Button variant="outline"`. "✕ Remove" → `Button
  variant="destructive"`. "+ Add custom asset" → `Button variant="outline"`.

### app/app/fixed-assets/page.tsx
- **Loadout list (the Tabs candidate)**: read `components/ui/tabs.tsx` first
  — it already supports `orientation="vertical"` with matching CSS hooks
  (`group-data-vertical/tabs:*`), built for exactly this sidebar-nav shape.
  Replace the vertical button list with `Tabs`/`TabsList`/`TabsTrigger` from
  `@/components/ui/tabs`: `<Tabs orientation="vertical" value={selectedId ??
  undefined} onValueChange={(id) => { const l = loadouts.find(x => x.id ===
  id); if (l) select(l) }}><TabsList className="w-52 flex-col
  items-stretch">{loadouts.map(l => <TabsTrigger key={l.id} value={l.id}
  className="justify-start data-active:border-l-2 data-active:border-violet-500
  data-active:bg-zinc-800/60 data-active:text-zinc-100
  border-transparent text-zinc-500 hover:text-zinc-300
  hover:bg-zinc-800/40">{l.name}</TabsTrigger>)}</TabsList></Tabs>`. Do NOT
  use `TabsContent` — the editor panel is state-driven (renders from
  `selected`/`editName`/`editAssets`, not per-tab pre-built panels), so it
  stays rendered separately outside the `Tabs` component, exactly where it is
  today. This migration touches control flow slightly (selection now flows
  through `onValueChange` instead of each button's own `onClick`) — verify
  carefully that clicking a loadout in the browser still switches the editor
  content correctly. If Base UI's `Tabs` fights the existing controlled-state
  model in a way that breaks selection, it's acceptable to fall back to
  leaving the list as plain buttons (matching the pattern already used
  elsewhere when a shadcn primitive doesn't cleanly fit) — note this
  explicitly in your output if you take that fallback.
- "+ New Loadout" button (dashed border) → `Button variant="outline"
  className="border-dashed ..."` (keep the dashed border + violet hover
  treatment via className).
- Editor panel wrapper (`border-zinc-800 bg-zinc-900/40 p-6`) → `Card`.
- "Loadout name" — this `<label>` is a plain sibling of the `<input>` (NOT
  wrapping it, unlike the nested-label case in batch 2's `ProductInfo.tsx`),
  so it's safe to use the `Label` component here → `Label` from
  `@/components/ui/label`. The name `<input>` → `Input`.
- Asset-type toggle grid (the 2-column icon/title/description cards that
  toggle on/off, `on ? violet-tinted : zinc-muted`) stays untouched — these
  are `<button>` elements with multi-select toggle behavior and a layout
  (icon + title + description stacked) that doesn't map cleanly to `Button`
  or `Card` without losing the interactive-element semantics or forcing an
  awkward fit. Leave as-is.
- "Save changes" (solid violet) → `Button variant="default"`.
- "Delete loadout" (neutral outline at rest, red only on hover — distinct
  from a loud destructive button) → `Button variant="outline"
  className="hover:border-red-700 hover:text-red-400"` (not
  `variant="destructive"`, which would be red at rest — that doesn't match
  this button's actual look).
- Empty states (dashed "No loadouts yet" placeholder) → `Card` with a
  `border-dashed` className override, or leave as a plain `<div>` if `Card`
  fights the centering layout — use judgement.

### Files to modify
`components/FixedAssets.tsx`, `app/app/fixed-assets/page.tsx`.

### Out of scope (Batch 3)
No prop/behavior changes beyond the Tabs selection wiring described above.
The asset-type toggle grid stays untouched.

### Verification
1. `npx tsc --noEmit` — no new errors.
2. Sign in via the dev magic-link bypass, visit `/app/fixed-assets`, create a
   loadout, click between multiple loadouts to confirm Tabs selection still
   works, toggle asset types, save, and delete — screenshot to confirm the
   visual look matches (left-border active indicator, flat corners) — clean
   up any test loadout created afterward.

## Batch 4 — Implementation

Scope: `app/app/dashboard/page.tsx` (server component), `app/app/collection/page.tsx`
(client component). Presentational-only — no data-fetching/logic changes.

### app/app/dashboard/page.tsx
- All 6 stat/insight cards (`border-zinc-800 bg-zinc-900/60 p-5`, both the
  main `stats` array grid and the 3 "Insights" cards) → `Card` from
  `@/components/ui/card`.
- The "Open Factory →" link is a Next.js `<Link>`, not a `<button>` — do NOT
  try to wrap it in the `Button` component. Instead apply
  `buttonVariants({ variant: "secondary" })` (exported from
  `@/components/ui/button`) directly as its className via `cn()`, e.g.
  `<Link href="/app/factory" className={cn(buttonVariants({ variant:
  "secondary" }), "inline-block")}>Open Factory →</Link>` — this gets the
  translucent-violet-pill look without needing polymorphic rendering.

### app/app/collection/page.tsx
- Search `<input>` → `Input` from `@/components/ui/input`.
- **Use the existing `StatusBadge` component** from
  `@/components/ui/status-badge.tsx` (built in batch 0 specifically for this
  file's pattern, unused until now) — read that file first. It already
  exports a `STATUS_STYLES` map with the exact same `ready`/`in-progress`/
  `empty` keys, colors, and dot+label markup as this file's local
  `STATUS_STYLES` const. Delete the local `STATUS_STYLES` const in this file
  and replace both places that render a dot+label pair (the product-grid
  card status indicator, and the detail-panel header status indicator) with
  `<StatusBadge status={status} />`. Check whether `status-badge.tsx`'s
  `StatusBadge` renders at a fixed size/spacing that fits both call sites
  (the grid card uses a smaller `w-1.5 h-1.5` dot + `text-xs`, the detail
  header uses a slightly larger `w-2 h-2` dot + `text-sm`) — if `StatusBadge`
  only supports one size, use it as-is for both (minor, acceptable) or pass a
  `className` prop if it supports one for size overrides — check the
  component's actual props first.
- The product-grid item is a `<button>` (must stay a real interactive
  button for click handling and keyboard access) — do NOT wrap it in `Card`
  (which renders a `<div>`, losing button semantics). Leave its own
  className/border/bg styling untouched; only swap its internal status
  dot+label for `StatusBadge`.
- The "Open in Factory →" `<a>` in the detail panel (same translucent-violet
  pill look as the dashboard's "Open Factory" link) → same
  `buttonVariants({ variant: "secondary" })` approach via `cn()`.
- Read-only tag chips in the detail panel (`border-zinc-700 px-2 py-0.5
  text-xs text-zinc-400`, no remove button — these are display-only, unlike
  `EtsyListing.tsx`'s editable tags from batch 2) → `Badge variant="outline"`.
- The 6 `<hr className="border-zinc-800 mb-5" />` dividers → `Separator`
  from `@/components/ui/separator` (its first real usage in the app) —
  `<Separator className="mb-5" />`.
- The readiness checklist (static ✓/✗ rows, dynamic per-item color, no
  onClick) stays untouched — same precedent as `EtsyListing.tsx`'s readiness
  checklist in batch 2.

### Files to modify
`app/app/dashboard/page.tsx`, `app/app/collection/page.tsx`.

### Out of scope (Batch 4)
No data-fetching or state-logic changes. The product-grid button and the
readiness checklist stay as plain elements (see above).

### Verification
1. `npx tsc --noEmit` — no new errors.
2. Sign in via the dev magic-link bypass, visit `/app/dashboard` and
   `/app/collection`, screenshot both, select a product in the collection
   detail panel to confirm `StatusBadge`/`Badge`/`Separator` render
   correctly and the search input and "Open in Factory" link still work.

## Batch 5 — Implementation (final batch)

Scope: `app/app/factory/page.tsx`, `components/Sidebar.tsx`, `app/page.tsx`
(marketing landing). `app/app/layout.tsx` and `app/layout.tsx` were reviewed
— no raw-Tailwind button/card/input patterns worth migrating there (just
structural wrappers and the theme setup from batch 0), so they're untouched.

### Bug fix (in scope for this batch, since it's in the file being touched)
`app/app/factory/page.tsx` lines ~309 and ~311 have literal backslash-escape
text typed directly into JSX children — `MossarellaStudio — Product
Factory` and `Pack your digital product → generate README →
download ZIP → list on Etsy` — these are NOT inside string/template
literals, so JS never interprets the `—`/`→` escapes; they render
as the literal 6-character sequence `—` instead of an em-dash, and
`→` instead of an arrow. Replace with the actual characters (— and →)
directly in the JSX text. (Contrast with line ~243's `fillReadmeTemplate`,
which uses the same escapes correctly — those ARE inside a real template
literal, so they already render fine; do not touch that line.)

### app/app/factory/page.tsx
This file is mostly an orchestrator that renders the already-migrated child
components (`LicenseBanner`, `ProductSelector`, `ProductInfo`,
`FolderManager`, `FileManager`, `FixedAssets`, `ReadmePreview`, `EtsySlots`,
`EtsyListing`) inside `<section>` wrappers — most of the heavy lifting
already happened in batches 0-4. Remaining raw patterns:
- Every `<section className="border border-zinc-800 p-4">` (and the one
  `bg-zinc-950 p-4` variant for the Product section) → `Card` from
  `@/components/ui/card` (check card.tsx's defaults first to avoid double
  padding/border — same care as every prior batch).
- The loadout `<select>` inside the Product section → shadcn `Select` (same
  compound-component pattern used in every prior batch — read
  `components/ProductInfo.tsx` or `app/app/fixed-assets/page.tsx` for the
  established convention in this codebase).
- The "Manage →" text link next to the loadout select → `Button
  variant="link" size="xs"` or leave as a plain `<a>` — it's a tiny
  inline text link, use judgement, low stakes either way.
- The dashed empty-state placeholder ("Select a product above to get
  started") → `Card` with a `border-dashed` className override (same
  pattern as batch 3's fixed-assets empty state), or leave as a plain
  `<div>` if `Card` fights the centered-text layout.

### components/Sidebar.tsx
- The vertical nav `<Link>` list (left-border active indicator) stays
  COMPLETELY untouched. This is real page navigation (route changes), not
  in-page content switching — using the `Tabs` component here (like batch
  3's loadout list) would be semantically wrong (screen readers would
  announce real navigation links as "tabs", misleading users about what
  activating them does). Do not migrate this section.
- The "Sign out" `<button>` (text-only, no border) → `Button variant="ghost"
  size="xs"`.
- The brand `<Link>` at the top stays untouched (plain navigational link,
  not a button pattern).

### app/page.tsx (public marketing landing page — not behind auth)
- Every `<Link>` styled as a button (nav "Open App"/"Buy Pro", hero CTAs,
  pricing CTAs, final CTA — roughly 7 total) → apply `buttonVariants({
  variant: ... })` from `@/components/ui/button` directly via `cn()` from
  `@/lib/cn` (same approach established in batch 4 for `<Link>`/`<a>`
  elements — do NOT wrap them in the `Button` component itself). Map solid
  violet CTAs → `variant: "default"`, zinc-outline CTAs → `variant:
  "outline"` (note: the original "See how it works" and "Open App" nav
  links have NO background fill, just a border — `outline`'s default has a
  `bg-zinc-800`-ish fill via `bg-secondary`; either accept that minor
  difference or override with `bg-transparent hover:bg-transparent` via
  className, use judgement).
- Feature cards and pricing cards (`border-zinc-800 bg-zinc-900 p-5`/`p-6`)
  → `Card`.
- The "Recommended" corner ribbon on the Pro pricing card (absolute
  positioned, `border-l border-b border-violet-700 bg-violet-900 px-3 py-1
  text-xs text-violet-300`) → `Badge` with the position/border classes
  passed via `className`, or leave as a plain `<div>` if `Badge`'s own
  default classes (padding, rounded corners, `overflow-hidden`) fight the
  ribbon's specific corner-flag shape — use judgement.
- The "How it works" numbered step boxes (`w-12 h-12 border-zinc-700
  bg-zinc-900`, centered number) stay untouched — a fixed-size decorative
  number badge, not a Card/Button pattern.
- Footer and nav brand text stay untouched (plain text, not components).

### Files to modify
`app/app/factory/page.tsx`, `components/Sidebar.tsx`, `app/page.tsx`.

### Out of scope (Batch 5)
Sidebar's nav links (see reasoning above). `app/app/layout.tsx` and
`app/layout.tsx` (reviewed, nothing to migrate). The "How it works" step
number boxes on the landing page.

### Verification
1. `npx tsc --noEmit` — no new errors.
2. Sign in via the dev magic-link bypass, visit `/app/factory` (confirm the
   header bug fix — real em-dash and arrows, not literal `—`/`→`
   text — and that all sections still render/function with a real
   product), and visit `/` (landing page, no auth needed) to confirm all
   CTAs and cards render correctly.
