-- PATCH — Remove term-scoped director role and align weekly hour defaults
--
-- Policy:
-- - Active term role buckets are president, executive, board_member, volunteer (+ global advisor)
-- - Director of Board Affairs moves under the executive bucket
-- - All other director assignments collapse into board_member
-- - Weekly total hour defaults become:
--   president: 10
--   executive: 10
--   board_member: 4
--   volunteer: 0

begin;

-- 1) Normalize known executive display titles from legacy email patterns.
update public.role_assignments ra
set display_title = 'Director of Board Affairs'
from public.profile_private pp
where pp.id = ra.user_id
  and ra.role_key = 'executive'
  and lower(coalesce(pp.email, '')) like '%boardaffairs%'
  and (ra.display_title is null or char_length(btrim(ra.display_title)) = 0);

update public.role_assignments ra
set display_title = 'Executive Vice President'
from public.profile_private pp
where pp.id = ra.user_id
  and ra.role_key = 'executive'
  and (
    lower(coalesce(pp.email, '')) like '%execvp%'
    or lower(coalesce(pp.email, '')) like '%evp%'
    or lower(coalesce(pp.email, '')) like 'asgc.vp@%'
    or lower(coalesce(pp.email, '')) like '%vicepresident%'
    or lower(coalesce(pp.email, '')) like '%vice-president%'
  )
  and lower(coalesce(pp.email, '')) not like '%vpfinance%'
  and (ra.display_title is null or char_length(btrim(ra.display_title)) = 0);

-- 2) Move Director of Board Affairs rows into the executive bucket.
update public.role_assignments ra
set ends_at = coalesce(ra.ends_at, now())
from public.profile_private pp
where pp.id = ra.user_id
  and ra.role_key = 'director'
  and lower(coalesce(pp.email, '')) like '%boardaffairs%'
  and exists (
    select 1
    from public.role_assignments ex
    where ex.user_id = ra.user_id
      and ex.term_id is not distinct from ra.term_id
      and ex.role_key = 'executive'
      and ex.ends_at is null
      and ex.id <> ra.id
  );

update public.role_assignments ra
set
  role_key = 'executive',
  display_title = coalesce(nullif(btrim(ra.display_title), ''), 'Director of Board Affairs')
from public.profile_private pp
where pp.id = ra.user_id
  and ra.role_key = 'director'
  and lower(coalesce(pp.email, '')) like '%boardaffairs%';

-- 3) Collapse all remaining director rows into board_member.
update public.role_assignments ra
set ends_at = coalesce(ra.ends_at, now())
where ra.role_key = 'director'
  and exists (
    select 1
    from public.role_assignments bm
    where bm.user_id = ra.user_id
      and bm.term_id is not distinct from ra.term_id
      and bm.role_key = 'board_member'
      and bm.ends_at is null
      and bm.id <> ra.id
  );

update public.role_assignments
set
  role_key = 'board_member',
  display_title = null
where role_key = 'director';

-- 4) Collapse bootstrap grants the same way so removed role keys are not reintroduced.
update public.bootstrap_role_grants g
set is_active = false
where g.role_key = 'director'
  and g.is_active = true
  and g.consumed_at is null
  and lower(g.email) like '%boardaffairs%'
  and exists (
    select 1
    from public.bootstrap_role_grants ex
    where ex.email_normalized = g.email_normalized
      and ex.term_id is not distinct from g.term_id
      and ex.role_key = 'executive'
      and ex.is_active = true
      and ex.consumed_at is null
      and ex.id <> g.id
  );

update public.bootstrap_role_grants
set role_key = 'executive'
where role_key = 'director'
  and lower(email) like '%boardaffairs%';

update public.bootstrap_role_grants g
set is_active = false
where g.role_key = 'director'
  and g.is_active = true
  and g.consumed_at is null
  and lower(g.email) not like '%boardaffairs%'
  and exists (
    select 1
    from public.bootstrap_role_grants bm
    where bm.email_normalized = g.email_normalized
      and bm.term_id is not distinct from g.term_id
      and bm.role_key = 'board_member'
      and bm.is_active = true
      and bm.consumed_at is null
      and bm.id <> g.id
  );

update public.bootstrap_role_grants
set role_key = 'board_member'
where role_key = 'director';

-- 5) Remove director-specific office-hour rows and set the simplified defaults.
delete from public.office_hour_requirements
where role_key = 'director';

do $$
declare
  ct uuid := public.current_term_id();
