# Plan: Build Reliability and Recovery

## Context
The migrated packaging route uploads a ZIP before inserting its build record and advancing the product version. A later database failure currently leaves an orphaned object. Revert packaging has the same risk. This slice adds best-effort rollback without changing the public success contract or weakening RLS.

## Repository constraints
- Work remains on the current migration branch; do not touch legacy branches.
- Supabase Auth, Postgres, and private Storage remain the only active foundation for this slice.
- All repository operations stay owner-scoped and no service-role secret is introduced.
- Do not commit the new reliability feature until explicitly requested.

## Blueprint files
- `app/api/products/[name]/build/route.ts` — current packaging sequence.
- `app/api/products/[name]/build/[version]/revert/route.ts` — current revert sequence.
- `tests/integration/products-build-supabase.test.ts` — existing Supabase route mock and assertions.

## Implementation

### Route reliability
Add a small route-local best-effort cleanup helper or equivalent explicit cleanup block. After a successful ZIP upload, if build-row insertion fails, remove the exact ZIP object. If product-version update fails, remove the exact ZIP object and delete the inserted build row using the authenticated owner, product ID, and version. Preserve the original database error in the response; cleanup errors may be logged but must not replace it. Mirror the behavior in the revert route.

### Regression tests
Extend the existing integration test harness to simulate each failure boundary. Assert that upload failure performs no cleanup or DB writes, build-row insertion failure removes the ZIP, and version-update failure removes the ZIP and build row. Retain the current happy-path and unauthorized assertions.

## Verification
Run `git diff --check`, the project typecheck, the integration test command defined by package scripts, and inspect all changed route/test files. Run the existing Playwright packaging test if the live environment is available. Do not commit this feature batch.
