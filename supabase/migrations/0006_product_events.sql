create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  event_type text not null check (event_type in ('package_created', 'asset_reused')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_owner_created_idx
  on public.product_events(owner_id, created_at desc);

create index if not exists product_events_owner_type_created_idx
  on public.product_events(owner_id, event_type, created_at desc);

alter table public.product_events enable row level security;

create policy "product_events_owner_select" on public.product_events
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "product_events_owner_insert" on public.product_events
  for insert to authenticated
  with check (auth.uid() = owner_id);

comment on table public.product_events is 'Owner-scoped product workflow telemetry; not marketplace performance analytics.';
