# Spec: Product Templates + Smart Validation

## Overview
Renames the "Fixed Assets" concept to "Product Template" throughout the
stack (Prisma model, API routes, page route, sidebar, and every internal
reference — full rename, not a UI-label-only change), and extends it from
a flat list of bundled-asset keys into a rule engine: each template can
declare a set of user-authored rules ("expects 12 named expression files,"
"expects a PDF," "expects the notes field filled in"), each markable as
required or optional. A product's actual files/config are validated
against its assigned template's rules, surfaced as a ✓/⚠/✗ checklist in
both the Factory page (while editing) and the Collection detail panel
(when browsing).

This is the beginning of what the user calls "the moat" — Product Factory
understanding what a *complete* product looks like, per product type,
where "product type" is whatever the user names their template ("PNGTuber,"
"Printable," "Notion Template," anything) — not a hardcoded enum.

## Follows the pattern of
- `app/app/fixed-assets/page.tsx` / `components/FixedAssets.tsx` — the
  system being renamed and extended. The asset-toggle editor UI is the
  blueprint for the new rule editor's list-of-cards-with-add/remove pattern.
- `components/EtsyListing.tsx`'s `readiness` array (✓/✗/○ glyphs, colored by
  `text-emerald-500`/`text-yellow-400`/`text-zinc-600`, rendered as a
  labeled checklist) — the direct visual blueprint for the new validation
  checklist, extended with a fourth glyph state for required-and-missing.
- `app/app/collection/page.tsx`'s existing inline "Readiness" section
  (lines ~260-276) — blueprint for where/how the new validation section
  slots into the detail panel (same location pattern, new content).
- `components/EtsyListing.tsx`'s tag chip-input UX (add/remove badges with
  an `Input` + Enter-to-add) — blueprint for the rule editor's
  variant-name and extension chip inputs.
- `prisma/migrations/` — one prior migration (`20260715170956_init`) to
  follow for migration-naming convention.

## Scope decisions (confirmed with user)
- **Full rename**: `Loadout` → `ProductTemplate` everywhere — Prisma model
  (with migration), `/api/loadouts` → `/api/product-templates` (note:
  **not** `/api/templates` — that path collides with a pre-existing,
  unrelated route `app/api/templates/[name]/route.ts` that serves static
  `readme.txt`/`etsy.txt` template text files for the ZIP-export flow;
  discovered and fixed during implementation), `loadoutId` →
  `templateId`, `/app/fixed-assets` → `/app/product-templates`, sidebar
  label, and every internal variable/type name.
- **Rule types (phase 1)**: `variant_checklist`, `file_type_present`,
  `field_present`. **`asset_present` is explicitly out of scope** — custom
  fixed-asset files (license/howto/custom slots) are not persisted per-
  product anywhere today (confirmed via exploration: they're in-memory
  `File` blobs only, baked into the ZIP at export and lost on reload).
  Validating presence of something that's never saved would silently
  report "missing" after every page reload. Building that persistence is
  a separate, larger piece of work. `field_present` is the stand-in for
  license/instructions-style checks the user can point at whichever
  existing text field fits.
- **Every rule has a `required: boolean`** flag, user-set per rule.
- **Results shown in**: Factory page (new card) + Collection detail panel
  (new section) — not a new per-tile badge in the Collection grid (that
  would require resolving every listed product's template + full file
  list just to render a badge, an N+1-style cost the existing grid view
  doesn't pay for anything else; the existing grid `complete`-based status
  dot stays as-is).
- **Templates are user-named, not a hardcoded enum** — "PNGTuber,"
  "Printable," "Notion Template" are just template names the user types
  (reusing the existing `Loadout.name` field), each with its own
  independently-authored rule set.

## Requirements

### Functional — Data model (Prisma)

Rename `Loadout` → `ProductTemplate`, add a `rules` field:

```prisma
model ProductTemplate {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  assets    String[]
  rules     Json      @default("[]")
  createdAt DateTime  @default(now())
  products  Product[]

  @@index([userId])
}
```

- `User.loadouts Loadout[]` → `User.productTemplates ProductTemplate[]`.
- `Product.loadoutId String?` → `Product.templateId String?`;
  `Product.loadout Loadout? @relation(...)` → `Product.template
  ProductTemplate? @relation(...)` (same `onDelete: SetNull` behavior).
