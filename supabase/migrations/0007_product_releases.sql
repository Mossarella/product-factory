create table if not exists public.product_releases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  build_id uuid not null references public.product_builds(id) on delete restrict,
  version integer not null check (version > 0),
  bundle_storage_path text not null,
  bundle_filename text not null,
  bundle_size bigint not null check (bundle_size >= 0),
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  listing_snapshot jsonb not null default '{}'::jsonb,
  release_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_releases_owner_product_build_key unique (owner_id, product_id, build_id),
  constraint product_releases_owner_product_version_key unique (owner_id, product_id, version)
);

create index if not exists product_releases_owner_created_idx
  on public.product_releases(owner_id, created_at desc);

create index if not exists product_releases_owner_product_created_idx
  on public.product_releases(owner_id, product_id, created_at desc);

alter table public.product_releases enable row level security;

create policy "product_releases_owner_select" on public.product_releases
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "product_releases_owner_insert" on public.product_releases
  for insert to authenticated
  with check (auth.uid() = owner_id);

comment on table public.product_releases is 'Immutable owner-scoped release snapshots for ready-to-sell product bundles.';
comment on column public.product_releases.listing_snapshot is 'Frozen Etsy listing metadata captured at release time.';
comment on column public.product_releases.release_summary is 'Frozen product, validation, and artifact summary captured at release time.';
