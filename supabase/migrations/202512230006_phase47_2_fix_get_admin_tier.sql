-- PHASE 47.2 — Fix get_admin_tier() function
-- The previous implementation had a bug where `exec_record is not null` doesn't work
-- correctly for PostgreSQL record types. This uses the FOUND variable instead.

begin;

-- Fix get_admin_tier() to properly check if SELECT INTO found a row
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
  v_display_title text;
  v_access_level text;
  is_evp_user boolean;
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
  -- Use individual variables and FOUND to properly detect if row was found
  select ra.display_title, ra.access_level
  into v_display_title, v_access_level
  from public.role_assignments ra
  where ra.user_id = _uid
    and ra.role_key = 'executive'
    and ra.term_id = ct
    and ra.ends_at is null
  limit 1;

  -- Use FOUND special variable to check if SELECT INTO found a row
  if found then
    is_evp_user := (
      lower(v_display_title) like '%evp%'
      or lower(v_display_title) like '%executive vice president%'
    );
    
    if v_access_level = 'read-only' then
      return jsonb_build_object(
        'tier', 'read-only',
        'is_evp', is_evp_user,
        'display_title', coalesce(v_display_title, 'Executive')
      );
    else
      return jsonb_build_object(
        'tier', 'partial',
        'is_evp', is_evp_user,
        'display_title', coalesce(v_display_title, 'Executive')
      );
    end if;
  end if;

  return result;
end;
$$;

comment on function public.get_admin_tier(uuid) is
  'Returns admin access tier and metadata for tiered admin UI. Tier values: "full" (advisor/president), "partial" (executive with edit), "read-only" (executive in training), null (no admin access)';

commit;