- Migration name: `rename_loadout_to_product_template` (via
  `npx prisma migrate dev --name rename_loadout_to_product_template`) —
  Prisma will detect this as a model rename (same shape, different name)
  plus a new nullable-with-default column; confirm the generated migration
  SQL does a `ALTER TABLE ... RENAME TO` rather than drop+recreate before
  applying, since a drop+recreate would lose existing loadout data. If
  Prisma's diff engine doesn't detect it as a pure rename (it may propose
  drop `Loadout` + create `ProductTemplate` since it can't always infer
  renames from schema-only diffing), hand-write the migration SQL to use
  `ALTER TABLE "Loadout" RENAME TO "ProductTemplate"`,
  `ALTER TABLE "Product" RENAME COLUMN "loadoutId" TO "templateId"`, and
  add `ALTER TABLE "ProductTemplate" ADD COLUMN "rules" JSONB NOT NULL
  DEFAULT '[]'` instead of accepting a generated drop/recreate.

### Functional — Rule type (TypeScript)

New file `lib/template-rules.ts` (client-safe, no I/O):

```ts
export interface VariantChecklistRule {
  id: string
  type: 'variant_checklist'
  label: string
  required: boolean
  folder: string
  expectedVariants: string[]
}

export interface FileTypePresentRule {
  id: string
  type: 'file_type_present'
  label: string
  required: boolean
  folder?: string
  extensions: string[]
}

export interface FieldPresentRule {
  id: string
  type: 'field_present'
  label: string
  required: boolean
  field: 'description' | 'notes' | 'etsyTitle' | 'contact'
}

export type TemplateRule = VariantChecklistRule | FileTypePresentRule | FieldPresentRule

export interface ValidationResult {
  ruleId: string
  label: string
  required: boolean
  status: 'ok' | 'missing'
  detail?: string
}

export function validateProduct(config: ProductConfig, rules: TemplateRule[]): ValidationResult[] {
  return rules.map((rule) => {
    if (rule.type === 'variant_checklist') {
      const present = new Set(
        config.mascotFiles.filter((f) => f.folder === rule.folder).map((f) => f.variant),
      )
      const missing = rule.expectedVariants.filter((v) => !present.has(v))
      return {
        ruleId: rule.id, label: rule.label, required: rule.required,
        status: missing.length === 0 ? 'ok' : 'missing',
        detail: missing.length > 0
          ? `Missing: ${missing.join(', ')}`
          : `${rule.expectedVariants.length}/${rule.expectedVariants.length} found`,
      }
    }
    if (rule.type === 'file_type_present') {
      const files = rule.folder ? config.mascotFiles.filter((f) => f.folder === rule.folder) : config.mascotFiles
      const found = files.some((f) =>
        rule.extensions.some((ext) => f.origName.toLowerCase().endsWith(`.${ext.toLowerCase().replace(/^\./, '')}`)),
      )
      return { ruleId: rule.id, label: rule.label, required: rule.required, status: found ? 'ok' : 'missing' }
    }
    // field_present
    const value = config[rule.field]
    const found = typeof value === 'string' && value.trim().length > 0
    return { ruleId: rule.id, label: rule.label, required: rule.required, status: found ? 'ok' : 'missing' }
  })
}
```

`validateProduct` needs `TemplateRule`/`ValidationResult` imported alongside
`type { ProductConfig } from './types'` — add that import at the top of the
file (omitted above for brevity).

### Functional — API routes (renamed)

- `app/api/loadouts/route.ts` → `app/api/product-templates/route.ts`: same
  GET/POST shape, `POST` body becomes `{ name, assets, rules }` (defaults
  `rules` to `[]` same as `assets` defaults to `[]` today). Validate
  `rules` is an array before persisting (don't deep-validate rule shape
  server-side beyond that — client is the only author of rules today, and
  deep server-side schema validation of a discriminated union is more
  ceremony than this phase needs).
- `app/api/loadouts/[id]/route.ts` → `app/api/product-templates/[id]/route.ts`:
  same GET/PUT/DELETE shape, PUT accepts `rules` as a third optional
  partial-update field alongside `name`/`assets`.
- `app/api/products/[name]/config/route.ts`: rename every `loadoutId` read/
  write to `templateId` (the `toConfig()` mapper, the `POST` upsert
  `create`/`update` blocks).

### Functional — Page/route rename

- `app/app/fixed-assets/page.tsx` → `app/app/product-templates/page.tsx`
  (move the file/folder, not just edit in place).
- `components/Sidebar.tsx`: nav entry `label: 'Fixed Assets'` → `'Product
  Templates'`, `href: '/app/fixed-assets'` → `'/app/product-templates'`.
