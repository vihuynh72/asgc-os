-- PATCH — Office Hours check-out without location
--
-- Policy:
-- - Manual checkout does not require lat/lon.
-- - If location is provided, record distance_m_at_checkout as before.

begin;

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

  dist := null;

  if _lat is not null and _lon is not null then
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
  end if;

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
      'needs_review', false,
      'method', case when _lat is null or _lon is null then 'manual_no_location' else 'manual_location' end
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

commit;

