alter table public.profiles
  add column if not exists license_activated_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_key
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  plan text not null default 'pro' check (plan in ('free', 'pro')),
  issued_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null
);

create index if not exists license_keys_used_by_user_id_idx
  on public.license_keys (used_by_user_id);

alter table public.license_keys enable row level security;

drop policy if exists "license_keys_no_direct_access" on public.license_keys;
create policy "license_keys_no_direct_access"
  on public.license_keys for all to authenticated
  using (false) with check (false);

create or replace function public.redeem_license_key(p_key text)
returns table (plan text, activated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key public.license_keys%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select * into v_key
  from public.license_keys
  where key = btrim(p_key)
    and used_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invalid or already-used license key';
  end if;

  update public.license_keys
  set used_at = v_now, used_by_user_id = auth.uid()
  where id = v_key.id;

  update public.profiles
  set plan = v_key.plan, license_activated_at = v_now, updated_at = v_now
  where id = auth.uid();

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  return query select v_key.plan, v_now;
end;
$$;

revoke all on function public.redeem_license_key(text) from public;
grant execute on function public.redeem_license_key(text) to authenticated;

create or replace function public.get_my_license()
returns table (plan text, activated_at timestamptz, subscription_status text)
language sql
security invoker
stable
as $$
  select p.plan, p.license_activated_at, p.subscription_status
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.get_my_license() to authenticated;
