-- PHASE 46 — Permissions hardening v2 (break-glass admin functions)

begin;

create or replace function public.break_glass_set_club_status(
  _club_id uuid,
  _status text,
  _reason text default null
)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clubs;
begin
  if auth.uid() is not null then
    raise exception 'forbidden';
  end if;

  if _club_id is null then
    raise exception 'club_id_required';
  end if;

  update public.clubs
  set
    status = _status,
    status_reason = _reason
  where id = _club_id
  returning * into c;

  if not found then
    raise exception 'club_not_found';
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    null,
    'break_glass.club_status',
    'club',
    _club_id,
    jsonb_build_object('status', _status, 'reason', _reason)
  );

  return c;
end;
$$;

revoke all on function public.break_glass_set_club_status(uuid, text, text) from public;
grant execute on function public.break_glass_set_club_status(uuid, text, text) to service_role;

create or replace function public.break_glass_assign_role(
  _user_id uuid,
  _role_key text,
  _term_id uuid default null,
  _is_primary boolean default false
)
returns public.role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  ra public.role_assignments;
begin
  if auth.uid() is not null then
    raise exception 'forbidden';
  end if;

  if _user_id is null or _role_key is null then
    raise exception 'user_id_and_role_required';
  end if;

  select * into ra
  from public.role_assignments
  where user_id = _user_id
    and role_key = _role_key
    and term_id is not distinct from _term_id
    and ends_at is null
  limit 1;

  if found then
    update public.role_assignments
    set is_primary = _is_primary
    where id = ra.id
    returning * into ra;
  else
    insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
    values (_user_id, _role_key, _term_id, now(), null, _is_primary)
    returning * into ra;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    null,
    'break_glass.role_assignment',
    'role_assignment',
    ra.id,
    jsonb_build_object('user_id', _user_id, 'role_key', _role_key, 'term_id', _term_id)
  );

  return ra;
end;
$$;

revoke all on function public.break_glass_assign_role(uuid, text, uuid, boolean) from public;
grant execute on function public.break_glass_assign_role(uuid, text, uuid, boolean) to service_role;

commit;