begin
  update public.office_hour_requirements
  set weekly_total_hours = 10, weekly_in_office_hours = 0
  where role_key = 'president'
    and effective_start is null
    and effective_end is null
    and (term_id is null or term_id = ct);

  update public.office_hour_requirements
  set weekly_total_hours = 10, weekly_in_office_hours = 0
  where role_key = 'executive'
    and effective_start is null
    and effective_end is null
    and (term_id is null or term_id = ct);

  update public.office_hour_requirements
  set weekly_total_hours = 4, weekly_in_office_hours = 0
  where role_key = 'board_member'
    and effective_start is null
    and effective_end is null
    and (term_id is null or term_id = ct);

  update public.office_hour_requirements
  set weekly_total_hours = 0, weekly_in_office_hours = 0
  where role_key = 'volunteer'
    and effective_start is null
    and effective_end is null
    and (term_id is null or term_id = ct);

  if not exists (
    select 1
    from public.office_hour_requirements
    where role_key = 'president'
      and term_id is null
      and effective_start is null
      and effective_end is null
  ) then
    insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
    values ('president', null, 10, 0);
  end if;

  if not exists (
    select 1
    from public.office_hour_requirements
    where role_key = 'executive'
      and term_id is null
      and effective_start is null
      and effective_end is null
  ) then
    insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
    values ('executive', null, 10, 0);
  end if;

  if not exists (
    select 1
    from public.office_hour_requirements
    where role_key = 'board_member'
      and term_id is null
      and effective_start is null
      and effective_end is null
  ) then
    insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
    values ('board_member', null, 4, 0);
  end if;

  if not exists (
    select 1
    from public.office_hour_requirements
    where role_key = 'volunteer'
      and term_id is null
      and effective_start is null
      and effective_end is null
  ) then
    insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
    values ('volunteer', null, 0, 0);
  end if;

  if ct is not null then
    if not exists (
      select 1
      from public.office_hour_requirements
      where role_key = 'president'
        and term_id = ct
        and effective_start is null
        and effective_end is null
    ) then
      insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
      values ('president', ct, 10, 0);
    end if;

    if not exists (
      select 1
      from public.office_hour_requirements
      where role_key = 'executive'
        and term_id = ct
        and effective_start is null
        and effective_end is null
    ) then
      insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
      values ('executive', ct, 10, 0);
    end if;

    if not exists (
      select 1
      from public.office_hour_requirements
      where role_key = 'board_member'
        and term_id = ct
        and effective_start is null
        and effective_end is null
    ) then
      insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
      values ('board_member', ct, 4, 0);
    end if;

    if not exists (
      select 1
      from public.office_hour_requirements
      where role_key = 'volunteer'
        and term_id = ct
        and effective_start is null
        and effective_end is null
    ) then
      insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
      values ('volunteer', ct, 0, 0);
    end if;
  end if;
end;
$$;

-- 6) Update requirement selection helper so director is no longer a valid bucket.
create or replace function public.primary_role_key_for_requirements(_uid uuid)
returns text
language sql
stable
as $$
  with ct as (
    select public.current_term_id() as term_id
  ),
  active as (
    select ra.role_key, ra.is_primary
    from public.role_assignments ra
    join ct on true
    where ra.user_id = _uid
      and ra.ends_at is null
      and ra.term_id = ct.term_id
      and ra.role_key in ('president','executive','board_member','volunteer')
  ),
  ranked as (
    select
      role_key,
      row_number() over (
        order by
          case when is_primary then 0 else 1 end,
          case role_key
            when 'president' then 0
            when 'executive' then 1
            when 'board_member' then 2
            when 'volunteer' then 3
            else 9
          end
      ) as rn
    from active
  )
  select coalesce(
    (select role_key from ranked where rn = 1),
    'volunteer'
  );
$$;

revoke all on function public.primary_role_key_for_requirements(uuid) from public;
grant execute on function public.primary_role_key_for_requirements(uuid) to authenticated;

-- 7) Update task delegation rules to match the simplified role hierarchy.
create or replace function public.enforce_task_assignment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  is_chair boolean;
  assignee_is_member boolean;
  actor_role text;
  assignee_role text;
begin
  is_admin := public.is_admin(auth.uid());

  if new.assigned_to is not null then
    select exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = new.committee_id
        and cm.user_id = new.assigned_to
    ) into assignee_is_member;

    if not assignee_is_member then
      raise exception 'invalid assignee';
    end if;

    if not is_admin and new.assigned_to <> auth.uid() then
      is_chair := public.is_committee_chair(new.committee_id);
      if is_chair then
        return new;
      end if;

      actor_role := public.primary_role_key_for_requirements(auth.uid());
      assignee_role := public.primary_role_key_for_requirements(new.assigned_to);

      if actor_role = 'executive' and assignee_role in ('board_member','volunteer') then
        return new;
      else
        raise exception 'forbidden';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 8) Remove director from the role catalog once references are migrated.
delete from public.roles
where role_key = 'director';

commit;
