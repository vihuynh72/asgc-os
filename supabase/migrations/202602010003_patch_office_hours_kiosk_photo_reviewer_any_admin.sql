-- PATCH — Office hours kiosk selfie reviewers: allow any admin tier to view photos
--
-- Change policy so that any admin tier (full/partial/read-only) can view kiosk check-in photos.
-- Full admins can still grant additional non-admin reviewers via set_office_hours_photo_reviewer.

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

  if tier is not null then
    return true;
  end if;

  return exists(
    select 1
    from public.office_hours_photo_reviewers r
    where r.user_id = auth.uid()
  );
end;
$$;

revoke all on function public.can_view_office_hours_photos() from public;
grant execute on function public.can_view_office_hours_photos() to authenticated;

commit;

