-- PHASE 21 fix — repair after role_assignments.committee_id error
-- This migration fixes the RLS policy and function that referenced the wrong table.

begin;

-- Drop the failed policy if it exists
drop policy if exists "meetings_select_member" on public.meetings;

-- Re-create with correct table reference
create policy "meetings_select_member"
  on public.meetings
  for select
  to authenticated
  using (
    meeting_type in ('board', 'icc', 'special', 'other')
    or committee_id is null
    or exists (
      select 1 from public.committee_memberships cm
      where cm.user_id = auth.uid()
        and cm.committee_id = meetings.committee_id
    )
  );

-- Re-create the function with correct table reference
create or replace function public.my_upcoming_meetings(_limit integer default 20)
returns setof public.meetings
language sql
stable
as $$
  select m.*
  from public.meetings m
  where m.status = 'scheduled'
    and m.starts_at > now()
    and (
      m.meeting_type in ('board', 'icc', 'special', 'other')
      or m.committee_id is null
      or exists (
        select 1 from public.committee_memberships cm
        where cm.user_id = auth.uid()
          and cm.committee_id = m.committee_id
      )
    )
  order by m.starts_at asc
  limit _limit;
$$;

revoke all on function public.my_upcoming_meetings(integer) from public;
grant execute on function public.my_upcoming_meetings(integer) to authenticated;

commit;