- `app/app/factory/page.tsx`: rename every `loadout`/`Loadout` identifier
  to `template`/`ProductTemplate` (state vars `loadouts`→`templates`,
  `selectedLoadoutId`→`selectedTemplateId`, the `activeAssets` memo's
  source, the "Manage →" link target `/app/fixed-assets` →
  `/app/product-templates`, the selector bar label "Loadout" → "Template").
  Keep `FixedAssetDef`/`components/FixedAssets.tsx`/`AssetSlot` naming
  as-is — that's the per-product *file slot* concept (thankyou/howto/
  custom blobs), which is a different, narrower thing than the template
  record itself and was not part of the rename discussion.

### Functional — Rule editor UI (in the renamed `app/app/product-templates/page.tsx`)

Add a new "Validation rules" section below the existing asset-toggle
editor, operating on the selected template's `rules: TemplateRule[]`
(new local state, mirroring how `editAssets` already works for `assets`).

- "+ Add rule" button opens a new rule with a type selector (`Select`:
  "Expected files checklist" / "File type required" / "Field required")
  defaulting to `variant_checklist`.
- Each rule renders as a `Card` (matching the existing loadout-editor
  card look) with:
  - `label` — free-text `Input`, placeholder "e.g. Expression files".
  - `required` — a toggle/checkbox, "Required" / "Optional".
  - Type-specific fields:
    - `variant_checklist`: `folder` free-text `Input` (placeholder "e.g.
      Expressions"), and an expected-variants chip input — reuse the same
      add/remove chip UX as `EtsyListing.tsx`'s tag editor (`Input` +
      Enter-to-add + removable `Badge` per chip), just targeting
      `expectedVariants: string[]` instead of `etsyTags`.
    - `file_type_present`: optional `folder` free-text `Input` (empty =
      "anywhere in the product"), and an extensions chip input (same chip
      UX, e.g. `pdf`, `png` — strip any leading dot the user types).
    - `field_present`: a `Select` of the four allowed fields
      (`description`/`notes`/`etsyTitle`/`contact`) with human labels
      ("Description", "README notes", "Etsy title", "Contact").
  - "✕ Remove rule" button.
- Save button persists `{ name, assets, rules }` via `PUT
  /api/product-templates/:id`, same pattern as the existing `save()` function.
- New rules get `id: crypto.randomUUID()` on creation (client-side, same
  convention as custom fixed-asset ids elsewhere in this codebase).

### Functional — Validation display: Factory page

New component `components/TemplateValidation.tsx`:

