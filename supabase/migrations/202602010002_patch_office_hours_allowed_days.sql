-- PATCH — Office Hours allowed weekdays + extra allowed dates
--
-- Adds:
-- - office_config.office_hours_allowed_weekdays (default Mon-Fri)
-- - office_config.office_hours_allow_weekends (shortcut for testing)
-- - office_config.office_hours_extra_allowed_dates (specific dates, e.g. weekend testing)
-- - is_office_hours_day_allowed(ts) helper
--
-- Enforces:
-- - check_in_office_hours is blocked when the day is not enabled
-- - admin_create_office_hour_shift is blocked when start/end are on a disabled day

begin;

-- 1) Helpers for array uniqueness (used in CHECK constraints).
create or replace function public.array_unique_int(_arr int[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(_arr), 0) = (
    select count(distinct v) from unnest(coalesce(_arr, '{}'::int[])) as v
  );
$$;

create or replace function public.array_unique_date(_arr date[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(_arr), 0) = (
    select count(distinct v) from unnest(coalesce(_arr, '{}'::date[])) as v
  );
$$;

-- 2) Config fields.
alter table public.office_config
  add column if not exists office_hours_allow_weekends boolean not null default false;

alter table public.office_config
  add column if not exists office_hours_allowed_weekdays int[] not null default '{1,2,3,4,5}';

alter table public.office_config
  add column if not exists office_hours_extra_allowed_dates date[] not null default '{}';

alter table public.office_config
  drop constraint if exists office_config_office_hours_allowed_weekdays_nonempty_check;
alter table public.office_config
  add constraint office_config_office_hours_allowed_weekdays_nonempty_check
  check (cardinality(office_hours_allowed_weekdays) >= 1);

alter table public.office_config
  drop constraint if exists office_config_office_hours_allowed_weekdays_range_check;
alter table public.office_config
  add constraint office_config_office_hours_allowed_weekdays_range_check
  check (office_hours_allowed_weekdays <@ array[1,2,3,4,5,6,7]);

alter table public.office_config
  drop constraint if exists office_config_office_hours_allowed_weekdays_unique_check;
alter table public.office_config
  add constraint office_config_office_hours_allowed_weekdays_unique_check
  check (public.array_unique_int(office_hours_allowed_weekdays));

alter table public.office_config
  drop constraint if exists office_config_office_hours_extra_allowed_dates_unique_check;
alter table public.office_config
  add constraint office_config_office_hours_extra_allowed_dates_unique_check
  check (public.array_unique_date(office_hours_extra_allowed_dates));

comment on column public.office_config.office_hours_allowed_weekdays
  is 'ISO day-of-week numbers enabled for check-in (1=Mon..7=Sun)';
comment on column public.office_config.office_hours_allow_weekends
  is 'Shortcut to allow weekend check-ins (testing)';
comment on column public.office_config.office_hours_extra_allowed_dates
  is 'Extra local-office dates enabled for check-in (YYYY-MM-DD), even if weekday is normally disabled';

-- 3) Policy helper: should office hours be enabled for this timestamp?
create or replace function public.is_office_hours_day_allowed(_ts timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg record;
  tz text;
  dow int;
  day date;
begin
  select
    oc.office_hours_allow_weekends as allow_weekends,
    oc.office_hours_allowed_weekdays as allowed_weekdays,
    oc.office_hours_extra_allowed_dates as extra_dates
  into cfg
  from public.office_config oc
  where oc.id = true;

  tz := public.office_timezone();
  dow := extract(isodow from (_ts at time zone tz))::int;
  day := (_ts at time zone tz)::date;

  if not found then
    return dow between 1 and 5;
  end if;

  if coalesce(cfg.allow_weekends, false) then
    return true;
  end if;

  if cfg.allowed_weekdays is not null and dow = any(cfg.allowed_weekdays) then
    return true;
  end if;

  if cfg.extra_dates is not null and day = any(cfg.extra_dates) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.is_office_hours_day_allowed(timestamptz) from public;
grant execute on function public.is_office_hours_day_allowed(timestamptz) to authenticated;
grant execute on function public.is_office_hours_day_allowed(timestamptz) to service_role;

-- 4) Patch check-in enforcement.
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

  if not public.is_office_hours_day_allowed(now()) then
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
    review_reason,
    requires_presence,
    last_presence_at
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
    null,
    true,
    now()
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

-- 5) Patch admin shift creation enforcement.
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

  -- Require the start and end to be on enabled days in office timezone.
  if not public.is_office_hours_day_allowed(_starts_at)
     or not public.is_office_hours_day_allowed(_ends_at - interval '1 second') then
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

