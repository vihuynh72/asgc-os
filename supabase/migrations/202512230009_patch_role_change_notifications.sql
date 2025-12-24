-- PATCH - Track role changes for user-facing notifications
-- Adds roles_updated_at to profile_private and updates it when role_assignments change.

alter table public.profile_private
  add column if not exists roles_updated_at timestamptz null;

comment on column public.profile_private.roles_updated_at is
  'Timestamp of the most recent role assignment change for this user';

create or replace function public.touch_profile_roles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  prior_user uuid;
begin
  if tg_op = 'DELETE' then
    target_user := old.user_id;
  else
    target_user := new.user_id;
    prior_user := old.user_id;
  end if;

  if target_user is not null then
    update public.profile_private
    set roles_updated_at = now()
    where id = target_user;
  end if;

  if prior_user is not null and prior_user is distinct from target_user then
    update public.profile_private
    set roles_updated_at = now()
    where id = prior_user;
  end if;

  return null;
end;
$$;

revoke all on function public.touch_profile_roles_updated_at() from public;

drop trigger if exists trg_role_assignments_touch_profile_roles on public.role_assignments;
create trigger trg_role_assignments_touch_profile_roles
after insert or update or delete on public.role_assignments
for each row
execute function public.touch_profile_roles_updated_at();
