-- PATCH — Allow EVP access to office-hours admin functions
-- Aligns admin_weekly_hours and admin_create_office_hour_shift with tiered admin access.

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
    t.user_id,
    t.week_start,
    t.total_minutes,
    t.in_office_minutes,
    greatest(coalesce(t.req_total_minutes, 0) - t.total_minutes, 0) as deficit_minutes,
    greatest(coalesce(t.req_in_office_minutes, 0) - t.in_office_minutes, 0) as deficit_in_office_minutes,
    t.needs_review_sessions
  from totals t
  order by deficit_minutes desc, deficit_in_office_minutes desc;
end;
$$;

revoke all on function public.admin_weekly_hours(date) from public;
revoke all on function public.admin_weekly_hours(date) from authenticated;
grant execute on function public.admin_weekly_hours(date) to authenticated;
grant execute on function public.admin_weekly_hours(date) to service_role;

create or replace function public.admin_create_office_hour_shift(
  _user_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _office_location_id uuid default null
)
returns public.office_hour_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.office_hour_shifts;
  office_id uuid;
  tz text;
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

  if _user_id is null then
    raise exception 'user_id_required';
  end if;

  if _starts_at is null or _ends_at is null then
    raise exception 'time_required';
  end if;

  if _ends_at <= _starts_at then
    raise exception 'invalid_time_range';
  end if;

  tz := public.office_timezone();
  if extract(isodow from (_starts_at at time zone tz))::int > 5
     or extract(isodow from (_ends_at at time zone tz))::int > 5 then
    raise exception 'weekend_not_allowed';
  end if;

  office_id := _office_location_id;
  if office_id is null then
    select oc.primary_office_location_id into office_id
    from public.office_config oc
    where oc.id = true;
  end if;

  if office_id is null then
    raise exception 'office_config_missing';
  end if;

  insert into public.office_hour_shifts (user_id, office_location_id, starts_at, ends_at, status, created_by)
  values (_user_id, office_id, _starts_at, _ends_at, 'scheduled', auth.uid())
  returning * into created;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.shift_created',
    'office_hour_shift',
    created.id,
    jsonb_build_object(
      'user_id', _user_id,
      'office_location_id', office_id,
      'starts_at', _starts_at,
      'ends_at', _ends_at
    )
  );

  return created;
end;
$$;

revoke all on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to service_role;

commit;
