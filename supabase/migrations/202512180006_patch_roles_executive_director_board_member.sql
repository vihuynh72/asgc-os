-- PATCH — Expand term roles and remove legacy "officer"
-- New term-scoped roles: executive, director, board_member, volunteer (plus president)

begin;

-- 1) Ensure the new role keys exist.
insert into public.roles (role_key, scope, description)
values
  ('executive', 'term', 'Executive (term-scoped)'),
  ('director', 'term', 'Director (term-scoped)'),
  ('board_member', 'term', 'Board member (term-scoped)')
on conflict (role_key) do update set
  scope = excluded.scope,
  description = excluded.description;

-- 2) Migrate legacy "officer" role assignments to "board_member".
-- If a user already has an active board_member assignment for the same term, end the officer assignment first
-- to avoid unique-index conflicts.
update public.role_assignments ra
set ends_at = now()
where ra.role_key = 'officer'
  and ra.ends_at is null
  and exists (
    select 1
    from public.role_assignments bm
    where bm.user_id = ra.user_id
      and bm.term_id = ra.term_id
      and bm.role_key = 'board_member'
      and bm.ends_at is null
  );

update public.role_assignments
set role_key = 'board_member'
where role_key = 'officer';

update public.office_hour_requirements
set role_key = 'board_member'
where role_key = 'officer';

update public.bootstrap_role_grants
set role_key = 'board_member'
where role_key = 'officer';

-- 3) Drop legacy role key if nothing references it anymore.
delete from public.roles where role_key = 'officer';

-- 4) Ensure base/default requirements exist for all term-scoped roles.
insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
select r.role_key, null, 0, 0
from public.roles r
where r.role_key in ('president','executive','director','board_member','volunteer')
  and not exists (
    select 1
    from public.office_hour_requirements ohr
    where ohr.role_key = r.role_key
      and ohr.term_id is null
  );

-- 5) Update requirements role selection helper.
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
      and ra.role_key in ('president','executive','director','board_member','volunteer')
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
            when 'director' then 2
            when 'board_member' then 3
            when 'volunteer' then 4
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

commit;

