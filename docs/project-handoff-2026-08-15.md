# Product Factory v2 — Project Handoff

## Current state

Product Factory v2 is a Next.js 16 application using Supabase for authentication, Postgres, Storage, and row-level security. The product model is a virtual stockroom for digital products: store assets, configure product details, package them into ZIP bundles, generate Etsy-ready listing data, and publish drafts. It is not intended to track sales performance.

The dark game-HUD aesthetic is implemented across the main screens. The preview currently runs at:

- App: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/
- Login: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/login
- Collection: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/app/collection
- Settings: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/app/settings

This is a temporary preview, not permanent hosting. It may need to be restarted after the sandbox sleeps.

## Completed

The one-time monetization model is implemented. Free users are limited to 3 products and 100 MB of storage. Creator users receive 500 products and 5 GB of storage. Quotas are enforced server-side for product creation, uploads, builds, and releases.

Stripe one-time checkout and webhook fulfillment are implemented, with `billing_purchases` and `account_entitlements` tables. Stripe has not yet been tested with a real test-mode purchase because the Stripe environment variables are not present in the preview.

The packaging and release workflow is implemented: readiness checks, ZIP assembly, release snapshots, private Storage persistence, release history, download routes, duplicate-finalization protection, stale-build handling, missing-artifact handling, and upload-failure cleanup.

Etsy integration backend routes are implemented for OAuth, encrypted token storage, inventory synchronization, manual inventory-to-product matching, Etsy draft publishing, and paid-plan gating. The inventory panel now correctly shows **Connect Etsy** before authorization and only shows **Fetch inventory** after an Etsy connection exists.

Supabase magic-link SMTP is working through Brevo. Supabase URL configuration was corrected to use the live preview origin. Auth callback and middleware redirects were made proxy-aware so they no longer send users to localhost or `0.0.0.0:3000`.

The standalone preview packaging issue was fixed by copying `.next/static` and `public` into `.next/standalone` before starting the server. This prevents browser `NS_ERROR_CORRUPTED_CONTENT` and JavaScript MIME-type errors.

## Current blockers

The Etsy OAuth flow cannot start because the preview environment is missing:

- `ETSY_API_KEYSTRING`
- `ETSY_SHARED_SECRET`
- `ETSY_TOKEN_ENCRYPTION_KEY`

The Etsy developer app must allow this callback URL:

`https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/api/integrations/etsy/callback`

Stripe also needs these variables for a real test-mode payment:

- `STRIPE_SECRET_KEY`
- `STRIPE_CREATOR_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

The two-owner live Supabase RLS isolation test is present but skipped unless service-role credentials and two owner access tokens are supplied. Focused automated tests, typecheck, and production builds pass.

## Exact next steps when returning

1. Decide whether to configure Etsy now. If yes, provide/configure the Etsy developer keystring, shared secret, 32-byte token encryption key, and allowed shop ID if restricting the integration to one shop.
2. Register the callback URL above in the Etsy developer application.
3. Reopen Collection, click **Connect Etsy**, complete Etsy authorization, return to Product Factory, and click **Fetch inventory**.
4. Configure Stripe test-mode variables and perform one real Creator purchase. Verify the webhook grants the Creator entitlement and raises limits.
5. Supply the credentials needed for the two-owner RLS test and run it against the connected Supabase project.
6. Review the uncommitted changes. Only after explicit approval should the changes be committed.
7. Move from the temporary preview to permanent hosting and update Supabase Auth Site URL, redirect URLs, Etsy callback URL, and Stripe webhook URL to the permanent domain.

## Important operating rule

No final milestone commit has been created for the latest auth, proxy-origin, dashboard hardening, static-asset packaging, or Etsy connection-UX changes. The repository is intentionally left uncommitted pending review and explicit approval.
