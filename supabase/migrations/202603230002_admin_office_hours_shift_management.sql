begin;

create or replace function public.admin_update_office_hour_shift(
  _shift_id uuid,
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
  shift_row public.office_hour_shifts;
  updated public.office_hour_shifts;
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

  select *
    into shift_row
  from public.office_hour_shifts s
  where s.id = _shift_id
  for update;

  if not found then
    raise exception 'shift_not_found';
  end if;

  if shift_row.status <> 'scheduled' then
    raise exception 'shift_not_editable';
  end if;

  if shift_row.starts_at <= now() then
    raise exception 'shift_already_started';
  end if;

  if _starts_at is null or _ends_at is null then
    raise exception 'time_required';
  end if;

  if _ends_at <= _starts_at then
    raise exception 'invalid_time_range';
  end if;

  if _starts_at <= now() then
    raise exception 'shift_must_be_future';
  end if;

  tz := public.office_timezone();
  if extract(isodow from (_starts_at at time zone tz))::int > 5
     or extract(isodow from (_ends_at at time zone tz))::int > 5 then
    raise exception 'weekend_not_allowed';
  end if;

  office_id := coalesce(_office_location_id, shift_row.office_location_id);

  update public.office_hour_shifts s
  set starts_at = _starts_at,
      ends_at = _ends_at,
      office_location_id = office_id
  where s.id = _shift_id
  returning * into updated;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.shift_updated',
    'office_hour_shift',
    updated.id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'starts_at', shift_row.starts_at,
        'ends_at', shift_row.ends_at,
        'office_location_id', shift_row.office_location_id
      ),
      'after', jsonb_build_object(
        'starts_at', updated.starts_at,
        'ends_at', updated.ends_at,
        'office_location_id', updated.office_location_id
      )
    )
  );

  return updated;
end;
$$;

revoke all on function public.admin_update_office_hour_shift(uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.admin_update_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_update_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to service_role;

create or replace function public.admin_cancel_office_hour_shift(_shift_id uuid)
returns public.office_hour_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.office_hour_shifts;
  updated public.office_hour_shifts;
  admin_info jsonb;
  admin_tier text;
  admin_is_evp boolean;
  resolved_requests integer := 0;
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

  select *
    into shift_row
  from public.office_hour_shifts s
  where s.id = _shift_id
  for update;

  if not found then
    raise exception 'shift_not_found';
  end if;

  if shift_row.status <> 'scheduled' then
    raise exception 'shift_not_cancellable';
  end if;

  if shift_row.starts_at <= now() then
    raise exception 'shift_already_started';
  end if;

  update public.office_hour_shifts s
  set status = 'cancelled'
  where s.id = _shift_id
  returning * into updated;

  update public.coverage_requests cr
  set status = 'cancelled',
      cancelled_at = coalesce(cr.cancelled_at, now())
  where cr.shift_id = _shift_id
    and cr.status in ('open', 'claimed');

  get diagnostics resolved_requests = row_count;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.shift_cancelled',
    'office_hour_shift',
    updated.id,
    jsonb_build_object(
      'starts_at', shift_row.starts_at,
      'ends_at', shift_row.ends_at,
      'office_location_id', shift_row.office_location_id,
      'coverage_requests_cancelled', resolved_requests
    )
  );

  return updated;
end;
$$;

revoke all on function public.admin_cancel_office_hour_shift(uuid) from public;
grant execute on function public.admin_cancel_office_hour_shift(uuid) to authenticated;
grant execute on function public.admin_cancel_office_hour_shift(uuid) to service_role;

commit;
