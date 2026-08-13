create table if not exists public.asset_loadouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  asset_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists asset_loadouts_owner_id_idx on public.asset_loadouts(owner_id);

alter table public.asset_loadouts enable row level security;

create policy "asset_loadouts_owner_select" on public.asset_loadouts
  for select to authenticated using (auth.uid() = owner_id);
create policy "asset_loadouts_owner_insert" on public.asset_loadouts
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "asset_loadouts_owner_update" on public.asset_loadouts
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "asset_loadouts_owner_delete" on public.asset_loadouts
  for delete to authenticated using (auth.uid() = owner_id);

create or replace function public.set_asset_loadout_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger asset_loadouts_updated_at
before update on public.asset_loadouts
for each row execute function public.set_asset_loadout_updated_at();
