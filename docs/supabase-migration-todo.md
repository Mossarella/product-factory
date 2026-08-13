# Supabase Migration TODO

This checklist tracks the ground-up replacement of the unstable Auth.js, Nodemailer, local PostgreSQL, Prisma runtime, and S3-compatible storage foundation. The approved rollback baseline is commit `01bc2d7` on `claude/magic-link-smtp-clean`; migration work belongs on `claude/supabase-foundation`.

## P0 — Remote foundation access

- [x] Use the connected Supabase project integration for remote migration access; no service-role secret is committed or exposed.
- [x] Apply `supabase/migrations/0001_stockroom_foundation.sql` to the Supabase project.
- [x] Verify the tables, indexes, triggers, RLS policies, and private Storage buckets in the Supabase dashboard or CLI.
- [x] Record the applied migration version `20260813045511` and confirm that no service-role secret is committed or exposed to browser code.

## P1 — Supabase authentication

- [x] Add Supabase Auth SSR proxy wiring to the active Next.js request pipeline.
- [x] Replace the Auth.js login page with Supabase email magic-link authentication.
- [ ] Add a development-only test login path for `test@example.com` that cannot be enabled in production.
- [x] Add profile bootstrap logic for new `auth.users` records.
- [x] Protect authenticated routes with verified Supabase claims.
- [ ] Add login, logout, expired-session, and callback regression tests. Supabase logout is now wired in the Sidebar.

## P1 — Supabase data access

- [x] Add generated live-schema types and the first typed Supabase products API access.
- [x] Replace Prisma reads and writes in Dashboard.
- [x] Replace Prisma reads and writes in Collection, including product config, file uploads/downloads, slot assets, Veado assets, rename, duplicate, and delete.
- [x] Port and test the idempotent six-product sample loader.
- [x] Replace Product Templates CRUD data access.
- [x] Replace Settings profile and avatar data access.
- [x] Replace Factory profile, license-status, template, product, and build adapters.
- [x] Migrate Factory license activation and license-status routes to Supabase RPCs.
- [ ] Migrate Stripe checkout/portal/webhook routes after payment-provider integration testing.
- [ ] Verify that every query remains owner-scoped through both repository filters and RLS.
- [x] Apply and verify the owner-scoped product events migration for dashboard telemetry.
- [x] Add and apply the owner-scoped `product_releases` migration for immutable release snapshots.
- [x] Add private release-bundle persistence, idempotent finalization, owner-scoped release history, and secure release downloads.
- [x] Add the Factory and Collection HUD Release panel with finalization, history, and download actions.

## P1 — Supabase Storage and packaging

- [ ] Replace the S3/object-storage helper with private Supabase Storage operations.
- [x] Define user-rooted object paths such as `<auth.uid()>/<product-id>/...`.
- [x] Migrate product source-file uploads, deletes, slot assets, Veado assets, and downloads.
- [x] Migrate generated ZIP builds, manifests, changelogs, version downloads, and reverts.
- [x] Implement private download authorization through authenticated Supabase Storage requests.
- [x] Verify ZIP creation and download behavior at the route/integration-test level; live browser verification remains pending.
- [x] Add pre-build completeness checks with blocking and warning states in Factory.
- [x] Reject missing required template rules before ZIP assembly and Storage writes.

## P2 — Remove unstable infrastructure

- [x] Remove Auth.js and Nodemailer from the active runtime. Historical migration notes remain in `docs/`.
- [x] Remove Prisma runtime usage, seed/schema files, and local PostgreSQL assumptions from the active runtime.
- [x] Remove the S3/MinIO helper and Docker storage dependency from the active runtime.
- [x] Update environment documentation and deployment configuration guidance in `.env.example` and `docs/deployment-readiness.md`.
- [ ] Remove obsolete development bypasses and secrets.

## P2 — Verification and deployment

