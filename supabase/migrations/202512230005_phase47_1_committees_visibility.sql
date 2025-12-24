-- PHASE 47.1 — Update committees RLS for member visibility
-- Allows all ASGC members (authenticated users with roles) to view committee list
-- Keeps committee_memberships restricted to own + admin

begin;

-- Drop the existing restrictive policy
drop policy if exists "committees_select_member" on public.committees;

-- Create helper function to check if user has any ASGC role (not just volunteer)
create or replace function public.is_asgc_member(_uid uuid)
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

  -- Prevent probing other users
  if auth.uid() is null or _uid <> auth.uid() then
    return false;
  end if;

  -- Check for global advisor
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

  -- Check for any term-scoped ASGC role (president, executive, director, board_member)
  -- Excludes volunteer as they don't need committee visibility
  return exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = _uid
      and ra.role_key in ('president', 'executive', 'director', 'board_member')
      and ra.term_id = ct
      and ra.ends_at is null
  );
end;
$$;

revoke all on function public.is_asgc_member(uuid) from public;
grant execute on function public.is_asgc_member(uuid) to authenticated;

comment on function public.is_asgc_member(uuid) is
  'Returns true if user is an ASGC member with a role (advisor, president, executive, director, or board_member)';

-- New policy: ASGC members can view all committees
create policy "committees_select_asgc_member"
  on public.committees
  for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_asgc_member(auth.uid())
  );

-- Also allow committee members to see their own committees (in case they don't have a board role)
create policy "committees_select_own_membership"
  on public.committees
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = committees.id
        and cm.user_id = auth.uid()
    )
  );

-- Update committee_memberships policy to allow ASGC members to see membership info
-- (needed for EVP to see committee member counts)
drop policy if exists "committee_memberships_select_own" on public.committee_memberships;
drop policy if exists "committee_memberships_select_admin" on public.committee_memberships;

-- Members can view their own committee memberships
create policy "committee_memberships_select_own"
  on public.committee_memberships
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admin and EVP can view all memberships
create policy "committee_memberships_select_admin_evp"
  on public.committee_memberships
  for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_evp(auth.uid())
  );

-- Members of the same committee can see each other
create policy "committee_memberships_select_same_committee"
  on public.committee_memberships
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.committee_memberships my_cm
      where my_cm.committee_id = committee_memberships.committee_id
        and my_cm.user_id = auth.uid()
    )
  );

commit;
