alter function public.get_my_license()
  set search_path = public, pg_temp;

revoke execute on function public.redeem_license_key(text) from anon;
grant execute on function public.redeem_license_key(text) to authenticated;
