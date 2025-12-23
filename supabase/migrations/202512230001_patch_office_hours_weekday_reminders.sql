-- PATCH — Weekday-only Office Hours + weekly deficit reminders
--
-- Enforces weekday-only check-ins and shift creation, narrows week bounds to Mon-Fri,
-- and adds a weekly deficit reminder with admin-configurable schedule.

begin;

-- 1) Office config: weekly reminder schedule.
alter table public.office_config
  add column if not exists weekly_hours_reminder_enabled boolean not null default true;

alter table public.office_config
  add column if not exists weekly_hours_reminder_weekday integer not null default 3;

alter table public.office_config
  add column if not exists weekly_hours_reminder_time_local time not null default '17:00';

alter table public.office_config
  drop constraint if exists office_config_weekly_hours_reminder_weekday_check;

alter table public.office_config
  add constraint office_config_weekly_hours_reminder_weekday_check
  check (weekly_hours_reminder_weekday between 1 and 5);

comment on column public.office_config.weekly_hours_reminder_enabled
  is 'Whether to send weekly hours deficit reminders';
comment on column public.office_config.weekly_hours_reminder_weekday
  is 'ISO day of week (1=Mon..5=Fri) for weekly hours reminders';
comment on column public.office_config.weekly_hours_reminder_time_local
  is 'Local office time to enqueue weekly hours reminders';

-- 2) Week bounds now cover Mon-Fri only.
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
    ((wk + 5)::timestamp at time zone office_tz),
    office_tz;
end;
$$;

revoke all on function public.office_week_bounds(date) from public;
grant execute on function public.office_week_bounds(date) to authenticated;

-- 3) Weekday helper (office timezone).
create or replace function public.is_office_weekday(ts timestamptz default now())
returns boolean
language sql
stable
as $$
  select extract(isodow from (ts at time zone public.office_timezone()))::int between 1 and 5;
$$;

revoke all on function public.is_office_weekday(timestamptz) from public;
grant execute on function public.is_office_weekday(timestamptz) to authenticated;
grant execute on function public.is_office_weekday(timestamptz) to service_role;

-- 4) Check-in is weekday-only.
create or replace function public.check_in_office_hours(
  _lat double precision,
  _lon double precision
)
returns table (
  session_id uuid,
  checkin_at timestamptz,
  office_location_id uuid,
  distance_m integer,
  within_radius boolean,
  within_grace boolean,
  needs_review boolean,
  review_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  office_id uuid;
  office_lat double precision;
  office_lon double precision;
  radius integer;
  grace integer;
  dist integer;
  s public.office_hour_sessions;
  in_radius boolean;
  in_grace_band boolean;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_office_weekday(now()) then
    raise exception 'weekend_not_allowed';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  if exists (
    select 1
    from public.office_hour_sessions sess
    where sess.user_id = uid and sess.status = 'open' and sess.checkout_at is null
  ) then
    raise exception 'already_checked_in';
  end if;

  select oc.primary_office_location_id
    into office_id
  from public.office_config oc
  where oc.id = true;

  if office_id is null then
    raise exception 'office_config_missing';
  end if;

  select ol.lat, ol.lon, ol.radius_m, ol.grace_radius_m
    into office_lat, office_lon, radius, grace
  from public.office_locations ol
  where ol.id = office_id and ol.active = true;

  if not found then
    raise exception 'office_location_missing';
  end if;

  if office_lat is null or office_lon is null or radius is null or grace is null then
    raise exception 'office_location_not_configured';
  end if;

  dist := public.haversine_meters(_lat, _lon, office_lat, office_lon);

  if dist > grace then
    raise exception 'outside_geofence';
  end if;

  in_radius := (dist <= radius);
  in_grace_band := (dist > radius and dist <= grace);

  insert into public.office_hour_sessions (
    user_id,
    office_location_id,
    checkin_at,
    status,
    within_radius,
    within_grace,
    distance_m_at_checkin,
    needs_review,
    review_reason
  )
  values (
    uid,
    office_id,
    now(),
    'open',
    in_radius,
    in_grace_band,
    dist,
    false,
    null
  )
  returning * into s;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    uid,
    'office_hours.check_in',
    'office_hour_session',
    s.id,
    jsonb_build_object(
      'office_location_id', office_id,
      'distance_m', dist,
      'within_radius', in_radius,
      'within_grace', in_grace_band,
      'needs_review', false
    )
  );

  return query
  select
    s.id,
    s.checkin_at,
    s.office_location_id,
    s.distance_m_at_checkin,
    s.within_radius,
    s.within_grace,
    false,
    null;
end;
$$;

revoke all on function public.check_in_office_hours(double precision, double precision) from public;
grant execute on function public.check_in_office_hours(double precision, double precision) to authenticated;
grant execute on function public.check_in_office_hours(double precision, double precision) to service_role;

-- 5) Shift creation is weekday-only.
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
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
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

