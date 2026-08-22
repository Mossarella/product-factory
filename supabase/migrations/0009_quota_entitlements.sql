-- Product Factory: bounded entitlements and owner-scoped quota accounting

alter table public.product_files
  add column if not exists file_size bigint not null default 0
    check (file_size >= 0);

alter table public.fixed_asset_files
  add column if not exists file_size bigint not null default 0
    check (file_size >= 0);

create table if not exists public.account_entitlements (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free'
    check (tier in ('free', 'creator', 'studio', 'agency')),
  provider_customer_id text,
  provider_order_id text unique,
  purchased_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;
grant all on public.account_entitlements to service_role;

create table if not exists public.billing_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  provider_order_id text not null unique,
  tier text not null check (tier in ('creator', 'studio', 'agency')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'refunded', 'chargeback')),
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_purchases_owner_created_idx
  on public.billing_purchases(owner_id, created_at desc);

alter table public.billing_purchases enable row level security;
revoke all on public.billing_purchases from anon, authenticated;
grant all on public.billing_purchases to service_role;

create or replace function public.set_quota_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists account_entitlements_updated_at on public.account_entitlements;
create trigger account_entitlements_updated_at
before update on public.account_entitlements
for each row execute function public.set_quota_updated_at();

drop trigger if exists billing_purchases_updated_at on public.billing_purchases;
create trigger billing_purchases_updated_at
before update on public.billing_purchases
for each row execute function public.set_quota_updated_at();

create or replace function public.get_my_entitlement()
returns table (
  tier text,
  product_limit integer,
  storage_limit_bytes bigint,
  max_file_bytes bigint,
  etsy_enabled boolean,
  release_retention integer,
  product_count bigint,
  storage_used_bytes bigint
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  with identity as (
    select
      auth.uid() as owner_id,
      coalesce(e.tier, case when p.plan = 'pro' then 'creator' else 'free' end) as resolved_tier
    from public.profiles p
    left join public.account_entitlements e on e.owner_id = p.id
    where p.id = auth.uid()
  ),
  limits as (
    select
      i.resolved_tier,
      case i.resolved_tier
        when 'creator' then 500
        when 'studio' then 2000
        when 'agency' then 10000
        else 3
      end::integer as product_limit,
      case i.resolved_tier
        when 'creator' then 5368709120::bigint
        when 'studio' then 26843545600::bigint
        when 'agency' then 107374182400::bigint
        else 104857600::bigint
      end as storage_limit_bytes,
      case i.resolved_tier
        when 'creator' then 104857600::bigint
        when 'studio' then 262144000::bigint
        when 'agency' then 1073741824::bigint
        else 10485760::bigint
      end as max_file_bytes,
      (i.resolved_tier <> 'free') as etsy_enabled,
      case when i.resolved_tier = 'free' then 1 else 3 end::integer as release_retention,
      i.owner_id
    from identity i
  ),
  usage as (
    select
      l.owner_id,
      (select count(*) from public.products p where p.owner_id = l.owner_id) as product_count,
      (
        coalesce((select sum(file_size) from public.product_files f where f.owner_id = l.owner_id), 0) +
        coalesce((select sum(file_size) from public.fixed_asset_files f where f.owner_id = l.owner_id), 0) +
        coalesce((select sum(file_size) from public.product_builds b where b.owner_id = l.owner_id), 0) +
        coalesce((select sum(bundle_size) from public.product_releases r where r.owner_id = l.owner_id), 0)
      )::bigint as storage_used_bytes
    from limits l
  )
  select
    l.resolved_tier,
    l.product_limit,
    l.storage_limit_bytes,
    l.max_file_bytes,
    l.etsy_enabled,
    l.release_retention,
    u.product_count,
    u.storage_used_bytes
  from limits l
  join usage u on u.owner_id = l.owner_id;
$$;

grant execute on function public.get_my_entitlement() to authenticated;

comment on table public.account_entitlements is
  'Server-managed bounded lifetime capacity tier for one Product Factory owner.';
comment on table public.billing_purchases is
  'Idempotent one-time purchase ledger; service-role payment handlers only.';
comment on column public.account_entitlements.tier is
  'free, creator, studio, or agency; all tiers have finite product and byte limits.';
