# Product Factory deployment readiness

## Runtime boundary

Product Factory is a Next.js App Router application backed by Supabase Auth, Postgres, and private Storage. Production deployments must not depend on the removed Prisma, Auth.js, Nodemailer, S3, MinIO, or local PostgreSQL runtime. The only browser-exposed Supabase values are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

The Supabase service-role key is server-only and is required only for administrative maintenance or disposable live-test cleanup. It must never be prefixed with `NEXT_PUBLIC_`, committed to the repository, or returned from an API route.

## Required application configuration

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Supabase publishable key |
| `NEXT_PUBLIC_APP_URL` | Browser/server | Canonical application origin used for redirects and links |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Optional administrative/test cleanup operations; never expose publicly |
| `STRIPE_*` | Server-only, deferred | Reserved for a future billing migration |

## Supabase Auth configuration

Set the Supabase Auth **Site URL** to the canonical production origin. Add the production origin and the local development origin to the Auth redirect allow-list. The magic-link callback must resolve to `/auth/callback`, and the application must preserve the `next` parameter only after validating it as an internal path.

Production email delivery should be configured through Supabase Auth SMTP. The removed application-level Nodemailer variables are intentionally absent from `.env.example`.

## Storage and database checks

The `product-files` and `product-builds` buckets must remain private. Release bundles are stored in `product-builds` under owner-scoped paths. Before deployment, verify that authenticated owners can access only their own rows and objects, while anonymous users and other owners receive no data or download access.

Apply all migrations in order through the connected Supabase project. Migration `0007_product_releases` creates immutable release records with owner-scoped RLS. The live two-owner isolation suite should be run before production promotion with two disposable authenticated identities and a separate cleanup service-role key.

## Persistent hosting decision

The application requires a persistent Next.js host with support for server-side environment variables, App Router route handlers, private outbound network access to Supabase, and a stable HTTPS origin. Temporary sandbox proxy URLs are suitable only for short-lived previews and must not be used as the production Auth Site URL.

The deployment acceptance gate is:

1. Build and start the application with production environment variables.
2. Complete magic-link login and callback on the stable HTTPS origin.
3. Load the sample collection and create or package a disposable product.
4. Finalize a release, inspect release history, and download the private bundle.
5. Run the two-owner RLS and Storage isolation tests.
6. Confirm that logs contain no service-role key, access token, or private Storage URL.

## Deferred scope

Stripe checkout, the billing portal, and webhook migration remain intentionally deferred. Sales, conversion, and marketplace-performance tracking are also outside the current Product Factory scope.

The development-only test login must remain disabled in production. If it is added later, it must be guarded by an explicit development environment check and must not bypass Supabase Auth in a production build.
