-- PATCH — Remove Office Hours "needs_review" workflow
--
-- Rationale: The review flag created extra admin overhead and user confusion.
-- This patch:
-- - Stops setting needs_review / review_reason during check-in, check-out, and auto-close.
-- - Clears any existing needs_review / review_reason values on sessions.

begin;

-- 0) Clear existing flags/reasons (idempotent).
update public.office_hour_sessions
set needs_review = false,
    review_reason = null
where needs_review = true
   or review_reason is not null;

-- 1) Patch check-in RPC to never mark needs_review.
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

-- 2) Patch check-out RPC to never mark needs_review.
create or replace function public.check_out_office_hours(
  _lat double precision,
  _lon double precision
)
returns table (
  session_id uuid,
  checkin_at timestamptz,
  checkout_at timestamptz,
  duration_minutes integer,
  office_location_id uuid,
  distance_m_at_checkout integer,
  needs_review boolean,
  review_reason text
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
  dur_m integer;
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

  update public.office_hour_sessions as sess
  set
    checkout_at = now(),
    status = 'closed',
    distance_m_at_checkout = dist,
    needs_review = false,
    review_reason = null
  where sess.id = s.id
  returning sess.* into s;

  dur_m := greatest(round(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0)::int, 0);

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    uid,
    'office_hours.check_out',
    'office_hour_session',
    s.id,
    jsonb_build_object(
      'office_location_id', office_id,
      'distance_m_at_checkout', dist,
      'duration_minutes', dur_m,
      'needs_review', false
    )
  );

  return query
  select
    s.id,
    s.checkin_at,
    s.checkout_at,
    dur_m,
    s.office_location_id,
    s.distance_m_at_checkout,
    false,
    null;
end;
$$;

revoke all on function public.check_out_office_hours(double precision, double precision) from public;
grant execute on function public.check_out_office_hours(double precision, double precision) to authenticated;
grant execute on function public.check_out_office_hours(double precision, double precision) to service_role;

-- 3) Patch Phase 19 auto-close to not set needs_review / review_reason.
create or replace function public.auto_close_sessions(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  max_hours integer;
  tz text;
  closed_count integer;
  r record;
begin
  select oc.max_session_hours into max_hours
  from public.office_config oc where oc.id = true;

  if not found or max_hours is null or max_hours <= 0 then
    return 0;
  end if;

  tz := public.office_timezone();
  closed_count := 0;

  for r in
    update public.office_hour_sessions s
    set
      status = 'auto_closed',
      checkout_at = _now,
      needs_review = false,
      review_reason = null
    where s.status = 'open'
      and s.checkout_at is null
      and _now >= (s.checkin_at + make_interval(hours => max_hours))
    returning s.id as session_id, s.user_id, s.checkin_at, s.checkout_at
  loop
    closed_count := closed_count + 1;

    -- Audit log
    insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
    values (
      null,
      'office_hours.session_auto_closed',
      'office_hour_session',
      r.session_id,
      jsonb_build_object(
        'user_id', r.user_id,
        'checkin_at', r.checkin_at,
        'checkout_at', r.checkout_at,
        'max_hours', max_hours
      )
    );

    -- Notification
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
      r.user_id,
      'office_hours.session_auto_closed',
      'email',
      'resend',
      pp.email,
      'Your office hours session was auto-closed',
      'queued',
      public.defer_if_quiet_hours(_now),
      'office_hours.session_auto_closed:' || r.session_id::text,
      jsonb_build_object(
        'session_id', r.session_id,
        'checkin_at', r.checkin_at,
        'checkout_at', r.checkout_at,
        'office_tz', tz,
        'checkin_at_local', to_char(r.checkin_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
        'checkout_at_local', to_char(r.checkout_at at time zone tz, 'YYYY-MM-DD HH24:MI')
      )
    from public.profile_private pp
    where pp.id = r.user_id
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
    on conflict (dedupe_key) do nothing;
  end loop;

  return closed_count;
end;
$$;

revoke all on function public.auto_close_sessions(timestamptz) from public;
revoke all on function public.auto_close_sessions(timestamptz) from authenticated;
grant execute on function public.auto_close_sessions(timestamptz) to service_role;

commit;

