-- Product Factory: make service-role-only quota tables explicit to security tooling

drop policy if exists "account_entitlements_no_direct_access" on public.account_entitlements;
create policy "account_entitlements_no_direct_access"
  on public.account_entitlements for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "billing_purchases_no_direct_access" on public.billing_purchases;
create policy "billing_purchases_no_direct_access"
  on public.billing_purchases for all to anon, authenticated
  using (false) with check (false);
