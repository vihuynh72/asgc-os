-- PATCH — Office Hours kiosk selfies: admins only
--
-- Tighten selfie viewing so only users with an admin tier can view kiosk check-in photos.
-- (Disables non-admin reviewers.)

begin;

create or replace function public.can_view_office_hours_photos()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  admin_info jsonb;
  tier text;
begin
  if auth.uid() is null then
    return false;
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  tier := admin_info ->> 'tier';

  return tier is not null;
end;
$$;

revoke all on function public.can_view_office_hours_photos() from public;
grant execute on function public.can_view_office_hours_photos() to authenticated;

commit;

