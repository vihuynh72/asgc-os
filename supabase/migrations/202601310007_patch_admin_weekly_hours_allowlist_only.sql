-- PATCH — Admin weekly office hours: allowlisted users only
--
-- Rule:
-- - Exclude non-allowlisted users from admin weekly reports/CSV.
-- - Allowlist source of truth: public.is_email_allowlisted(email).

begin;

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
    select p.id as user_id
    from public.profiles p
    join public.profile_private pp on pp.id = p.id
    where p.status = 'active'
      and pp.email is not null
      and public.is_email_allowlisted(pp.email) = true
  ),
  req as (
    select
      u.user_id,
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes
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
      (sm.total_minutes + em.total_minutes) as total_minutes,
      r.req_total_minutes,
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
    total_minutes as in_office_minutes,
    greatest(coalesce(req_total_minutes, 0) - total_minutes, 0) as deficit_minutes,
    0::bigint as deficit_in_office_minutes,
    needs_review_sessions
  from totals;
end;
$$;

revoke all on function public.admin_weekly_hours(date) from public;
grant execute on function public.admin_weekly_hours(date) to service_role;

commit;

