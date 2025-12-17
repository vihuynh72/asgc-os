-- PHASE 16 — Timesheet v1 (weekly sessions + admin weekly export)
-- Source of truth: 01_stack_and_architecture.md (Phase 16), 04_office_hours_spec.md (weekly compliance)

begin;

-- 1) Week bounds helper in configured office timezone.
create or replace function public.office_week_bounds(_week_start date default null)
returns table (
  week_start date,
  week_start_ts timestamptz,
  week_end_ts timestamptz,
  tz text
)
language plpgsql
stable
as $$
declare
  wk date;
  office_tz text;
begin
  office_tz := public.office_timezone();
  wk := coalesce(_week_start, public.office_hours_week_start_date(now()));

  return query
  select
    wk,
    (wk::timestamp at time zone office_tz),
    ((wk + 7)::timestamp at time zone office_tz),
    office_tz;
end;
$$;

revoke all on function public.office_week_bounds(date) from public;
grant execute on function public.office_week_bounds(date) to authenticated;

-- 2) Current-user sessions for a week.
create or replace function public.my_timesheet_sessions(_week_start date default null)
returns table (
  id uuid,
  office_location_id uuid,
  checkin_at timestamptz,
  checkout_at timestamptz,
  status text,
  duration_minutes integer,
  within_radius boolean,
  within_grace boolean,
  needs_review boolean,
  review_reason text,
  distance_m_at_checkin integer,
  distance_m_at_checkout integer
)
language sql
stable
as $$
  with b as (
    select * from public.office_week_bounds(_week_start)
  )
  select
    s.id,
    s.office_location_id,
    s.checkin_at,
    s.checkout_at,
    s.status,
    case
      when s.checkout_at is null then null
      else greatest(round(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0)::int, 0)
    end as duration_minutes,
    coalesce(s.within_radius, false) as within_radius,
    coalesce(s.within_grace, false) as within_grace,
    s.needs_review,
    s.review_reason,
    s.distance_m_at_checkin,
    s.distance_m_at_checkout
  from public.office_hour_sessions s
  join b on true
  where s.user_id = auth.uid()
    and s.checkin_at >= b.week_start_ts
    and s.checkin_at < b.week_end_ts
  order by s.checkin_at desc;
$$;

revoke all on function public.my_timesheet_sessions(date) from public;
grant execute on function public.my_timesheet_sessions(date) to authenticated;

-- 3) Current-user exceptions for a week.
create or replace function public.my_timesheet_exceptions(_week_start date default null)
returns table (
  id uuid,
  week_start_date date,
  kind text,
  minutes integer,
  reason text,
  created_at timestamptz
)
language sql
stable
as $$
  with b as (
    select * from public.office_week_bounds(_week_start)
  )
  select
    e.id,
    e.week_start_date,
    e.kind,
    e.minutes,
    e.reason,
    e.created_at
  from public.office_hour_exceptions e
  join b on b.week_start = e.week_start_date
  where e.user_id = auth.uid()
  order by e.created_at desc;
$$;

revoke all on function public.my_timesheet_exceptions(date) from public;
grant execute on function public.my_timesheet_exceptions(date) to authenticated;

-- 4) Admin weekly totals export (one row per user for a week).
-- SECURITY DEFINER because it returns other users' data.
create or replace function public.admin_weekly_hours(_week_start date default null)
returns table (
  user_id uuid,
  week_start date,
  total_minutes bigint,
  in_office_minutes bigint,
  deficit_minutes bigint,
  deficit_in_office_minutes bigint,
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
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into b from public.office_week_bounds(_week_start) limit 1;
  wk := b.week_start;

  return query
  with
  users as (
    select p.id as user_id
    from public.profiles p
    where p.status = 'active'
  ),
  req as (
    select
      u.user_id,
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes,
      coalesce(ohr.weekly_in_office_hours, 0) * 60 as req_in_office_minutes
    from users u
    left join lateral (
      select ohr.*
      from public.office_hour_requirements ohr
      where ohr.role_key = public.primary_role_key_for_requirements(u.user_id)
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
      coalesce(sum(
        case when coalesce(s.within_radius, false) then extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0 else 0 end
      ), 0)::bigint as in_office_minutes,
      coalesce(sum(case when s.needs_review then 1 else 0 end), 0)::bigint as needs_review_sessions
    from users u
    left join public.office_hour_sessions s
      on s.user_id = u.user_id
      and s.checkout_at is not null
      and s.status in ('closed','auto_closed')
      and s.checkin_at >= b.week_start_ts
      and s.checkin_at < b.week_end_ts
    group by u.user_id
  ),
  exception_minutes as (
    select
      u.user_id,
      coalesce(sum(case when e.kind = 'total' then e.minutes else 0 end), 0)::bigint as total_minutes,
      coalesce(sum(case when e.kind = 'in_office' then e.minutes else 0 end), 0)::bigint as in_office_minutes
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
      (sm.total_minutes + em.total_minutes) as total_minutes,
      (sm.in_office_minutes + em.in_office_minutes) as in_office_minutes,
      r.req_total_minutes,
      r.req_in_office_minutes,
      sm.needs_review_sessions
    from users u
    join req r on r.user_id = u.user_id
    join session_minutes sm on sm.user_id = u.user_id
    join exception_minutes em on em.user_id = u.user_id
  )
  select
    user_id,
    week_start,
    total_minutes,
    in_office_minutes,
    greatest(coalesce(req_total_minutes, 0) - total_minutes, 0) as deficit_minutes,
    greatest(coalesce(req_in_office_minutes, 0) - in_office_minutes, 0) as deficit_in_office_minutes,
    needs_review_sessions
  from totals
  order by deficit_minutes desc, deficit_in_office_minutes desc;
end;
$$;

revoke all on function public.admin_weekly_hours(date) from public;
revoke all on function public.admin_weekly_hours(date) from authenticated;
grant execute on function public.admin_weekly_hours(date) to authenticated;
grant execute on function public.admin_weekly_hours(date) to service_role;

commit;
