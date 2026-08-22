-- Product Factory: single-shop Etsy integration
--
-- This migration stores owner-scoped Etsy connection metadata, short-lived OAuth
-- state, an explicit inventory-sync cache, manual product matches, and idempotent
-- release publication records. OAuth token ciphertext is isolated in a table
-- with no authenticated/anon policies; server-side service-role code is the only
-- intended reader or writer of token material.

-- PostgreSQL requires an exact unique key for composite owner/id foreign keys.
-- These redundant keys let the Etsy tables enforce that referenced records share
-- the same owner, not merely the same UUID.
alter table public.products
  add constraint products_owner_id_id_key unique (owner_id, id);
alter table public.product_releases
  add constraint product_releases_owner_id_id_key unique (owner_id, id);

create table if not exists public.etsy_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  etsy_user_id bigint not null,
  shop_id bigint not null unique,
  shop_name text not null,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etsy_connections_owner_id_id_key unique (owner_id, id)
);

create index if not exists etsy_connections_owner_status_idx
  on public.etsy_connections(owner_id, status);

alter table public.etsy_connections enable row level security;

create policy "etsy_connections_owner_select"
  on public.etsy_connections
  for select to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_connections is
  'Owner-scoped connection metadata for the single authorized Etsy shop.';
comment on column public.etsy_connections.shop_id is
  'Globally unique Etsy shop ID; the server may additionally enforce ETSY_ALLOWED_SHOP_ID.';
comment on column public.etsy_connections.last_error is
  'Safe diagnostic text only; never store OAuth credentials or authorization codes.';

create table if not exists public.etsy_connection_secrets (
  connection_id uuid primary key references public.etsy_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.etsy_connection_secrets enable row level security;

-- Do not create authenticated or anon policies on this table. Supabase's
-- service_role bypasses RLS and is used only by protected server routes.
revoke all on public.etsy_connection_secrets from anon, authenticated;
grant all on public.etsy_connection_secrets to service_role;

comment on table public.etsy_connection_secrets is
  'Encrypted Etsy OAuth tokens; service-role server code only.';

create table if not exists public.etsy_oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  code_verifier_ciphertext text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists etsy_oauth_states_owner_expires_idx
  on public.etsy_oauth_states(owner_id, expires_at desc);
create index if not exists etsy_oauth_states_active_idx
  on public.etsy_oauth_states(state_hash, expires_at)
  where consumed_at is null;

alter table public.etsy_oauth_states enable row level security;
revoke all on public.etsy_oauth_states from anon, authenticated;
grant all on public.etsy_oauth_states to service_role;

comment on table public.etsy_oauth_states is
  'Short-lived, one-time Etsy OAuth state and encrypted PKCE verifier; service-role only.';

create table if not exists public.etsy_inventory_syncs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.etsy_connections(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_seen integer not null default 0 check (items_seen >= 0),
  items_upserted integer not null default 0 check (items_upserted >= 0),
  error_message text,
  constraint etsy_inventory_syncs_owner_connection_fk
    foreign key (owner_id, connection_id)
    references public.etsy_connections(owner_id, id)
    on delete cascade
);

create index if not exists etsy_inventory_syncs_owner_started_idx
  on public.etsy_inventory_syncs(owner_id, started_at desc);
create index if not exists etsy_inventory_syncs_connection_started_idx
  on public.etsy_inventory_syncs(connection_id, started_at desc);

alter table public.etsy_inventory_syncs enable row level security;

create policy "etsy_inventory_syncs_owner_select"
  on public.etsy_inventory_syncs
  for select to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_inventory_syncs is
  'Owner-visible audit of explicit Etsy inventory fetch operations.';

create table if not exists public.etsy_inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.etsy_connections(id) on delete cascade,
  etsy_listing_id bigint not null,
  title text not null,
  state text not null,
  sku text,
  price numeric(12, 2),
  quantity integer check (quantity is null or quantity >= 0),
  currency text,
  listing_payload jsonb not null default '{}'::jsonb,
  inventory_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etsy_inventory_items_owner_id_id_key unique (owner_id, id),
  constraint etsy_inventory_items_connection_listing_key
    unique (connection_id, etsy_listing_id),
  constraint etsy_inventory_items_owner_connection_fk
    foreign key (owner_id, connection_id)
    references public.etsy_connections(owner_id, id)
    on delete cascade
);

create index if not exists etsy_inventory_items_owner_synced_idx
  on public.etsy_inventory_items(owner_id, last_synced_at desc);