- [ ] Run TypeScript, ESLint, unit, integration, and Playwright tests. Dashboard Playwright smoke coverage passes; the authenticated packaging and release specs remain gated on `SUPABASE_E2E_EMAIL` and `SUPABASE_E2E_MAGIC_LINK`.
- [ ] Add RLS isolation tests proving one user cannot read or modify another user's products or files.
- [ ] Add Storage policy tests for upload, read, update, delete, and unauthorized access.
- [ ] Select a persistent Next.js deployment host.
- [ ] Configure production Supabase redirect URLs and email templates.
- [ ] Deploy a persistent review environment and stop relying on temporary sandbox proxy URLs.
- [ ] Commit migration milestones only after each acceptance gate passes.

## Current continuation work

Completed locally and remotely:

- [x] Supabase browser, server, and session-refresh client foundations.
- [x] Environment variable placeholders and ignored local project configuration.
- [x] Initial schema and RLS/Storage policy migration.
- [x] Security-hardening migration; the Supabase security advisor now reports no lints.
- [x] Supabase Auth callback and magic-link login cutover foundation.
- [x] First typed products API cutover.
- [x] Migration architecture documentation.

Collection, dashboard, and build/download routes now use Supabase Auth, Postgres, and private Storage. The Supabase foundation, Product Templates, Settings, Factory adapters, license activation/status, six-product sample loader, packaging readiness UX, package inspection, reusable asset loadouts, dashboard telemetry, release-bundle ZIP artifacts, release persistence/download routes, and HUD release panels are implemented. Migration `0007_product_releases` is applied remotely. Stripe checkout, billing portal, and webhook work is intentionally deferred.

## Remaining roadmap — batch execution order

### Batch 1 — Security and isolation verification

- [x] Add authenticated two-owner RLS tests for products, product builds, product events, and product releases; live execution remains credential-gated.
- [x] Add private Storage isolation tests for source files, build ZIPs, and release ZIPs covering upload, read, update, delete, and unauthorized access; live execution remains credential-gated.
- [ ] Add route-level ownership tests for release history, finalization, and downloads.
- [ ] Verify release Storage cleanup when database persistence fails.
- [ ] Apply any required policy fixes discovered by Batch 1 tests.

### Batch 2 — Release workflow hardening

- [ ] Test and polish Draft, Packaged, Released, and Release Failed states.
- [ ] Cover stale build state, missing embedded artifacts, duplicate finalization, Storage failure, and database failure in the UI and API.
- [ ] Verify idempotent release finalization and reproducible release downloads.
- [ ] Add release history refresh behavior after build, revert, and finalization.

### Batch 3 — Static quality and regression gates

- [x] Fix the remaining TypeScript errors in Factory save handling, Etsy listing save handling, and duplicate-route row typing.
- [x] Resolve ESLint errors and remove avoidable `any` usage in active tests and mocks.
- [x] Run Bun unit and integration suites in the supported environment; focused suites pass.
- [ ] Add login, logout, expired-session, and Auth callback regression tests.
- [ ] Run authenticated Playwright packaging, release finalization, and download tests.

### Batch 4 — Environment and deployment readiness

- [x] Update environment documentation and deployment configuration guidance in `.env.example` and `docs/deployment-readiness.md`.
- [ ] Remove obsolete development bypasses and secrets.
- [ ] Configure production Supabase redirect URLs and email templates.
- [ ] Select a persistent Next.js deployment host.
- [ ] Deploy a persistent review environment instead of relying on temporary sandbox proxy URLs.
- [ ] Verify production Storage, Auth, and database policy behavior after deployment.

### Deferred after core release workflow

- [ ] Migrate Stripe checkout, billing portal, and webhook routes after payment-provider integration testing.
- [ ] Add development-only test login for `test@example.com`, disabled in production.
- [ ] Do not add sales, conversion, or marketplace-performance tracking; Product Factory is a virtual stockroom and packaging tool.
