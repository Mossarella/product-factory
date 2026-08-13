create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free',
  shop_name text,
  shop_contact text,
  shop_description text,
  readme_footer text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.product_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  assets text[] not null default '{}',
  rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text not null default '',
  product_name text not null default '',
  etsy_title text not null default '',
  description text not null default '',
  notes text not null default '',
  contact text not null default '',
  price numeric(12,2) not null default 0,
  currency text not null default 'USD',
  license_type text not null default 'personal',
  commercial_price numeric(12,2),
  folders text[] not null default '{}',
  etsy_tags text[] not null default '{}',
  complete boolean not null default false,
  template_id uuid references public.product_templates(id) on delete set null,
  build_version integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, name)
);

create table if not exists public.product_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  filename text not null,
  original_name text not null,
  folder text not null default 'Main',
  variant text not null default '',
  storage_path text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fixed_asset_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  asset_key text not null,
  filename text not null,
  original_name text not null,
  storage_path text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (product_id, asset_key)
);

create table if not exists public.product_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  version integer not null,
  filename text not null,
  file_size bigint not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  changelog text not null default '',
  reverted_from integer,
  storage_path text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (product_id, version)
);

create index if not exists products_owner_id_idx on public.products(owner_id);
create index if not exists product_templates_owner_id_idx on public.product_templates(owner_id);
create index if not exists product_files_product_id_idx on public.product_files(product_id);
create index if not exists fixed_asset_files_product_id_idx on public.fixed_asset_files(product_id);
create index if not exists product_builds_product_id_idx on public.product_builds(product_id);

 drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

 drop trigger if exists product_templates_set_updated_at on public.product_templates;
create trigger product_templates_set_updated_at before update on public.product_templates
for each row execute function public.set_updated_at();

 drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.product_templates enable row level security;
alter table public.products enable row level security;
alter table public.product_files enable row level security;
alter table public.fixed_asset_files enable row level security;
alter table public.product_builds enable row level security;

create policy "profiles_self_select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_self_insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "templates_owner_select" on public.product_templates for select to authenticated using (auth.uid() = owner_id);
create policy "templates_owner_insert" on public.product_templates for insert to authenticated with check (auth.uid() = owner_id);
create policy "templates_owner_update" on public.product_templates for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "templates_owner_delete" on public.product_templates for delete to authenticated using (auth.uid() = owner_id);

create policy "products_owner_select" on public.products for select to authenticated using (auth.uid() = owner_id);
create policy "products_owner_insert" on public.products for insert to authenticated with check (auth.uid() = owner_id);
create policy "products_owner_update" on public.products for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "products_owner_delete" on public.products for delete to authenticated using (auth.uid() = owner_id);

create policy "product_files_owner_select" on public.product_files for select to authenticated using (auth.uid() = owner_id);
create policy "product_files_owner_insert" on public.product_files for insert to authenticated with check (auth.uid() = owner_id);
create policy "product_files_owner_update" on public.product_files for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "product_files_owner_delete" on public.product_files for delete to authenticated using (auth.uid() = owner_id);

create policy "fixed_assets_owner_select" on public.fixed_asset_files for select to authenticated using (auth.uid() = owner_id);
create policy "fixed_assets_owner_insert" on public.fixed_asset_files for insert to authenticated with check (auth.uid() = owner_id);
create policy "fixed_assets_owner_update" on public.fixed_asset_files for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "fixed_assets_owner_delete" on public.fixed_asset_files for delete to authenticated using (auth.uid() = owner_id);

create policy "builds_owner_select" on public.product_builds for select to authenticated using (auth.uid() = owner_id);
create policy "builds_owner_insert" on public.product_builds for insert to authenticated with check (auth.uid() = owner_id);
create policy "builds_owner_update" on public.product_builds for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "builds_owner_delete" on public.product_builds for delete to authenticated using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false), ('product-builds', 'product-builds', false)
on conflict (id) do nothing;

create policy "product_storage_owner_select" on storage.objects for select to authenticated using (
  bucket_id in ('product-files', 'product-builds') and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "product_storage_owner_insert" on storage.objects for insert to authenticated with check (
  bucket_id in ('product-files', 'product-builds') and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "product_storage_owner_update" on storage.objects for update to authenticated using (
  bucket_id in ('product-files', 'product-builds') and (storage.foldername(name))[1] = (select auth.uid()::text)
) with check (
  bucket_id in ('product-files', 'product-builds') and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "product_storage_owner_delete" on storage.objects for delete to authenticated using (
  bucket_id in ('product-files', 'product-builds') and (storage.foldername(name))[1] = (select auth.uid()::text)
);
