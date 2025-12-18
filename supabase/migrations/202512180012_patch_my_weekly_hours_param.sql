-- PATCH — Allow viewing weekly totals for an arbitrary week
--
-- Adds an overload of `my_weekly_hours` that accepts `_week_start date default null`.
-- This enables week navigation in the Office Hours UI and keeps weekly totals consistent
-- with `my_timesheet_sessions(_week_start)` / `my_timesheet_exceptions(_week_start)`.

begin;

create or replace function public.my_weekly_hours(_week_start date default null)
returns table (
  user_id uuid,
  week_start date,
  total_minutes bigint,
  in_office_minutes bigint,
  deficit_minutes bigint,
  deficit_in_office_minutes bigint
)
language sql
stable
as $$
  with
  u as (
    select auth.uid() as user_id
  ),
  b as (
    select * from public.office_week_bounds(_week_start)
  ),
  role_sel as (
    select public.primary_role_key_for_requirements((select user_id from u)) as role_key
  ),
  req as (
    select
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes,
      coalesce(ohr.weekly_in_office_hours, 0) * 60 as req_in_office_minutes
    from public.office_hour_requirements ohr
    join role_sel rs on rs.role_key = ohr.role_key
    where (ohr.term_id is null or ohr.term_id = public.current_term_id())
      and (ohr.effective_start is null or ohr.effective_start <= (select week_start from b))
      and (ohr.effective_end is null or ohr.effective_end >= (select week_start from b))
    order by
      case when ohr.term_id is null then 1 else 0 end,
      ohr.effective_start desc nulls last,
      ohr.created_at desc
    limit 1
  ),
  session_minutes as (
    select
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes,
      coalesce(sum(
        case when coalesce(s.within_radius, false) then extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0 else 0 end
      ), 0)::bigint as in_office_minutes
    from public.office_hour_sessions s
    join u on u.user_id = s.user_id
    join b on true
    where s.checkout_at is not null
      and s.status in ('closed','auto_closed')
      and s.checkin_at >= b.week_start_ts
      and s.checkin_at < b.week_end_ts
  ),
  exception_minutes as (
    select
      coalesce(sum(case when e.kind = 'total' then e.minutes else 0 end), 0)::bigint as total_minutes,
      coalesce(sum(case when e.kind = 'in_office' then e.minutes else 0 end), 0)::bigint as in_office_minutes
    from public.office_hour_exceptions e
    join u on u.user_id = e.user_id
    join b on b.week_start = e.week_start_date
  ),
  totals as (
    select
      (select user_id from u) as user_id,
      (select week_start from b) as week_start,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      (sm.in_office_minutes + em.in_office_minutes) as in_office_minutes,
      (select req_total_minutes from req) as req_total_minutes,
      (select req_in_office_minutes from req) as req_in_office_minutes
    from session_minutes sm, exception_minutes em
  )
  select
    user_id,
    week_start,
    total_minutes,
    in_office_minutes,
    greatest(coalesce(req_total_minutes, 0) - total_minutes, 0) as deficit_minutes,
    greatest(coalesce(req_in_office_minutes, 0) - in_office_minutes, 0) as deficit_in_office_minutes
  from totals;
$$;

revoke all on function public.my_weekly_hours(date) from public;
grant execute on function public.my_weekly_hours(date) to authenticated;
grant execute on function public.my_weekly_hours(date) to service_role;

commit;

