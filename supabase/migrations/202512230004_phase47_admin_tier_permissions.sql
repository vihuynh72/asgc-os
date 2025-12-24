-- PHASE 47 — Admin tier permissions with EVP-specific access and read-only training mode
-- Adds display_title and access_level columns to role_assignments
-- Creates is_evp() and get_admin_tier() functions for tiered admin access

begin;

-- 1) Add display_title column for executive subtypes (EVP, VP Finance, etc.)
alter table public.role_assignments
  add column if not exists display_title text null;

comment on column public.role_assignments.display_title is
  'Optional display title for executives (e.g., "Executive Vice President", "VP Finance")';

-- 2) Add access_level column for read-only training mode
alter table public.role_assignments
  add column if not exists access_level text not null default 'full';

-- Add constraint if not exists (use DO block for idempotency)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'role_assignments_access_level_check'
  ) then
    alter table public.role_assignments
      add constraint role_assignments_access_level_check
      check (access_level in ('read-only', 'full'));
  end if;
end;
$$;

comment on column public.role_assignments.access_level is
  'Access level for admin features: "full" for edit access, "read-only" for training/observation mode';

-- 3) Create is_evp() function to check if user is Executive Vice President
create or replace function public.is_evp(_uid uuid)
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

  ct := public.current_term_id();
  if ct is null then
    return false;
  end if;

  -- Check for executive with EVP display_title
  return exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key = 'executive'
      and ra.term_id = ct
      and ra.ends_at is null
      and (
        lower(ra.display_title) like '%evp%'
        or lower(ra.display_title) like '%executive vice president%'
      )
  );
end;
$$;

revoke all on function public.is_evp(uuid) from public;
grant execute on function public.is_evp(uuid) to authenticated;

comment on function public.is_evp(uuid) is
  'Returns true if user is Executive Vice President (EVP) for current term';

-- 4) Create get_admin_tier() RPC to return admin access tier and metadata
-- Returns: { tier: 'full'|'partial'|'read-only'|null, is_evp: boolean, display_title: text|null }
create or replace function public.get_admin_tier(_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ct uuid;
  result jsonb;
  exec_record record;
begin
  -- Default result: no admin access
  result := jsonb_build_object(
    'tier', null,
    'is_evp', false,
    'display_title', null
  );

  if _uid is null then
    return result;
  end if;

  -- Prevent probing other users: only allow checking the caller.
  if auth.uid() is null or _uid <> auth.uid() then
    return result;
  end if;

  -- Check for global advisor (full admin)
  if exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key = 'advisor'
      and ra.term_id is null
      and ra.ends_at is null
  ) then
    return jsonb_build_object(
      'tier', 'full',
      'is_evp', false,
      'display_title', 'Advisor'
    );
  end if;

  ct := public.current_term_id();
  if ct is null then
    return result;
  end if;

  -- Check for president (full admin)
  if exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key = 'president'
      and ra.term_id = ct
      and ra.ends_at is null
  ) then
    return jsonb_build_object(
      'tier', 'full',
      'is_evp', false,
      'display_title', 'President'
    );
  end if;

  -- Check for executive (partial or read-only)
  select ra.display_title, ra.access_level
  into exec_record
  from public.role_assignments ra
  where ra.user_id = _uid
    and ra.role_key = 'executive'
    and ra.term_id = ct
    and ra.ends_at is null
  limit 1;

  if exec_record is not null then
    declare
      is_evp_user boolean := (
        lower(exec_record.display_title) like '%evp%'
        or lower(exec_record.display_title) like '%executive vice president%'
      );
    begin
      if exec_record.access_level = 'read-only' then
        return jsonb_build_object(
          'tier', 'read-only',
          'is_evp', is_evp_user,
          'display_title', coalesce(exec_record.display_title, 'Executive')
        );
      else
        return jsonb_build_object(
          'tier', 'partial',
          'is_evp', is_evp_user,
          'display_title', coalesce(exec_record.display_title, 'Executive')
        );
      end if;
    end;
  end if;

  return result;
end;
$$;

revoke all on function public.get_admin_tier(uuid) from public;
grant execute on function public.get_admin_tier(uuid) to authenticated;

comment on function public.get_admin_tier(uuid) is
  'Returns admin access tier and metadata for tiered admin UI. Tier values: "full" (advisor/president), "partial" (executive with edit), "read-only" (executive in training), null (no admin access)';

-- 5) Create index for faster display_title lookups
create index if not exists role_assignments_display_title_idx
  on public.role_assignments (display_title)
  where display_title is not null;

commit;
