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
- [ ] Add login, logout, expired-session, and callback regression tests.

## P1 — Supabase data access

- [x] Add generated live-schema types and the first typed Supabase products API access.
- [x] Replace Prisma reads and writes in Dashboard.
- [x] Replace Prisma reads and writes in Collection, including product config, file uploads/downloads, slot assets, Veado assets, rename, duplicate, and delete.
- [ ] Port the idempotent six-product sample loader.
- [ ] Replace Product Templates, Settings, and Factory data access.
- [ ] Verify that every query remains owner-scoped through both repository filters and RLS.

## P1 — Supabase Storage and packaging

- [ ] Replace the S3/object-storage helper with private Supabase Storage operations.
- [x] Define user-rooted object paths such as `<auth.uid()>/<product-id>/...`.
- [x] Migrate product source-file uploads, deletes, slot assets, Veado assets, and downloads.
- [x] Migrate generated ZIP builds, manifests, changelogs, version downloads, and reverts.
- [x] Implement private download authorization through authenticated Supabase Storage requests.
- [ ] Verify ZIP creation and download behavior end to end against the live project.

## P2 — Remove unstable infrastructure

- [ ] Remove Auth.js and Nodemailer after Supabase Auth tests pass.
- [ ] Remove Prisma runtime usage and local PostgreSQL assumptions after Supabase repository tests pass.
- [ ] Remove the S3/MinIO helper and Docker storage dependency after Storage tests pass.
- [ ] Update environment documentation and deployment configuration.
- [ ] Remove obsolete development bypasses and secrets.

## P2 — Verification and deployment

- [ ] Run TypeScript, ESLint, unit, integration, and Playwright tests.
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

Collection, dashboard, and build/download routes now use Supabase Auth, Postgres, and private Storage. Remaining work is to migrate adjacent Product Templates, Settings, Factory, and other legacy routes, then remove Auth.js, Nodemailer, Prisma, and the S3/MinIO helper after the full test suite passes.
