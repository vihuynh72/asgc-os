-- PATCH — Office Hours strict presence (heartbeat + stale auto-checkout)
--
-- Adds:
-- - office_hour_sessions.requires_presence + last_presence_at
-- - record_office_hours_presence RPC (client heartbeat)
-- - auto_checkout_stale_presence RPC (server cron enforcement)
--
-- Design goals:
-- - Enforce presence even when the tab is closed (cron)
-- - Store minimal data (timestamps + distance only; no raw coordinates)
-- - Exclude kiosk sessions (requires_presence=false)

begin;

-- 1) Session fields for presence enforcement.
alter table public.office_hour_sessions
  add column if not exists requires_presence boolean not null default true;

alter table public.office_hour_sessions
  add column if not exists last_presence_at timestamptz null;

-- Backfill so existing open sessions don't immediately violate NULL presence.
update public.office_hour_sessions as sess
set last_presence_at = sess.checkin_at
where sess.status = 'open'
  and sess.checkout_at is null
  and sess.last_presence_at is null
  and coalesce(sess.requires_presence, true) = true;

create index if not exists office_hour_sessions_open_last_presence_idx
  on public.office_hour_sessions (last_presence_at)
  where status = 'open' and checkout_at is null and requires_presence = true;

-- 2) Check-in sets initial last_presence_at.
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

-- 3) Heartbeat RPC: update presence or check out if outside grace.
create or replace function public.record_office_hours_presence(
  _lat double precision,
  _lon double precision
)
returns table (
  session_id uuid,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  s public.office_hour_sessions;
  office_id uuid;
  office_lat double precision;
  office_lon double precision;
  radius integer;
  grace integer;
  dist integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  select sess.*
    into s
  from public.office_hour_sessions as sess
  where sess.user_id = uid and sess.status = 'open' and sess.checkout_at is null
  order by sess.checkin_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no_open_session';
  end if;

  -- Some sessions (kiosk) are intentionally excluded from strict presence enforcement.
  if coalesce(s.requires_presence, true) = false then
    return query select s.id, 'ignored';
    return;
  end if;

  office_id := s.office_location_id;
  if office_id is null then
    select oc.primary_office_location_id into office_id
    from public.office_config oc
    where oc.id = true;
  end if;

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
    update public.office_hour_sessions as sess
    set
      checkout_at = now(),
      status = 'closed',
      distance_m_at_checkout = dist,
      needs_review = false,
      review_reason = null
    where sess.id = s.id
    returning sess.* into s;

    insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
    values (
      uid,
      'office_hours.auto_check_out',
      'office_hour_session',
      s.id,
      jsonb_build_object(
        'reason', 'outside_geofence',
        'office_location_id', office_id,
        'distance_m_at_checkout', dist
      )
    );

    return query select s.id, 'checked_out';
    return;
  end if;

  update public.office_hour_sessions as sess
  set last_presence_at = now()
  where sess.id = s.id;

  return query select s.id, 'ok';
end;
$$;

revoke all on function public.record_office_hours_presence(double precision, double precision) from public;
grant execute on function public.record_office_hours_presence(double precision, double precision) to authenticated;
grant execute on function public.record_office_hours_presence(double precision, double precision) to service_role;

-- 4) Cron enforcement: auto-checkout if no successful presence in 15 minutes.
create or replace function public.auto_checkout_stale_presence(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
  r record;
begin
  closed_count := 0;

  for r in
    update public.office_hour_sessions as sess
    set
      checkout_at = _now,
      status = 'closed',
      distance_m_at_checkout = null,
      needs_review = false,
      review_reason = null
    where sess.status = 'open'
      and sess.checkout_at is null
      and coalesce(sess.requires_presence, true) = true
      and coalesce(sess.last_presence_at, sess.checkin_at) <= (_now - interval '15 minutes')
    returning sess.id as session_id, sess.user_id, sess.checkin_at, sess.last_presence_at
  loop
    closed_count := closed_count + 1;

    insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
    values (
      null,
      'office_hours.session_auto_checked_out',
      'office_hour_session',
      r.session_id,
      jsonb_build_object(
        'reason', 'presence_timeout',
        'timeout_minutes', 15,
        'user_id', r.user_id,
        'checkin_at', r.checkin_at,
        'last_presence_at', r.last_presence_at
      )
    );
  end loop;

  return closed_count;
end;
$$;

revoke all on function public.auto_checkout_stale_presence(timestamptz) from public;
revoke all on function public.auto_checkout_stale_presence(timestamptz) from authenticated;
grant execute on function public.auto_checkout_stale_presence(timestamptz) to service_role;

commit;

