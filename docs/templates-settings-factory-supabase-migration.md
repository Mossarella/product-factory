# Supabase Migration Strategy: Product Templates, Settings, and Factory

## Context

The active `claude/supabase-foundation` worktree has already migrated Supabase Auth SSR, owner-scoped product APIs, private product-file and product-build Storage, Collection asset flows, duplication, build lifecycle, and dashboard statistics. Product Templates, Settings, and Factory still contain legacy Auth.js, Prisma, or dependent service calls. This strategy preserves the existing game-inventory HUD and changes only the backend foundation and its data adapters.

The migration remains **uncommitted** until the live preview and verification gates are reviewed explicitly.

## Migration principles

Every authenticated handler must obtain the user through `createClient().auth.getUser()`, filter every Postgres query by `owner_id = user.id`, and rely on the existing RLS policies as a second boundary. Private Storage objects must be accessed through the server Supabase client; browser code must never receive service-role credentials or unrestricted object paths.

The existing public response shapes should remain stable. Route handlers should translate Supabase snake_case columns into the current camelCase API contract at the boundary. Database writes should use small, explicit field allowlists rather than accepting arbitrary request bodies.

The migration order is deliberately staged: **Product Templates first** because its table and RLS policy already exist and its API is isolated; **Settings second** because it primarily maps to `profiles` and avatar Storage; **Factory third** because it orchestrates products, templates, profiles, builds, licensing, and billing and therefore has the largest dependency surface.

## Existing Supabase foundation used by all three areas

| Resource | Existing shape | Migration use |
|---|---|---|
| `product_templates` | `id`, `owner_id`, `name`, `assets`, `rules`, timestamps | Replace Prisma template CRUD directly. |
| `profiles` | `id`, `display_name`, `shop_name`, `shop_contact`, `shop_description`, `readme_footer`, `plan`, timestamps | Replace settings profile reads/writes. |
| `products` | Owner-scoped product metadata with `template_id` | Factory and template selection remain product-owned. |
| `product_files` | Owner-scoped source and fixed-asset metadata | Factory packaging continues to use the migrated Collection routes. |
| `product_builds` | Owner-scoped build history and Storage paths | Factory build history and download UI use the migrated build routes. |
| `product-files` bucket | Private, user-rooted objects | Store avatars only if the existing avatar path is extended with an explicit profile namespace; otherwise add a dedicated private `profile-assets` bucket through a migration. |
| `product-builds` bucket | Private, user-rooted build ZIPs | No new Factory storage implementation is needed. |

## Phase 1 — Product Templates

### Routes and behavior

1. Migrate `GET /api/product-templates` to query `product_templates` with `eq('owner_id', user.id)` and `order('created_at', { ascending: true })`.
2. Migrate `POST /api/product-templates` to validate a non-empty trimmed name, normalize missing assets/rules to empty arrays, insert `owner_id`, and return status 201 with the existing `{ id, name, assets, rules }` shape.
3. Migrate `GET /api/product-templates/[id]` to query by both `id` and `owner_id`, returning 404 for another user's template.
4. Migrate `PUT /api/product-templates/[id]` with an explicit update allowlist for `name`, `assets`, and `rules`; validate array payloads and preserve the existing response shape.
5. Migrate `DELETE /api/product-templates/[id]` with an owner-scoped delete and 204 response.

The existing `app/api/templates/[name]` route serves repository-shipped text files and is not the user-owned Product Templates CRUD API. It should remain a static template-file route during this slice.

### Tests

Add or update integration coverage for unauthenticated access, CRUD success, invalid names, missing IDs, and cross-user isolation. Add a unit mapper/validator test for request-body normalization and snake_case-to-camelCase response mapping. The route slice must pass typecheck and the focused integration tests before moving to Settings.

## Phase 2 — Settings

### Profile API

Migrate `GET /api/profile` and `PUT /api/profile` to the `profiles` table. Use the authenticated user's ID as the only row key. Preserve the current profile response contract, mapping `display_name`, `shop_name`, `shop_contact`, `shop_description`, `readme_footer`, and `plan` to the frontend's expected fields. Profile bootstrap must remain idempotent; an absent profile should be created with the auth user ID and safe defaults rather than causing a 500.

The PUT handler should accept only the editable settings fields. `plan`, subscription identifiers, and account ownership fields must not be writable from the browser.

### Avatar API

