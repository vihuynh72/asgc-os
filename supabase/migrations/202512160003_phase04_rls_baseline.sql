-- PHASE 04 — RLS baseline (directory-safe reads + helper functions)
-- Source of truth: 02_data_model.md (RLS helpers), 03_security_and_permissions.md (people directory)

begin;

create extension if not exists pgcrypto;

-- 1) RLS helper functions
-- SECURITY DEFINER: avoids RLS recursion when used inside policies.

create or replace function public.current_term_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.terms t
  where t.is_current
  limit 1;
$$;

revoke all on function public.current_term_id() from public;
grant execute on function public.current_term_id() to authenticated;

create or replace function public.is_admin(_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ct uuid;
begin
  if _uid is null then
    return false;
  end if;

  -- Prevent probing other users: only allow checking the caller.
  if auth.uid() is null or _uid <> auth.uid() then
    return false;
  end if;

  -- Global advisor
  if exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key = 'advisor'
      and ra.term_id is null
      and ra.ends_at is null
  ) then
    return true;
  end if;

  ct := public.current_term_id();
  if ct is null then
    return false;
  end if;

  -- President for current term
  if exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key = 'president'
      and ra.term_id = ct
      and ra.ends_at is null
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- 2) Split private fields out of profiles so directory reads don't leak.
create table if not exists public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;

create policy "profile_private_select_own"
  on public.profile_private
  for select
  to authenticated
  using (id = auth.uid());

create policy "profile_private_update_own"
  on public.profile_private
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profile_private_select_admin"
  on public.profile_private
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop trigger if exists trg_profile_private_set_updated_at on public.profile_private;
create trigger trg_profile_private_set_updated_at
before update on public.profile_private
for each row
execute function public.set_updated_at();

-- Backfill private emails from existing profiles table (if present), then null out.
insert into public.profile_private (id, email)
select p.id, p.email
from public.profiles p
where p.email is not null
on conflict (id) do update set email = excluded.email;

update public.profiles p
set email = null
where p.email is not null;

-- 3) People directory access
-- Allow authenticated users to read directory-safe profile fields for active users.
-- Users should always be able to see their own row (even if inactive).
create policy "profiles_select_directory"
  on public.profiles
  for select
  to authenticated
  using (status = 'active' or id = auth.uid());

-- 4) Role visibility baseline
-- Allow authenticated users to read ACTIVE assignments for:
-- - global roles (term_id is null)
-- - current term roles
-- This supports directory displays and non-sensitive UI.
create policy "role_assignments_select_directory"
  on public.role_assignments
  for select
  to authenticated
  using (
    ends_at is null
    and (term_id is null or term_id = public.current_term_id())
  );

-- 5) Ensure new auth users populate profile_private, and do not store email in public.profiles.
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
  -- Public profile record (directory-safe)
  insert into public.profiles (id, email, display_name)
  values (new.id, null, null)
  on conflict (id) do update set email = null;

  -- Private profile fields
  insert into public.profile_private (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  -- Consume any bootstrap grants for this email.
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
    exception when others then
      null;
    end;
  end loop;

  return new;
end;
$$;

commit;
