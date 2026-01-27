-- PATCH — Office Hours strict presence timeout: clamp checkout timestamp
--
-- Motivation:
-- - Vercel Hobby cron has hourly precision and can run late within the hour.
-- - If we set `checkout_at = now()` during stale-presence auto-checkout, we can over-credit time.
-- - Instead, clamp `checkout_at` to the 15-minute timeout boundary based on `last_presence_at`.
--
-- Also adds defense-in-depth:
-- - If a client heartbeat arrives after the timeout window, close the session immediately
--   (prevents "reviving" a stale session when cron is delayed).

begin;

-- 1) Heartbeat RPC: close stale sessions at the timeout boundary (strict).
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
  timeout_at timestamptz;
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

  -- Strict timeout: if presence has already gone stale, close at the timeout boundary.
  timeout_at := coalesce(s.last_presence_at, s.checkin_at) + interval '15 minutes';
  if coalesce(s.last_presence_at, s.checkin_at) <= (now() - interval '15 minutes') then
    update public.office_hour_sessions as sess
    set
      checkout_at = timeout_at,
      status = 'closed',
      distance_m_at_checkout = null,
      needs_review = false,
      review_reason = null
    where sess.id = s.id
    returning sess.* into s;

    insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
    values (
      null,
      'office_hours.session_auto_checked_out',
      'office_hour_session',
      s.id,
      jsonb_build_object(
        'reason', 'presence_timeout',
        'timeout_minutes', 15,
        'user_id', uid,
        'checkin_at', s.checkin_at,
        'last_presence_at', s.last_presence_at,
        'checkout_at', timeout_at,
        'trigger', 'presence_heartbeat'
      )
    );

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

-- 2) Cron enforcement: also clamp checkout timestamp to timeout boundary.
create or replace function public.auto_checkout_stale_presence(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
  r record;
  timeout_at timestamptz;
begin
  closed_count := 0;

  for r in
    update public.office_hour_sessions as sess
    set
      checkout_at = (coalesce(sess.last_presence_at, sess.checkin_at) + interval '15 minutes'),
      status = 'closed',
      distance_m_at_checkout = null,
      needs_review = false,
      review_reason = null
    where sess.status = 'open'
      and sess.checkout_at is null
      and coalesce(sess.requires_presence, true) = true
      and coalesce(sess.last_presence_at, sess.checkin_at) <= (_now - interval '15 minutes')
    returning sess.id as session_id, sess.user_id, sess.checkin_at, sess.last_presence_at, sess.checkout_at
  loop
    closed_count := closed_count + 1;
    timeout_at := r.checkout_at;

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
        'last_presence_at', r.last_presence_at,
        'checkout_at', timeout_at,
        'trigger', 'cron'
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

