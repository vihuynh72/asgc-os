-- PATCH — Office Hours lab live wrappers
--
-- Adds shared internal helpers for:
-- - member check-in
-- - presence ping
-- - presence heartbeat
--
-- The public RPCs now delegate to these helpers.
-- Admin lab wrappers reuse the same logic with:
-- - explicit target user context
-- - audit logging disabled
-- - temporary session cleanup

begin;

create or replace function public._office_hours_check_in_core(
  _uid uuid,
  _lat double precision,
  _lon double precision,
  _now timestamptz default now(),
  _record_audit boolean default true
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
  if _uid is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_office_hours_day_allowed(_now) then
    raise exception 'weekend_not_allowed';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  if exists (
    select 1
    from public.office_hour_sessions sess
    where sess.user_id = _uid and sess.status = 'open' and sess.checkout_at is null
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
    _uid,
    office_id,
    _now,
    'open',
    in_radius,
    in_grace_band,
    dist,
    false,
    null,
    true,
    _now
  )
  returning * into s;

  if coalesce(_record_audit, true) then
    insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
    values (
      _uid,
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
  end if;

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
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public._office_hours_check_in_core(uid, _lat, _lon, now(), true);
end;
$$;

revoke all on function public.check_in_office_hours(double precision, double precision) from public;
grant execute on function public.check_in_office_hours(double precision, double precision) to authenticated;
grant execute on function public.check_in_office_hours(double precision, double precision) to service_role;

create or replace function public._office_hours_presence_ping_core(
  _uid uuid,
  _now timestamptz default now(),
  _record_audit boolean default true
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
  s public.office_hour_sessions;
  tz text;
  close_at timestamptz;
  last_seen timestamptz;
begin
  if _uid is null then
    raise exception 'unauthorized';
  end if;

  select sess.*
    into s
  from public.office_hour_sessions as sess
  where sess.user_id = _uid and sess.status = 'open' and sess.checkout_at is null
  order by sess.checkin_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no_open_session';
  end if;

  if coalesce(s.requires_presence, true) = false then
    return query select s.id, 'ignored';
    return;
  end if;

  tz := public.office_timezone();
  close_at := (date_trunc('day', (_now at time zone tz)) + time '17:00') at time zone tz;
  last_seen := coalesce(s.last_presence_at, s.checkin_at);

  if ((_now at time zone tz)::time >= time '17:00') and (last_seen <= (_now - interval '15 minutes')) then
    update public.office_hour_sessions as sess
    set
      checkout_at = greatest(close_at, (last_seen + interval '15 minutes')),
      status = 'auto_closed',
      distance_m_at_checkout = null,
      needs_review = false,
      review_reason = null
    where sess.id = s.id
    returning sess.* into s;

    if coalesce(_record_audit, true) then
      insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
      values (
        null,
        'office_hours.session_auto_checked_out',
        'office_hour_session',
        s.id,
        jsonb_build_object(
          'reason', 'presence_timeout_after_5pm',
          'timeout_minutes', 15,
          'office_tz', tz,
          'close_at', close_at,
          'user_id', _uid,
          'checkin_at', s.checkin_at,
          'last_presence_at', s.last_presence_at,
          'checkout_at', s.checkout_at,
          'trigger', 'presence_ping'
        )
      );
    end if;

    return query select s.id, 'checked_out';
    return;
  end if;

  update public.office_hour_sessions as sess
  set last_presence_at = _now
  where sess.id = s.id;

  return query select s.id, 'ok';
end;
$$;

create or replace function public.record_office_hours_presence_ping()
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
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public._office_hours_presence_ping_core(uid, now(), true);
end;
$$;

revoke all on function public.record_office_hours_presence_ping() from public;
grant execute on function public.record_office_hours_presence_ping() to authenticated;
grant execute on function public.record_office_hours_presence_ping() to service_role;

create or replace function public._office_hours_presence_core(
  _uid uuid,
  _lat double precision,
  _lon double precision,
  _now timestamptz default now(),
  _record_audit boolean default true
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
  s public.office_hour_sessions;
  office_id uuid;
  office_lat double precision;
  office_lon double precision;
  radius integer;
  grace integer;
  dist integer;
  tz text;
  close_at timestamptz;
  last_seen timestamptz;
begin
  if _uid is null then
    raise exception 'unauthorized';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  select sess.*
    into s
  from public.office_hour_sessions as sess
  where sess.user_id = _uid and sess.status = 'open' and sess.checkout_at is null
  order by sess.checkin_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no_open_session';
  end if;

  if coalesce(s.requires_presence, true) = false then
    return query select s.id, 'ignored';
    return;
  end if;

  tz := public.office_timezone();
  close_at := (date_trunc('day', (_now at time zone tz)) + time '17:00') at time zone tz;
  last_seen := coalesce(s.last_presence_at, s.checkin_at);

  if ((_now at time zone tz)::time >= time '17:00') and (last_seen <= (_now - interval '15 minutes')) then
    update public.office_hour_sessions as sess
    set
      checkout_at = greatest(close_at, (last_seen + interval '15 minutes')),
      status = 'auto_closed',
      distance_m_at_checkout = null,
      needs_review = false,
      review_reason = null
    where sess.id = s.id
    returning sess.* into s;

    if coalesce(_record_audit, true) then
      insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
      values (
        null,
        'office_hours.session_auto_checked_out',
        'office_hour_session',
        s.id,
        jsonb_build_object(
          'reason', 'presence_timeout_after_5pm',
          'timeout_minutes', 15,
          'office_tz', tz,
          'close_at', close_at,
          'user_id', _uid,
          'checkin_at', s.checkin_at,
          'last_presence_at', s.last_presence_at,
          'checkout_at', s.checkout_at,
          'trigger', 'presence_heartbeat'
        )
      );
    end if;

    return query select s.id, 'checked_out';
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
      checkout_at = _now,
      status = 'auto_closed',
      distance_m_at_checkout = dist,
      needs_review = false,
      review_reason = null
    where sess.id = s.id
    returning sess.* into s;

    if coalesce(_record_audit, true) then
      insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
      values (
        _uid,
        'office_hours.auto_check_out',
        'office_hour_session',
        s.id,
        jsonb_build_object(
          'reason', 'outside_geofence',
          'office_location_id', office_id,
          'distance_m_at_checkout', dist
        )
      );
    end if;

    return query select s.id, 'checked_out';
    return;
  end if;

  update public.office_hour_sessions as sess
  set last_presence_at = _now
  where sess.id = s.id;

  return query select s.id, 'ok';
end;
$$;

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
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public._office_hours_presence_core(uid, _lat, _lon, now(), true);
end;
$$;

revoke all on function public.record_office_hours_presence(double precision, double precision) from public;
grant execute on function public.record_office_hours_presence(double precision, double precision) to authenticated;
grant execute on function public.record_office_hours_presence(double precision, double precision) to service_role;

create or replace function public.admin_lab_check_in_office_hours(
  _user_id uuid,
  _lat double precision,
  _lon double precision,
  _now timestamptz default now()
)
returns table (
  session_id uuid,
  checkin_at timestamptz,
  office_location_id uuid,
  distance_m integer,
  within_radius boolean,
  within_grace boolean,
  needs_review boolean,
  review_reason text,
  cleanup_ok boolean,
  cleanup_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  cleanup_err text := null;
begin
  select * into r
  from public._office_hours_check_in_core(_user_id, _lat, _lon, _now, false);

  begin
    delete from public.office_hour_sessions
    where id = r.session_id;
  exception when others then
    cleanup_err := sqlerrm;
  end;

  return query
  select
    r.session_id,
    r.checkin_at,
    r.office_location_id,
    r.distance_m,
    r.within_radius,
    r.within_grace,
    r.needs_review,
    r.review_reason,
    cleanup_err is null,
    cleanup_err;
end;
$$;

create or replace function public.admin_lab_record_office_hours_presence_ping(
  _user_id uuid,
  _checkin_at timestamptz,
  _last_presence_at timestamptz default null,
  _requires_presence boolean default true,
  _now timestamptz default now()
)
returns table (
  session_id uuid,
  action text,
  cleanup_ok boolean,
  cleanup_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  temp_session public.office_hour_sessions;
  r record;
  office_id uuid;
  cleanup_err text := null;
begin
  if exists (
    select 1
    from public.office_hour_sessions sess
    where sess.user_id = _user_id and sess.status = 'open' and sess.checkout_at is null
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
    _user_id,
    office_id,
    _checkin_at,
    'open',
    true,
    false,
    0,
    false,
    null,
    coalesce(_requires_presence, true),
    coalesce(_last_presence_at, _checkin_at)
  )
  returning * into temp_session;

  begin
    select * into r
    from public._office_hours_presence_ping_core(_user_id, _now, false);
  exception when others then
    delete from public.office_hour_sessions where id = temp_session.id;
    raise;
  end;

  begin
    delete from public.office_hour_sessions where id = temp_session.id;
  exception when others then
    cleanup_err := sqlerrm;
  end;

  return query
  select
    r.session_id,
    r.action,
    cleanup_err is null,
    cleanup_err;
end;
$$;

create or replace function public.admin_lab_record_office_hours_presence(
  _user_id uuid,
  _checkin_at timestamptz,
  _last_presence_at timestamptz default null,
  _requires_presence boolean default true,
  _lat double precision default null,
  _lon double precision default null,
  _now timestamptz default now()
)
returns table (
  session_id uuid,
  action text,
  cleanup_ok boolean,
  cleanup_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  temp_session public.office_hour_sessions;
  r record;
  office_id uuid;
  cleanup_err text := null;
begin
  if exists (
    select 1
    from public.office_hour_sessions sess
    where sess.user_id = _user_id and sess.status = 'open' and sess.checkout_at is null
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
    _user_id,
    office_id,
    _checkin_at,
    'open',
    true,
    false,
    0,
    false,
    null,
    coalesce(_requires_presence, true),
    coalesce(_last_presence_at, _checkin_at)
  )
  returning * into temp_session;

  begin
    select * into r
    from public._office_hours_presence_core(_user_id, _lat, _lon, _now, false);
  exception when others then
    delete from public.office_hour_sessions where id = temp_session.id;
    raise;
  end;

  begin
    delete from public.office_hour_sessions where id = temp_session.id;
  exception when others then
    cleanup_err := sqlerrm;
  end;

  return query
  select
    r.session_id,
    r.action,
    cleanup_err is null,
    cleanup_err;
end;
$$;

revoke all on function public.admin_lab_check_in_office_hours(uuid, double precision, double precision, timestamptz) from public;
revoke all on function public.admin_lab_record_office_hours_presence_ping(uuid, timestamptz, timestamptz, boolean, timestamptz) from public;
revoke all on function public.admin_lab_record_office_hours_presence(uuid, timestamptz, timestamptz, boolean, double precision, double precision, timestamptz) from public;

grant execute on function public.admin_lab_check_in_office_hours(uuid, double precision, double precision, timestamptz) to service_role;
grant execute on function public.admin_lab_record_office_hours_presence_ping(uuid, timestamptz, timestamptz, boolean, timestamptz) to service_role;
grant execute on function public.admin_lab_record_office_hours_presence(uuid, timestamptz, timestamptz, boolean, double precision, double precision, timestamptz) to service_role;

commit;