create index if not exists etsy_inventory_items_owner_sku_idx
  on public.etsy_inventory_items(owner_id, sku)
  where sku is not null;
create index if not exists etsy_inventory_items_owner_state_idx
  on public.etsy_inventory_items(owner_id, state);

alter table public.etsy_inventory_items enable row level security;

create policy "etsy_inventory_items_owner_select"
  on public.etsy_inventory_items
  for select to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_inventory_items is
  'Owner-scoped cached Etsy listings and inventory for manual matching/import.';
comment on column public.etsy_inventory_items.listing_payload is
  'Selected Etsy listing metadata, not marketplace performance analytics.';
comment on column public.etsy_inventory_items.inventory_payload is
  'Normalized Etsy inventory response retained for matching and troubleshooting.';

create table if not exists public.etsy_product_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  inventory_item_id uuid not null references public.etsy_inventory_items(id) on delete cascade,
  match_method text not null default 'manual'
    check (match_method in ('manual', 'sku')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etsy_product_matches_product_unique unique (product_id),
  constraint etsy_product_matches_inventory_unique unique (inventory_item_id),
  constraint etsy_product_matches_owner_product_fk
    foreign key (owner_id, product_id)
    references public.products(owner_id, id)
    on delete cascade,
  constraint etsy_product_matches_owner_inventory_fk
    foreign key (owner_id, inventory_item_id)
    references public.etsy_inventory_items(owner_id, id)
    on delete cascade
);

create index if not exists etsy_product_matches_owner_idx
  on public.etsy_product_matches(owner_id, created_at desc);

alter table public.etsy_product_matches enable row level security;

create policy "etsy_product_matches_owner_select"
  on public.etsy_product_matches
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "etsy_product_matches_owner_insert"
  on public.etsy_product_matches
  for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "etsy_product_matches_owner_update"
  on public.etsy_product_matches
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "etsy_product_matches_owner_delete"
  on public.etsy_product_matches
  for delete to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_product_matches is
  'Owner-scoped manual associations between Etsy inventory and Product Factory products.';

create table if not exists public.etsy_release_publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.etsy_connections(id) on delete cascade,
  release_id uuid not null references public.product_releases(id) on delete cascade,
  etsy_listing_id bigint,
  status text not null default 'creating'
    check (status in ('creating', 'draft', 'published', 'failed')),
  request_snapshot jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etsy_release_publications_release_connection_key
    unique (release_id, connection_id),
  constraint etsy_release_publications_owner_connection_fk
    foreign key (owner_id, connection_id)
    references public.etsy_connections(owner_id, id)
    on delete cascade,
  constraint etsy_release_publications_owner_release_fk
    foreign key (owner_id, release_id)
    references public.product_releases(owner_id, id)
    on delete cascade
);

create index if not exists etsy_release_publications_owner_created_idx
  on public.etsy_release_publications(owner_id, created_at desc);
create index if not exists etsy_release_publications_release_idx
  on public.etsy_release_publications(release_id, created_at desc);

alter table public.etsy_release_publications enable row level security;

create policy "etsy_release_publications_owner_select"
  on public.etsy_release_publications
  for select to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_release_publications is
  'Owner-visible idempotency and status records for Etsy draft/live publication attempts.';
comment on column public.etsy_release_publications.request_snapshot is
  'Frozen, non-secret Etsy request data derived from an immutable Product Factory release.';
comment on column public.etsy_release_publications.response_metadata is
  'Safe Etsy response metadata; never store access or refresh tokens.';

create or replace function public.set_etsy_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists etsy_connections_updated_at on public.etsy_connections;
create trigger etsy_connections_updated_at
before update on public.etsy_connections
for each row execute function public.set_etsy_updated_at();

drop trigger if exists etsy_connection_secrets_updated_at on public.etsy_connection_secrets;
create trigger etsy_connection_secrets_updated_at
before update on public.etsy_connection_secrets
for each row execute function public.set_etsy_updated_at();

drop trigger if exists etsy_inventory_items_updated_at on public.etsy_inventory_items;
create trigger etsy_inventory_items_updated_at
before update on public.etsy_inventory_items
for each row execute function public.set_etsy_updated_at();

drop trigger if exists etsy_product_matches_updated_at on public.etsy_product_matches;
create trigger etsy_product_matches_updated_at
before update on public.etsy_product_matches
for each row execute function public.set_etsy_updated_at();

drop trigger if exists etsy_release_publications_updated_at on public.etsy_release_publications;
create trigger etsy_release_publications_updated_at
before update on public.etsy_release_publications
for each row execute function public.set_etsy_updated_at();
