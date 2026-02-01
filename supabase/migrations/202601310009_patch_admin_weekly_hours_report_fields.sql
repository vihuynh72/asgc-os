-- PATCH — Admin weekly office hours: include role + required minutes for reporting
--
-- Adds columns to the admin_weekly_hours RPC used by admin exports:
-- - role_key (primary_role_key_for_requirements)
-- - required_total_minutes (derived from office_hour_requirements selection)
--
-- Note: PL/pgSQL output columns are variables; fully qualify selected columns to avoid ambiguity.

begin;

drop function if exists public.admin_weekly_hours(date);

create or replace function public.admin_weekly_hours(_week_start date default null)
returns table (
  user_id uuid,
  week_start date,
  role_key text,
  required_total_minutes bigint,
  total_minutes bigint,
  deficit_minutes bigint,
  needs_review_sessions bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  wk date;
  b record;
  admin_info jsonb;
  admin_tier text;
  admin_is_evp boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  admin_tier := admin_info ->> 'tier';
  admin_is_evp := coalesce((admin_info ->> 'is_evp')::boolean, false);

  if admin_tier is null or (admin_tier <> 'full' and not (admin_is_evp and admin_tier = 'partial')) then
    raise exception 'forbidden';
  end if;

  select * into b from public.office_week_bounds(_week_start) limit 1;
  wk := b.week_start;

  return query
  with
  users as (
    select
      p.id as user_id,
      public.primary_role_key_for_requirements(p.id) as role_key
    from public.profiles p
    join public.profile_private pp on pp.id = p.id
    where p.status = 'active'
      and pp.email is not null
      and public.is_email_allowlisted(pp.email) = true
  ),
  req as (
    select
      u.user_id,
      u.role_key,
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes
    from users u
    left join lateral (
      select ohr.*
      from public.office_hour_requirements ohr
      where ohr.role_key = u.role_key
        and (ohr.term_id is null or ohr.term_id = public.current_term_id())
        and (ohr.effective_start is null or ohr.effective_start <= wk)
        and (ohr.effective_end is null or ohr.effective_end >= wk)
      order by
        case when ohr.term_id is null then 1 else 0 end,
        ohr.effective_start desc nulls last,
        ohr.created_at desc
      limit 1
    ) ohr on true
  ),
  session_minutes as (
    select
      u.user_id,
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes,
      coalesce(sum(case when coalesce(s.needs_review, false) then 1 else 0 end), 0)::bigint as needs_review_sessions
    from users u
    left join public.office_hour_sessions s
      on s.user_id = u.user_id
      and s.checkout_at is not null
      and s.status = 'closed'
      and s.checkin_at >= b.week_start_ts
      and s.checkin_at < b.week_end_ts
    group by u.user_id
  ),
  exception_minutes as (
    select
      u.user_id,
      coalesce(sum(e.minutes), 0)::bigint as total_minutes
    from users u
    left join public.office_hour_exceptions e
      on e.user_id = u.user_id
      and e.week_start_date = wk
    group by u.user_id
  ),
  totals as (
    select
      u.user_id,
      wk as week_start,
      r.role_key,
      coalesce(r.req_total_minutes, 0)::bigint as required_total_minutes,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      sm.needs_review_sessions
    from users u
    left join req r on r.user_id = u.user_id
    join session_minutes sm on sm.user_id = u.user_id
    join exception_minutes em on em.user_id = u.user_id
  )
  select
    t.user_id,
    t.week_start,
    t.role_key,
    t.required_total_minutes,
    t.total_minutes,
    greatest(t.required_total_minutes - t.total_minutes, 0) as deficit_minutes,
    t.needs_review_sessions
  from totals t
  order by
    case t.role_key
      when 'president' then 0
      when 'executive' then 1
      when 'director' then 2
      when 'board_member' then 3
      when 'volunteer' then 4
      else 9
    end,
    t.total_minutes desc;
end;
$$;

revoke all on function public.admin_weekly_hours(date) from public;
grant execute on function public.admin_weekly_hours(date) to service_role;

commit;