Migrate `POST /api/profile/avatar` and `GET /api/profile/avatar`. Use a private Storage namespace rooted at the authenticated user, for example `<user-id>/profile/avatar.<ext>`, and store only the path plus MIME metadata in `profiles` if the schema is extended. If the current `profiles` schema lacks avatar columns, add a focused migration with `avatar_storage_path` and `avatar_mime`; do not reintroduce binary avatar data into Postgres. The GET route must query the owner row, download the private object server-side, and return a safe content type. Replace cache-busting database image behavior with a stable route URL plus an updated timestamp query from the caller.

### Settings UI

The HUD page should retain its current visual structure. Only the data source and submit handlers change. Existing profile fields must continue to load and save through `/api/profile`; avatar upload remains a multipart or raw-body server request with the existing size and MIME restrictions.

### Tests

Cover profile bootstrap, editable-field updates, ignored/rejected protected fields, avatar upload/download, oversized files, invalid content types, and authenticated owner isolation. Add a regression test that an unauthenticated request cannot read or update settings.

## Phase 3 — Factory

Factory is an orchestration page, not a new storage domain. Migrate its dependencies in this order:

1. **Product and config loading:** reuse the already-migrated `/api/products`, `/api/products/[name]/config`, file, asset, duplicate, and delete routes. Do not add direct database reads to the client.
2. **Template loading:** point template selectors at the migrated `/api/product-templates` endpoint and preserve the current `templateId` field in product config writes.
3. **Profile/shop identity:** use the migrated `/api/profile` response for shop name, contact, description, and README footer defaults.
4. **Build orchestration:** retain `/api/products/[name]/build`, `/build/latest`, `/build/[version]`, and `/build/[version]/revert` as the only build lifecycle boundary. Factory must not access `product_builds` or Storage directly from the browser.
5. **License/subscription actions:** migrate `/api/activate` authentication first. Billing checkout and portal routes are a separate Stripe-dependent slice: replace Auth.js with Supabase Auth and replace Prisma customer lookup only after the profile/subscription schema mapping is confirmed. Do not make plan values client-writable.
6. **Static template text:** keep `/api/templates/[name]` filesystem-backed unless the product explicitly requires user-editable templates. It is not part of the Supabase user-data migration.

### Factory-specific risks

Factory currently combines many asynchronous operations: product loading, uploads, config save, duplication, deletion, build preview, activation, and billing redirects. The migration must avoid changing the HUD state machine. Each action should continue to call one public API boundary and update the same success/error flash states. The highest-risk regressions are stale template/profile state, accidental cross-user product access, double uploads, and plan or billing state being writable from the client.

### Tests

Factory requires integration tests for product/template/profile composition and build orchestration, plus browser coverage for loading a product, selecting a template, saving a product, generating a build, and recovering from an unauthorized response. Billing redirect tests should mock Stripe and remain separate from the core Supabase data migration.

## Route migration order and acceptance gates

| Order | Slice | Acceptance gate |
|---:|---|---|
| 1 | Product Templates CRUD | Typecheck, CRUD integration tests, cross-user 404 tests, no legacy imports. |
| 2 | Profile GET/PUT | Profile mapping tests, bootstrap test, protected-field test, no legacy imports. |
| 3 | Avatar Storage | Storage policy test, MIME/size tests, authenticated download test. |
| 4 | Factory template/profile adapters | Factory unit tests and live preview smoke test. |
| 5 | Activate route | Auth migration tests and key-service compatibility check. |
| 6 | Billing routes | Stripe-mocked integration tests; separate review because this performs external transactional redirects. |
| 7 | Legacy cleanup | Full typecheck/test pass, repository-wide legacy import scan, RLS/Storage isolation tests, then dependency removal. |

## Explicit non-goals

This strategy does not redesign the HUD, add analytics, introduce sales-performance tracking, change the product packaging format, migrate repository-shipped static template text into user data, or alter Stripe product/pricing behavior. It also does not authorize a commit or deployment.

## Verification commands

Run the repository commands declared in `CLAUDE.md` and `package.json`: `pnpm typecheck` or the installed TypeScript binary, focused Bun tests where Bun is available, the full unit/integration suite, and the Playwright suite for Factory interactions. Also run `git diff --check` and a repository-wide scan for imports from `@/auth`, `@/lib/db`, and `@/lib/object-storage` before removing legacy dependencies.
