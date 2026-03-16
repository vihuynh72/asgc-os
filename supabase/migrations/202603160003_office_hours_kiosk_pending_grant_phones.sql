-- Office Hours kiosk Phase 1.5
-- - Allow admins to pre-stage kiosk phones for bootstrap role grants awaiting first sign-in
-- - Sync staged phones onto the real user allowlist when the grant is consumed

begin;

create table if not exists public.office_hours_kiosk_pending_phone_allowlist (
  bootstrap_role_grant_id uuid primary key references public.bootstrap_role_grants(id) on delete cascade,
  phone_e164 text not null unique,
  phone_last4 text not null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hours_kiosk_pending_phone_allowlist_phone_last4_check check (char_length(phone_last4) = 4),
  constraint office_hours_kiosk_pending_phone_allowlist_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$')
);

alter table public.office_hours_kiosk_pending_phone_allowlist enable row level security;

drop policy if exists "office_hours_kiosk_pending_phone_allowlist_select_admin" on public.office_hours_kiosk_pending_phone_allowlist;
create policy "office_hours_kiosk_pending_phone_allowlist_select_admin"
  on public.office_hours_kiosk_pending_phone_allowlist
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop trigger if exists trg_office_hours_kiosk_pending_phone_allowlist_set_updated_at on public.office_hours_kiosk_pending_phone_allowlist;
create trigger trg_office_hours_kiosk_pending_phone_allowlist_set_updated_at
before update on public.office_hours_kiosk_pending_phone_allowlist
for each row
execute function public.set_updated_at();

create or replace function public.sync_office_hours_kiosk_pending_phone_allowlist(
  _grant_id uuid,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row record;
begin
  if _grant_id is null or _user_id is null then
    return;
  end if;

  select p.*
    into pending_row
  from public.office_hours_kiosk_pending_phone_allowlist p
  where p.bootstrap_role_grant_id = _grant_id;

  if not found then
    return;
  end if;

  begin
    insert into public.office_hours_kiosk_phone_allowlist (
      user_id,
      phone_e164,
      phone_last4,
      updated_by
    )
    values (
      _user_id,
      pending_row.phone_e164,
      pending_row.phone_last4,
      pending_row.updated_by
    )
    on conflict (user_id) do update
    set
      phone_e164 = excluded.phone_e164,
      phone_last4 = excluded.phone_last4,
      updated_by = excluded.updated_by,
      updated_at = now();

    delete from public.office_hours_kiosk_pending_phone_allowlist
    where bootstrap_role_grant_id = _grant_id;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.sync_office_hours_kiosk_pending_phone_allowlist(uuid, uuid) from public;
revoke all on function public.sync_office_hours_kiosk_pending_phone_allowlist(uuid, uuid) from authenticated;
grant execute on function public.sync_office_hours_kiosk_pending_phone_allowlist(uuid, uuid) to service_role;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row record;
  resolved_term_id uuid;
  role_scope text;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, null, null)
  on conflict (id) do update set email = null;

  insert into public.profile_private (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  for grant_row in
    select g.*
    from public.bootstrap_role_grants g
    where g.email_normalized = lower(btrim(coalesce(new.email, '')))
      and g.is_active = true
      and g.consumed_at is null
  loop
    select r.scope into role_scope
    from public.roles r
    where r.role_key = grant_row.role_key;

    if role_scope = 'global' then
      resolved_term_id := null;
    else
      resolved_term_id := grant_row.term_id;
      if resolved_term_id is null then
        select t.id into resolved_term_id
        from public.terms t
        where t.is_current
        limit 1;
      end if;
    end if;

    begin
      insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
      values (new.id, grant_row.role_key, resolved_term_id, now(), null, false);

      update public.bootstrap_role_grants
      set consumed_at = now(),
          consumed_by_user_id = new.id
      where id = grant_row.id;

      perform public.sync_office_hours_kiosk_pending_phone_allowlist(grant_row.id, new.id);
    exception when others then
      null;
    end;
  end loop;

  return new;
end;
$$;

create or replace function public.consume_bootstrap_role_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  email_norm text;
  grant_row record;
  resolved_term_id uuid;
  role_scope text;
  consumed_count integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  email_norm := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if email_norm = '' then
    return 0;
  end if;

  for grant_row in
    select g.*
    from public.bootstrap_role_grants g
    where g.email_normalized = email_norm
      and g.is_active = true
      and g.consumed_at is null
    order by g.created_at asc
  loop
    select r.scope into role_scope
    from public.roles r
    where r.role_key = grant_row.role_key;

    if role_scope is null then
      continue;
    end if;

    if role_scope = 'global' then
      resolved_term_id := null;
    else
      resolved_term_id := grant_row.term_id;
      if resolved_term_id is null then
        select t.id into resolved_term_id
        from public.terms t
        where t.is_current
        limit 1;
      end if;
    end if;

    begin
      insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
      values (uid, grant_row.role_key, resolved_term_id, now(), null, false);

      update public.bootstrap_role_grants
      set consumed_at = now(),
          consumed_by_user_id = uid
      where id = grant_row.id;

      perform public.sync_office_hours_kiosk_pending_phone_allowlist(grant_row.id, uid);

      consumed_count := consumed_count + 1;
    exception when others then
      null;
    end;
  end loop;

  return consumed_count;
end;
$$;

revoke all on function public.consume_bootstrap_role_grants() from public;
grant execute on function public.consume_bootstrap_role_grants() to authenticated;

commit;