-- 6) Weekly deficit reminders (Wednesday 5pm local by default).
create or replace function public.enqueue_weekly_hours_reminders(_now timestamptz default now())
returns table (queued_count integer, skipped_reason text, week_start date)
language plpgsql
security definer
set search_path = public
as $$
declare
  enabled boolean;
  reminder_dow integer;
  reminder_time time;
  tz text;
  local_ts timestamp;
  local_date date;
  local_time time;
  local_dow integer;
  term_id uuid;
  term_start date;
  term_end date;
  wk date;
  inserted integer;
begin
  select
      oc.weekly_hours_reminder_enabled,
      oc.weekly_hours_reminder_weekday,
      oc.weekly_hours_reminder_time_local
    into enabled, reminder_dow, reminder_time
  from public.office_config oc
  where oc.id = true;

  if not found then
    return query select 0, 'office_config_missing', null::date;
    return;
  end if;

  if not enabled then
    return query select 0, 'disabled', null::date;
    return;
  end if;

  tz := public.office_timezone();
  local_ts := _now at time zone tz;
  local_date := local_ts::date;
  local_time := local_ts::time;
  local_dow := extract(isodow from local_ts)::int;

  if reminder_dow is null or reminder_time is null then
    return query select 0, 'schedule_missing', null::date;
    return;
  end if;

  if local_dow <> reminder_dow or local_time < reminder_time then
    return query select 0, 'schedule_not_due', null::date;
    return;
  end if;

  select t.id, t.start_date, t.end_date
    into term_id, term_start, term_end
  from public.terms t
  where t.is_current
  limit 1;

  if term_id is null then
    return query select 0, 'term_missing', null::date;
    return;
  end if;

  if term_start is null or term_end is null then
    return query select 0, 'term_dates_missing', null::date;
    return;
  end if;

  if local_date < term_start or local_date > term_end then
    return query select 0, 'outside_term', null::date;
    return;
  end if;

  wk := public.office_hours_week_start_date(_now);

  with
  b as (
    select * from public.office_week_bounds(wk)
  ),
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
        and (ohr.effective_start is null or ohr.effective_start <= (select week_start from b))
        and (ohr.effective_end is null or ohr.effective_end >= (select week_start from b))
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
        case when coalesce(s.within_radius, false)
          then extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0
          else 0 end
      ), 0)::bigint as in_office_minutes
    from users u
    left join public.office_hour_sessions s
      on s.user_id = u.user_id
      and s.checkout_at is not null
      and s.status in ('closed','auto_closed')
      and s.checkin_at >= (select week_start_ts from b)
      and s.checkin_at < (select week_end_ts from b)
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
      and e.week_start_date = (select week_start from b)
    group by u.user_id
  ),
  totals as (
    select
      u.user_id,
      (select week_start from b) as week_start,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      (sm.in_office_minutes + em.in_office_minutes) as in_office_minutes,
      r.req_total_minutes,
      r.req_in_office_minutes
    from users u
    join req r on r.user_id = u.user_id
    join session_minutes sm on sm.user_id = u.user_id
    join exception_minutes em on em.user_id = u.user_id
  ),
  deficits as (
    select
      t.user_id,
      t.week_start,
      t.total_minutes,
      t.in_office_minutes,
      t.req_total_minutes,
      t.req_in_office_minutes,
      greatest(coalesce(t.req_total_minutes, 0) - t.total_minutes, 0) as deficit_minutes,
      greatest(coalesce(t.req_in_office_minutes, 0) - t.in_office_minutes, 0) as deficit_in_office_minutes
    from totals t
  ),
  candidates as (
    select *
    from deficits
    where deficit_minutes > 0 or deficit_in_office_minutes > 0
  )
  insert into public.notification_log (
    actor_user_id,
    user_id,
    type,
    channel,
    provider,
    to_email,
    subject,
    status,
    send_after,
    dedupe_key,
    metadata
  )
  select
    null,
    c.user_id,
    'office_hours.weekly_hours_reminder',
    'email',
    'resend',
    pp.email,
    'Office hours reminder: hours remaining this week',
    'queued',
    public.defer_if_quiet_hours(_now),
    'office_hours.weekly_hours_reminder:' || c.user_id::text || ':' || c.week_start::text,
    jsonb_build_object(
      'week_start', c.week_start,
      'week_end', (c.week_start + 4),
      'total_minutes', c.total_minutes,
      'in_office_minutes', c.in_office_minutes,
      'deficit_minutes', c.deficit_minutes,
      'deficit_in_office_minutes', c.deficit_in_office_minutes,
      'required_total_minutes', c.req_total_minutes,
      'required_in_office_minutes', c.req_in_office_minutes,
      'office_tz', tz
    )
  from candidates c
  join public.profile_private pp on pp.id = c.user_id
  where pp.email is not null
    and char_length(btrim(pp.email)) > 0
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted = row_count;

  return query select inserted, null::text, wk;
end;
$$;

revoke all on function public.enqueue_weekly_hours_reminders(timestamptz) from public;
revoke all on function public.enqueue_weekly_hours_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_weekly_hours_reminders(timestamptz) to service_role;

commit;
