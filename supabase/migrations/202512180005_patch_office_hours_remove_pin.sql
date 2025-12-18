-- PATCH — Remove Office PIN from Office Hours
-- - Removes Phase 13 presence PIN machinery (tables + RPCs)
-- - Updates Office Hours check-in/out RPCs to require only geolocation

begin;

-- 1) Replace check-in/out RPCs with no-PIN variants.
drop function if exists public.check_in_office_hours(double precision, double precision, text);
drop function if exists public.check_out_office_hours(double precision, double precision, text);

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
  reason text;
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
  );

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

revoke all on function public.check_in_office_hours(double precision, double precision) from public;
grant execute on function public.check_in_office_hours(double precision, double precision) to authenticated;
grant execute on function public.check_in_office_hours(double precision, double precision) to service_role;

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
  reason text;
  should_review boolean;
  dur_m integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if _lat is null or _lon is null then
    raise exception 'location_required';
  end if;

  select *
    into s
  from public.office_hour_sessions
  where user_id = uid and status = 'open' and checkout_at is null
  order by checkin_at desc
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

  -- Spec: checkout far away => close, but flag needs_review.
  if dist > grace then
    reason := 'checkout_outside_grace';
    should_review := true;
  elsif dist > radius then
    reason := 'checkout_within_grace';
    should_review := true;
  else
    reason := null;
    should_review := false;
  end if;

  update public.office_hour_sessions
  set
    checkout_at = now(),
    status = 'closed',
    distance_m_at_checkout = dist,
    needs_review = (coalesce(needs_review, false) or should_review),
    review_reason = case
      when reason is null then review_reason
      when review_reason is null or char_length(btrim(review_reason)) = 0 then reason
      else review_reason || ';' || reason
    end
  where id = s.id
  returning * into s;

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
      'needs_review', s.needs_review,
      'review_reason', s.review_reason
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
    s.needs_review,
    s.review_reason;
end;
$$;

revoke all on function public.check_out_office_hours(double precision, double precision) from public;
grant execute on function public.check_out_office_hours(double precision, double precision) to authenticated;
grant execute on function public.check_out_office_hours(double precision, double precision) to service_role;

-- 2) Remove PIN token machinery (Phase 13).
drop function if exists public.issue_presence_pin(uuid);
drop function if exists public.validate_presence_pin(uuid, text, timestamptz);
drop table if exists public.presence_tokens;
drop table if exists public.presence_token_secrets;

commit;

