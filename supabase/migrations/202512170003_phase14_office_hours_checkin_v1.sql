-- PHASE 14 — Office Hours check-in v1
-- Source of truth: 04_office_hours_spec.md (check-in), 01_stack_and_architecture.md (Phase 14)

begin;

-- 1) Add explicit review flag (spec uses "needs_review").
alter table public.office_hour_sessions
  add column if not exists needs_review boolean not null default false;

alter table public.office_hour_sessions
  add column if not exists review_reason text null;

-- 2) Canonical distance helper (no PostGIS dependency).
create or replace function public.haversine_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns integer
language sql
stable
as $$
  select round(
    2 * 6371000 * asin(
      sqrt(
        pow(sin(((lat2 - lat1) * pi() / 180) / 2), 2)
        + cos(lat1 * pi() / 180) * cos(lat2 * pi() / 180)
        * pow(sin(((lon2 - lon1) * pi() / 180) / 2), 2)
      )
    )
  )::int;
$$;

revoke all on function public.haversine_meters(double precision, double precision, double precision, double precision) from public;
revoke all on function public.haversine_meters(double precision, double precision, double precision, double precision) from authenticated;

-- 3) Check-in RPC: validates PIN + geofence server-side and creates an open session.
create or replace function public.check_in_office_hours(
  _lat double precision,
  _lon double precision,
  _pin text
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
  reason text;
  in_radius boolean;
  in_grace_band boolean;
  audit_id uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  if _pin is null or char_length(btrim(_pin)) = 0 then
    raise exception 'pin_required';
  end if;

  if exists (
    select 1
    from public.office_hour_sessions
    where user_id = uid and status = 'open' and checkout_at is null
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

  -- PIN validation is privileged (Phase 13). This function runs as definer.
  if not public.validate_presence_pin(office_id, _pin) then
    raise exception 'invalid_pin';
  end if;

  dist := public.haversine_meters(_lat, _lon, office_lat, office_lon);

  if dist > grace then
    raise exception 'outside_geofence';
  end if;

  in_radius := (dist <= radius);
  in_grace_band := (dist > radius and dist <= grace);

  if in_grace_band then
    reason := 'checkin_within_grace';
  else
    reason := null;
  end if;

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
    in_grace_band,
    reason
  )
  returning * into s;

  -- Audit log (Phase 05 pattern): write from privileged context.
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
      'needs_review', in_grace_band
    )
  )
  returning id into audit_id;

  return query
  select
    s.id,
    s.checkin_at,
    s.office_location_id,
    s.distance_m_at_checkin,
    s.within_radius,
    s.within_grace,
    s.needs_review,
    s.review_reason;
end;
$$;

revoke all on function public.check_in_office_hours(double precision, double precision, text) from public;
grant execute on function public.check_in_office_hours(double precision, double precision, text) to authenticated;
grant execute on function public.check_in_office_hours(double precision, double precision, text) to service_role;

commit;
