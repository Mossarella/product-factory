# Etsy Migrations Deployment Checklist

This checklist deploys `0008_etsy_integration.sql` and `0009_etsy_webhooks.sql` in dependency order. The migrations are intentionally unapplied by this document. Review them in the live preview before executing the guarded deployment script.

## 1. Scope and dependency order

The deployment adds the single-shop Etsy connection, encrypted OAuth secret storage, OAuth state storage, inventory cache, manual product matches, release publication records, and webhook delivery logging.

| Order | Migration | Depends on |
|---|---|---|
| 1 | `0008_etsy_integration.sql` | Existing `products` and `product_releases` tables, including their `owner_id` columns |
| 2 | `0009_etsy_webhooks.sql` | `etsy_connections` from migration 0008 |

Do not apply migration 0009 independently. It has a composite foreign key to `etsy_connections(owner_id, id)` created by migration 0008.

## 2. Preflight checks

Before applying anything, confirm that the target Supabase project is the intended **Product Factory** project and that a recent database backup or restore point exists. Use a disposable project first whenever possible.

Confirm that the working tree contains the reviewed migration files and that the migration order is intact:

```bash
ls -l supabase/migrations/0008_etsy_integration.sql \
      supabase/migrations/0009_etsy_webhooks.sql

git diff --check
```

Confirm that the Supabase CLI is installed and authenticated. The deployment wrapper requires a project reference and an explicit `--apply` flag:

```bash
scripts/deploy-etsy-migrations.sh --project-ref <supabase-project-ref>
```

The command above is a dry run and does not change Supabase. The wrapper requires the exact confirmation text `APPLY-ETSY-MIGRATIONS` before executing `supabase db push`.

Before production application, inspect the SQL for the following properties:

| Check | Expected result |
|---|---|
| `etsy_connection_secrets` | RLS enabled; no authenticated/anonymous policy; service-role-only access |
| `etsy_oauth_states` | RLS enabled; no authenticated/anonymous policy; service-role-only access |
| `etsy_webhook_events` | RLS enabled; authenticated owner select only; service-role writes |
| Owner constraints | Composite owner-plus-ID foreign keys present |
| Idempotency | Unique `(owner_id, delivery_id)` on webhook events |
| Status constraints | Webhook status limited to `received`, `processed`, `ignored`, and `failed` |

## 3. Apply in a disposable Supabase environment

Use the guarded wrapper first against a disposable project:

```bash
scripts/deploy-etsy-migrations.sh \
  --project-ref <disposable-project-ref> \
  --apply
```

The wrapper links the local directory, prints the migration list, pushes pending migrations, and prints the migration list again. Stop immediately if `0008` or `0009` fails.

Do not put `SUPABASE_SERVICE_ROLE_KEY`, Etsy access tokens, Etsy refresh tokens, or encryption keys in shell arguments. The deployment wrapper uses the Supabase CLI migration channel and does not require Etsy secrets to apply the schema.

## 4. Post-deployment SQL verification

Run the following read-only SQL in the Supabase SQL Editor or through an administrative database session. It checks that the tables, RLS flags, policies, indexes, and key constraints exist.

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'etsy_connections',
    'etsy_connection_secrets',
    'etsy_oauth_states',
    'etsy_inventory_syncs',
    'etsy_inventory_items',
    'etsy_product_matches',
    'etsy_release_publications',
    'etsy_webhook_events'
  )
order by c.relname;
```

Every returned table must have `rls_enabled = true`.

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename like 'etsy_%'
order by tablename, policyname;
```

Confirm that the secret and OAuth-state tables have no `authenticated` or `anon` policies, while the webhook event table has only owner-scoped authenticated reads.

```sql
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'etsy_webhook_events_owner_delivery_key',
  'etsy_webhook_events_owner_connection_fk',
  'etsy_connections_owner_id_id_key',
  'product_releases_owner_id_id_key'
)
order by table_name, conname;
```

Confirm that the webhook idempotency constraint and owner/connection foreign key are present.

## 5. Configure server secrets after schema verification

Only after the schema passes verification should the deployment environment receive the server-only Etsy configuration:

```text
ETSY_API_KEYSTRING
ETSY_SHARED_SECRET
ETSY_REDIRECT_URI
ETSY_ALLOWED_SHOP_ID
ETSY_TOKEN_ENCRYPTION_KEY
ETSY_SCOPES
ETSY_DEFAULT_TAXONOMY_ID
ETSY_WEBHOOK_SIGNING_SECRET
```

`ETSY_TOKEN_ENCRYPTION_KEY` must decode to 32 bytes. `ETSY_ALLOWED_SHOP_ID` must identify your shop. `ETSY_REDIRECT_URI` must exactly match the registered Etsy OAuth callback URL. `ETSY_WEBHOOK_SIGNING_SECRET` must match the Etsy webhook endpoint configuration.

Never expose these values through `NEXT_PUBLIC_*` variables, browser code, logs, client error payloads, or Supabase rows readable by `authenticated`.

## 6. Live acceptance tests

Run the existing live security suite with two distinct authenticated owners:

```bash
bun test tests/integration/etsy-rls-isolation.test.ts
```

Run the live webhook signature and idempotency suite after deploying the HTTPS receiver and registering it with Etsy:

```bash
bun test tests/integration/etsy-webhook-live.test.ts
```

The following checks must pass before production use:

| Acceptance gate | Required result |
|---|---|
| Owner isolation | Owner B cannot read Owner A’s Etsy metadata, inventory, matches, publications, or webhook events |
| Token secrecy | Authenticated clients cannot read `etsy_connection_secrets` or `etsy_oauth_states` |
| OAuth | Connect/callback completes for your shop and rejects a different shop ID |
| Draft publishing | A Product Factory release creates one Etsy draft and uploads one ZIP |
| Inventory sync | Fetch Inventory retrieves and caches your shop listings |
| Manual matching | A cached listing can be matched and unmatched without cross-owner access |
| Webhook signature | Invalid signature returns `401` |
| Webhook idempotency | Repeated delivery creates one event row and does not refresh twice |
| Failure retry | Processing failures return retryable status and record `failed` |

## 7. Production rollout

After the disposable environment passes, repeat the migration application against the production project with a verified project reference:

```bash
scripts/deploy-etsy-migrations.sh \
  --project-ref <production-project-ref> \
  --apply
```

Run the SQL verification queries again, deploy the application, configure the server-only Etsy variables, register the callback and webhook URLs, and execute the live acceptance tests. Keep the Etsy draft flow enabled before enabling any future live-publish action.

## 8. Rollback guidance

Do not casually roll back these migrations after data has been created. The tables are referenced by application routes, and dropping them would remove connection, inventory, match, publication, and webhook history.

If deployment fails before either migration commits, inspect the Supabase migration history and rerun the corrected migration after fixing the SQL. If migration 0008 commits but 0009 fails, leave 0008 in place, correct 0009, and apply only the corrected pending migration.

If a post-deployment application bug is found, disable Etsy OAuth initiation and webhook processing at the application layer first. Preserve the tables and data while deploying the route fix. A destructive rollback should be a separately reviewed migration with a database backup and explicit approval.

## 9. Completion record

Record the following after execution:

```text
Target project:
Environment: disposable / staging / production
Migration 0008 applied at:
Migration 0009 applied at:
Migration list verified by:
RLS verification completed by:
Two-owner isolation test result:
Live OAuth result:
Live draft-listing result:
Live inventory-sync result:
Live webhook result:
Rollback plan reviewed by:
```
