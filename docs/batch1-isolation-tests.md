# Batch 1: RLS and Storage Isolation Tests

## Overview

Batch 1 verifies that Product Factory’s Supabase data and private Storage remain isolated by authenticated owner. The test surface includes products, source files, builds, product events, immutable releases, route authorization, and private ZIP artifacts.

## Existing patterns

The tests follow the repository’s Supabase integration style in `tests/integration/products-build-supabase.test.ts`, use the table and policy names from `supabase/migrations/0001_stockroom_foundation.sql`, `0006_product_events.sql`, and `0007_product_releases.sql`, and exercise the private `product-files` and `product-builds` buckets.

## Requirements

The Batch 1 suite must prove that owner A can create and read owner A’s rows and Storage objects, owner B cannot read or mutate them, owner B cannot finalize or download owner A’s release, and owner-scoped route queries do not leak rows. It must also verify that release Storage cleanup is attempted when the release database insert fails.

Tests must not use a service-role key in browser-facing code. They may use a dedicated server-side test credential or the connected Supabase test environment only when it is supplied through environment variables. The suite must skip clearly when two authenticated test identities and the required Supabase URL/key are not configured.

## Test matrix

| Surface | Owner A positive case | Owner B negative case |
|---|---|---|
| `products` | Insert/select/update own product | Cannot select, update, or delete owner A product |
| `product_files` | Insert/select own file row | Cannot read or mutate owner A file row |
| `product_builds` | Insert/select own build row | Cannot read or mutate owner A build row |
| `product_events` | Insert/select own telemetry | Cannot read owner A telemetry |
| `product_releases` | Insert/select own release | Cannot read or modify owner A release |
| `product-files` bucket | Upload/read own object | Cannot read, update, or delete owner A object |
| `product-builds` bucket | Upload/read own ZIP | Cannot read, update, or delete owner A ZIP |
| release routes | Own history/finalization/download | Foreign product/release returns not-found/forbidden |

## Test tiers

- Integration: required for authenticated Supabase RLS and Storage behavior.
- Route integration: required for release history, finalization, and download ownership.
- E2E: deferred to Batch 3 once stable test credentials are configured.

## Out of scope

This batch does not alter billing, marketplace sync, dashboard analytics, or production deployment. It does not bypass RLS with service-role credentials in application code.

## Verification

Run `git diff --check`, the repository typecheck, the focused isolation integration test, and the existing packaging integration test. If credentials are absent, report the exact skip reason instead of treating an unconfigured environment as a pass.
