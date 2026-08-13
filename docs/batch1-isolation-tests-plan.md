# Plan: Batch 1 Isolation Verification

## Context

The core stockroom and release workflow now spans owner-scoped Postgres tables and private Supabase Storage. This batch adds confidence that the security boundary works across both systems before release hardening and deployment work.

## Repository constraints

Follow `CLAUDE.md`: work on the active v2 branch, preserve Supabase as the data and Storage layer, and do not expose service-role credentials to browser code. Do not commit this batch unless explicitly requested.

## Implementation

1. Add a focused authenticated integration suite with two owner clients created from environment-provided sessions.
2. Seed only disposable owner-scoped rows and objects needed for the matrix.
3. Assert owner A positive operations and owner B denied/empty operations for products, files, builds, events, and releases.
4. Assert private Storage isolation in both `product-files` and `product-builds`.
5. Add release-route ownership cases and a release persistence cleanup failure assertion using the existing route mock seam.
6. Ensure cleanup removes disposable rows and Storage objects without requiring elevated application permissions.

## Verification

- `git diff --check`
- `npm run typecheck`
- Focused isolation integration test
- Existing Supabase packaging integration test
- Report credential-gated tests separately from actual failures

## Risk

High. The tests touch authentication, RLS, private Storage, and release concurrency. A test failure must not be normalized as a passing result when the test environment is not configured.
