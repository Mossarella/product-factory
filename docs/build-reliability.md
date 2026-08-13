# Spec: Build Reliability and Recovery

## Overview
Harden Supabase-backed packaging so a build cannot leave an orphaned ZIP when the `product_builds` insert or product version update fails. Apply the same cleanup contract to build revert, preserve owner isolation, and add regression coverage for each failure boundary.

## Follows the pattern of
- `app/api/products/[name]/build/route.ts` — existing packaging sequence and owner-scoped reads/writes.
- `app/api/products/[name]/build/[version]/revert/route.ts` — matching upload/DB/update sequence for revert builds.
- `tests/integration/products-build-supabase.test.ts` — existing route-level Supabase mocks and happy-path assertions.

## Requirements

### Functional
- If ZIP upload fails, return the existing 500 response and do not attempt database writes.
- If `product_builds` insert fails after upload, remove the newly uploaded object and return a clear 500 response.
- If `products.build_version` update fails after upload and insert, remove the newly uploaded object and remove the inserted build row when possible.
- Cleanup must be best-effort and must not mask the original failure.
- Apply equivalent cleanup to revert builds.
- Keep all cleanup operations scoped to the authenticated owner and exact product/build identifiers.
- Keep successful build and revert response contracts unchanged.

### Non-functional
- Preserve the dark, image-heavy game-inventory HUD UI; this slice is backend reliability only.
- No schema changes are required.
- Do not introduce service-role access or bypass RLS.

## Architecture check
- Layer: Next.js API route handlers and integration tests.
- Imports allowed: existing Supabase server client, storage constants/path helper, NextResponse, and route-local helpers.
- Imports forbidden: Prisma, Auth.js, Nodemailer, S3/MinIO helpers, or service-role credentials.

## Test tier this change must climb
- Unit: not required; rollback behavior belongs to route integration seams.
- Integration: extend `tests/integration/products-build-supabase.test.ts` for upload, insert, and update failure cleanup.
- E2E: existing packaging E2E remains the live verification path; no new browser flow is required for this backend-only slice.

## Implementation

### Files to modify
- `app/api/products/[name]/build/route.ts`: add best-effort object/build-row rollback around post-upload persistence failures.
- `app/api/products/[name]/build/[version]/revert/route.ts`: apply the same rollback contract to revert packaging.
- `tests/integration/products-build-supabase.test.ts`: assert cleanup calls and preservation of original errors for failure paths.

## Out of Scope
- Dashboard metrics and event schema.
- Legacy dependency removal.
- Stripe/Billing.
- Changes to the package inspection UI.

## Verification
1. Run the repository typecheck and integration test commands from `CLAUDE.md`/package scripts.
2. Inspect the final diff for owner-scoped cleanup and unchanged success responses.
3. Run the packaging E2E only if the live Supabase environment is available; otherwise report it as pending.
