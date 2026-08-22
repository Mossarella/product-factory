# Product Factory v2 Handoff

This repository contains Product Factory v2, a Next.js 16 App Router application backed by Supabase Auth, Postgres, Storage, and row-level security. The core workflow is a virtual stockroom for digital products: store assets, configure product details, package products into ZIP files, generate Etsy-ready listing data, and publish Etsy drafts. It is not a sales-performance analytics product.

## Current implementation

The application includes the dark game-HUD interface, Supabase magic-link authentication, product and asset management, readiness checks, package inspection, release snapshots, private release-bundle storage, release history and downloads, dashboard metrics, reusable asset loadouts, Etsy OAuth foundations, Etsy inventory synchronization and manual matching, Etsy draft publishing, and one-time Creator monetization.

Entitlements are enforced server-side. The Free plan permits 3 products and 100 MB of storage. The Creator plan is a one-time purchase that permits 500 products and 5 GB of storage. Stripe checkout and webhook fulfillment are implemented as one-time payment flows; this is not a subscription system.

## Required environment variables

Copy `.env.example` to `.env.local` for local development. Never commit `.env.local`, service-role keys, Stripe secrets, Etsy secrets, or encryption keys.

Supabase requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-side `SUPABASE_SERVICE_ROLE_KEY` for admin operations and OAuth-state persistence. Brevo SMTP is configured in the Supabase Auth dashboard rather than in this repository.

For Etsy, configure `ETSY_API_KEYSTRING`, `ETSY_SHARED_SECRET`, and `ETSY_TOKEN_ENCRYPTION_KEY`. Optionally set `ETSY_ALLOWED_SHOP_ID` to restrict the integration to one shop. Set `ETSY_REDIRECT_URI` to the public deployment URL followed by `/api/integrations/etsy/callback`. The Etsy developer application must contain the exact same callback URL.

For Stripe one-time Creator purchases, configure `STRIPE_SECRET_KEY`, `STRIPE_CREATOR_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`. The Stripe webhook must reach `/api/stripe/webhook` and include the events documented in `.env.example` and `docs/one-time-upgrade-model.md`.

## Deployment and preview notes

The current public preview is temporary and may stop after sandbox sleep. A standalone Next.js build must include both `.next/static` copied to `.next/standalone/.next/static` and `public` copied to `.next/standalone/public`; otherwise browser JavaScript requests return plain-text 404s and Chromium reports corrupted content or MIME-type errors.

For permanent hosting, update the Supabase Auth Site URL and additional redirect URLs, the Etsy callback URL, the Stripe webhook URL, and the public application URL together. The auth callback and middleware use forwarded host/protocol headers so deployments behind a reverse proxy remain on the public origin.

## Verification commands

Run the following before deployment:

```bash
pnpm typecheck
pnpm build
bun test
```

The live two-owner Etsy RLS test requires a real service-role key and two owner access tokens; without those credentials it is intentionally skipped. The focused unit and integration tests cover entitlement limits, Stripe fulfillment behavior, Etsy inventory and matching, auth callback origin handling, release routes, and dashboard statistics.

## Known pending verification

A real Stripe test-mode purchase still needs to be performed after Stripe environment variables are configured. The Etsy flow still needs a real Etsy developer application and shop authorization. After those are configured, verify **Connect Etsy → Etsy authorization → Fetch inventory → manual match → create Etsy draft**.

Review the migration files in `supabase/migrations/` and apply them to the intended Supabase project in order. Confirm that the connected Supabase project has the required RLS policies and private Storage buckets before handing the service to users.

## Git and release policy

This handoff commit includes the latest implementation and documentation requested by the project owner. Future feature work should be reviewed in the live preview before committing. Do not commit secrets or local preview artifacts.

## Verification caveat from handoff

The final broad `bun test` run in the sandbox reported 141 passing, 14 skipped, 158 failing, and 18 errors. The failures are environment-dependent route and storage tests that invoke Next.js request APIs such as `cookies()` outside a request scope or require external Supabase/MinIO fixtures; they are not the focused changeset checks. Before deployment, run the focused suites and then rerun the full suite in the project’s configured integration-test environment. The focused auth-origin, Etsy inventory, dashboard statistics, entitlement, Stripe, release, and build/typecheck checks passed during this handoff.