```tsx
interface Props {
  config: ProductConfig
  rules: TemplateRule[]  // the selected template's rules; empty if no template assigned
}

export function TemplateValidation({ config, rules }: Props) {
  if (rules.length === 0) return null
  const results = validateProduct(config, rules)
  return (
    <div className="space-y-2 font-mono text-sm">
      <p className="text-xs uppercase tracking-widest text-zinc-600">Template validation:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {results.map((r) => {
          const glyph = r.status === 'ok' ? '✓' : r.required ? '✗' : '⚠'
          const color = r.status === 'ok' ? 'text-emerald-500' : r.required ? 'text-red-400' : 'text-yellow-400'
          return (
            <div key={r.ruleId} className={color} title={r.detail}>
              <span>{glyph} {r.label}{r.detail ? ` — ${r.detail}` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

Glyph/severity mapping (extends the existing ✓/✗/○ convention with a
fourth state driven by `required`): **✓ ok** (emerald) · **✗ missing +
required** (red — blocking) · **⚠ missing + optional** (yellow —
advisory). Render this new component in `app/app/factory/page.tsx` near
the existing Template/Loadout selector bar, passing the currently
selected template's `rules` (resolved from the `templates` list state by
`selectedTemplateId`, defaulting to `[]` if none selected — component
renders nothing in that case).

### Functional — Validation display: Collection detail panel

In `app/app/collection/page.tsx`'s detail panel, add a new section
immediately after the existing "Readiness" block (~line 276), following
the same static (non-interactive) `✓`/glyph list styling already used
there, but reusing `validateProduct()` + the same three-glyph mapping as
the Factory-page component above. Only render this section when the
product's `templateId` is set and the resolved template has ≥1 rule (fetch
the template list the same way the Factory page does — `GET
/api/product-templates` — and resolve by the detail product's `templateId`).

## Architecture check
- `lib/template-rules.ts` is pure/client-safe (imports only `ProductConfig`
  from `lib/types.ts`) — no Prisma, no `fs`, importable from both server
  and client code.
- `components/TemplateValidation.tsx` is a client component but does no
  fetching itself — it receives `config` and `rules` as props; the parent
  (Factory page / Collection page) owns fetching the template list.
- API route renames must not change response/request shapes beyond adding
  `rules` — every existing consumer of `assets`/`name` continues to work
  unchanged.

## Implementation

### Files to create
| Path | Purpose |
|---|---|
| `lib/template-rules.ts` | `TemplateRule` union, `ValidationResult`, `validateProduct()` |
| `components/TemplateValidation.tsx` | Shared ✓/⚠/✗ checklist renderer |
| `app/app/product-templates/page.tsx` | Moved+renamed from `app/app/fixed-assets/page.tsx`, extended with the rule editor |
| `app/api/product-templates/route.ts` | Moved+renamed from `app/api/loadouts/route.ts`, extended with `rules` |
| `app/api/product-templates/[id]/route.ts` | Moved+renamed from `app/api/loadouts/[id]/route.ts`, extended with `rules` |
| `prisma/migrations/<timestamp>_rename_loadout_to_product_template/migration.sql` | Rename migration |

### Files to modify
| Path | Change |
|---|---|
| `prisma/schema.prisma` | `Loadout`→`ProductTemplate`, add `rules Json @default("[]")`, rename `Product.loadoutId`/`loadout`, rename `User.loadouts` |
| `app/api/products/[name]/config/route.ts` | `loadoutId`→`templateId` throughout |
| `components/Sidebar.tsx` | Nav label + href rename |
| `app/app/factory/page.tsx` | `loadout*`→`template*` renames, mount `<TemplateValidation>` |
| `app/app/collection/page.tsx` | New validation section in detail panel |

### Files to delete
| Path |
|---|
| `app/app/fixed-assets/page.tsx` (superseded by `app/app/product-templates/page.tsx`) |
| `app/api/loadouts/route.ts`, `app/api/loadouts/[id]/route.ts` (superseded by `app/api/product-templates/*`) |

## Out of Scope
- `asset_present` rule type (needs a persistence layer for custom fixed
  assets that doesn't exist yet — see Scope decisions above).
- Per-tile validation badges in the Collection grid view.
- Any change to the existing `complete` boolean's computation or the
  existing `productStatus`/`detailStatus`/`StatusBadge` logic — template
  validation is an additive, separate signal, not a replacement.
- Hardcoded "product type" enum/dropdown (PNGTuber/Printable/Canva) —
  templates are entirely user-named and user-ruled.
- Server-side deep validation of rule JSON shape (trusted client input,
  same trust level as the existing `assets: string[]` field today).

## Tests (mandatory per project rule)
- `tests/unit/template-rules.test.ts` — `validateProduct()` covering all
  three rule types: variant checklist with 0/some/all variants present
  (and the exact missing-names detail string), file-type-present scoped
  and unscoped to a folder, field-present for each of the four fields,
  and the required-vs-optional status mapping.
- `tests/integration/templates.test.ts` — the renamed
  `app/api/product-templates/route.ts` and `[id]/route.ts`: same auth/CRUD
  coverage as the current loadout tests (check if
  `tests/integration/loadouts.test.ts` exists — if so, this replaces it;
  rename rather than leave both), plus a case that PUTs a `rules` array
  and confirms it round-trips.
- `tests/e2e/product-template-validation.spec.ts` — dev-bypass sign-in,
  create a template with one required and one optional rule, assign it to
  a product missing both, confirm the Factory page shows ✗ for the
  required one and ⚠ for the optional one; add the missing content and
  confirm it flips to ✓.

## Verification
1. `npx prisma migrate dev --name rename_loadout_to_product_template`
   against the running dev Postgres (`docker ps` shows
   `product-factory-db-1` already up) — confirm it applies cleanly and
   `npx prisma studio` (or a quick query) shows existing loadout rows
   preserved under the new table name, not dropped.
2. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
3. `npm run dev` → sidebar now shows "Product Templates" → create a
   template named "PNGTuber" → add a required `variant_checklist` rule
   (folder "Expressions", variants: Happy/Sad/Angry/...) → assign it to a
   product in the Factory page → confirm the new validation card shows ✗
   for missing expressions with the exact missing names.
4. Open the same product from the Collection page → confirm the detail
   panel shows the same validation section.
5. Confirm the old `/app/fixed-assets` route and `/api/loadouts` routes no
   longer exist (404), and nothing else in the app still references them
   (`grep -rn "fixed-assets\|api/loadouts\|Loadout" --include="*.ts" --include="*.tsx"` should return nothing outside migration history).
