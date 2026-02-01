-- PATCH — Office hours kiosk selfie: photo reviewer permission
--
-- Creates a separate permission set for viewing kiosk check-in photos.
-- Full admin + EVP can always view; additional reviewers can be granted access.

begin;

create table if not exists public.office_hours_photo_reviewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null
);

alter table public.office_hours_photo_reviewers enable row level security;

-- No direct table access (use RPCs)
revoke all on table public.office_hours_photo_reviewers from public;
revoke all on table public.office_hours_photo_reviewers from authenticated;

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
  is_evp boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  tier := admin_info ->> 'tier';
  is_evp := coalesce((admin_info ->> 'is_evp')::boolean, false);

  if tier = 'full' or is_evp then
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

create or replace function public.set_office_hours_photo_reviewer(_user_id uuid, _enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_info jsonb;
  tier text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  tier := admin_info ->> 'tier';

  if tier <> 'full' then
    raise exception 'forbidden';
  end if;

  if _enabled then
    insert into public.office_hours_photo_reviewers (user_id, created_by)
    values (_user_id, auth.uid())
    on conflict (user_id) do update set created_by = excluded.created_by;
  else
    delete from public.office_hours_photo_reviewers where user_id = _user_id;
  end if;
end;
$$;

revoke all on function public.set_office_hours_photo_reviewer(uuid, boolean) from public;
grant execute on function public.set_office_hours_photo_reviewer(uuid, boolean) to authenticated;

commit;

