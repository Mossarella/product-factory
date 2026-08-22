-- Etsy webhook delivery ledger.
-- Etsy currently documents order lifecycle events; inventory refreshes are triggered
-- by those order events because Etsy does not document a general inventory-change event.

create table if not exists public.etsy_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  delivery_id text not null,
  event_type text not null,
  shop_id bigint not null,
  resource_url text,
  status text not null default 'received',
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  error_message text,
  payload jsonb not null,
  constraint etsy_webhook_events_status_check check (status in ('received', 'processed', 'ignored', 'failed')),
  constraint etsy_webhook_events_owner_connection_fk
    foreign key (owner_id, connection_id)
    references public.etsy_connections(owner_id, id)
    on delete cascade,
  constraint etsy_webhook_events_owner_delivery_key unique (owner_id, delivery_id),
  constraint etsy_webhook_events_owner_id_id_key unique (owner_id, id)
);

create index if not exists etsy_webhook_events_owner_received_idx
  on public.etsy_webhook_events(owner_id, received_at desc);
create index if not exists etsy_webhook_events_owner_type_idx
  on public.etsy_webhook_events(owner_id, event_type, received_at desc);

alter table public.etsy_webhook_events enable row level security;

revoke all on public.etsy_webhook_events from anon, authenticated;
grant select on public.etsy_webhook_events to authenticated;
grant all on public.etsy_webhook_events to service_role;

create policy "etsy_webhook_events_owner_select"
  on public.etsy_webhook_events
  for select to authenticated
  using (auth.uid() = owner_id);

comment on table public.etsy_webhook_events is
  'Verified Etsy webhook deliveries; writes are server-only and delivery_id provides idempotency.';
