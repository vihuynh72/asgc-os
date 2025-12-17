-- PHASE 12 — Requirements config (office_hour_requirements)
-- Adds invariants + audit logging for requirement changes.

begin;

-- 1) Hard invariants: in-office hours cannot exceed total hours.
alter table public.office_hour_requirements
  drop constraint if exists office_hour_requirements_in_office_lte_total;

alter table public.office_hour_requirements
  add constraint office_hour_requirements_in_office_lte_total
  check (weekly_in_office_hours <= weekly_total_hours);

-- 2) Prevent multiple "default" rows for the same (role_key, term_id).
-- We keep flexibility for effective_start/effective_end overrides in later phases.
create unique index if not exists office_hour_requirements_default_unique
  on public.office_hour_requirements (role_key, term_id)
  where effective_start is null and effective_end is null;

-- 3) Audit logging (SECURITY DEFINER so it can write audit_log under RLS).
create or replace function public.audit_office_hour_requirements_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  payload jsonb;
  action text;
  target_id uuid;
begin
  actor := auth.uid();

  if tg_op = 'INSERT' then
    action := 'office_hour_requirement.created';
    target_id := new.id;
    payload := jsonb_build_object(
      'role_key', new.role_key,
      'term_id', new.term_id,
      'weekly_total_hours', new.weekly_total_hours,
      'weekly_in_office_hours', new.weekly_in_office_hours,
      'effective_start', new.effective_start,
      'effective_end', new.effective_end
    );
  elsif tg_op = 'UPDATE' then
    action := 'office_hour_requirement.updated';
    target_id := new.id;
    payload := jsonb_build_object(
      'role_key', new.role_key,
      'term_id', new.term_id,
      'weekly_total_hours', new.weekly_total_hours,
      'weekly_in_office_hours', new.weekly_in_office_hours,
      'effective_start', new.effective_start,
      'effective_end', new.effective_end
    );
  elsif tg_op = 'DELETE' then
    action := 'office_hour_requirement.deleted';
    target_id := old.id;
    payload := jsonb_build_object(
      'role_key', old.role_key,
      'term_id', old.term_id,
      'weekly_total_hours', old.weekly_total_hours,
      'weekly_in_office_hours', old.weekly_in_office_hours,
      'effective_start', old.effective_start,
      'effective_end', old.effective_end
    );
  else
    return null;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (actor, action, 'office_hour_requirement', target_id, payload);

  return null;
end;
$$;

revoke all on function public.audit_office_hour_requirements_change() from public;
revoke all on function public.audit_office_hour_requirements_change() from authenticated;

drop trigger if exists trg_office_hour_requirements_audit_change on public.office_hour_requirements;
create trigger trg_office_hour_requirements_audit_change
after insert or update or delete on public.office_hour_requirements
for each row
execute function public.audit_office_hour_requirements_change();

commit;
