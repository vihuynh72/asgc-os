-- Office Hours session email reminders
-- - Replaces the old one-time open-session email with recurring hourly reminder emails
-- - Adds a single pre-auto-close warning 15 minutes before auto-close
-- - Leaves legacy SMS kiosk reminders in place for sms_otp sessions

begin;

create or replace function public.enqueue_session_checkout_email_reminders(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_minutes integer := 60;
  max_hours integer := 8;
  tz text;
  queued_count integer := 0;
begin
  select coalesce(oc.max_session_hours, 8)
    into max_hours
  from public.office_config oc
  where oc.id = true;

  if max_hours is null or max_hours <= 0 then
    max_hours := 8;
  end if;

  tz := public.office_timezone();

  with candidates as (
    select
      s.id as session_id,
      s.user_id,
      s.checkin_at,
      pp.email as to_email,
      coalesce(
        s.next_checkout_reminder_at,
        s.checkin_at + make_interval(mins => reminder_minutes)
      ) as scheduled_at,
      s.checkin_at + make_interval(hours => max_hours) as auto_close_at
    from public.office_hour_sessions s
    join public.profile_private pp on pp.id = s.user_id
    where s.status = 'open'
      and s.checkout_at is null
      and coalesce(s.kiosk_auth_method, '') <> 'sms_otp'
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
      and coalesce(
        s.next_checkout_reminder_at,
        s.checkin_at + make_interval(mins => reminder_minutes)
      ) <= _now
      and _now < (s.checkin_at + make_interval(hours => max_hours))
  ),
  queued as (
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
      'office_hours.session_checkout_reminder',
      'email',
      'resend',
      c.to_email,
      'Your office hours session is still open',
      'queued',
      public.defer_if_quiet_hours(_now),
      'office_hours.session_checkout_reminder:' || c.session_id::text || ':' || extract(epoch from c.scheduled_at)::bigint::text,
      jsonb_build_object(
        'session_id', c.session_id,
        'checkin_at', c.checkin_at,
        'scheduled_at', c.scheduled_at,
        'auto_close_at', c.auto_close_at,
        'elapsed_minutes', greatest(round(extract(epoch from (_now - c.checkin_at)) / 60.0), 0),
        'office_tz', tz,
        'checkin_at_local', to_char(c.checkin_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
        'auto_close_at_local', to_char(c.auto_close_at at time zone tz, 'YYYY-MM-DD HH24:MI')
      )
    from candidates c
    on conflict (dedupe_key) do nothing
    returning
      (metadata->>'session_id')::uuid as session_id
  ),
  updated as (
    update public.office_hour_sessions s
    set
      last_checkout_reminder_at = _now,
      next_checkout_reminder_at = _now + make_interval(mins => reminder_minutes)
    from queued q
    where s.id = q.session_id
    returning s.id
  )
  select count(*) into queued_count from queued;

  return coalesce(queued_count, 0);
end;
$$;

revoke all on function public.enqueue_session_checkout_email_reminders(timestamptz) from public;
revoke all on function public.enqueue_session_checkout_email_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_session_checkout_email_reminders(timestamptz) to service_role;

create or replace function public.enqueue_session_auto_close_soon_reminders(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  warning_minutes integer := 15;
  max_hours integer := 8;
  tz text;
  queued_count integer := 0;
begin
  select coalesce(oc.max_session_hours, 8)
    into max_hours
  from public.office_config oc
  where oc.id = true;

  if max_hours is null or max_hours <= 0 then
    max_hours := 8;
  end if;

  tz := public.office_timezone();

  with candidates as (
    select
      s.id as session_id,
      s.user_id,
      s.checkin_at,
      pp.email as to_email,
      s.checkin_at + make_interval(hours => max_hours) as auto_close_at,
      s.checkin_at + make_interval(hours => max_hours) - make_interval(mins => warning_minutes) as warning_at
    from public.office_hour_sessions s
    join public.profile_private pp on pp.id = s.user_id
    where s.status = 'open'
      and s.checkout_at is null
      and coalesce(s.kiosk_auth_method, '') <> 'sms_otp'
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
      and _now >= (s.checkin_at + make_interval(hours => max_hours) - make_interval(mins => warning_minutes))
      and _now < (s.checkin_at + make_interval(hours => max_hours))
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
    'office_hours.session_auto_close_soon',
    'email',
    'resend',
    c.to_email,
    'Your office hours session will auto-close soon',
    'queued',
    public.defer_if_quiet_hours(_now),
    'office_hours.session_auto_close_soon:' || c.session_id::text,
    jsonb_build_object(
      'session_id', c.session_id,
      'checkin_at', c.checkin_at,
      'warning_at', c.warning_at,
      'auto_close_at', c.auto_close_at,
      'minutes_remaining', warning_minutes,
      'office_tz', tz,
      'checkin_at_local', to_char(c.checkin_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'auto_close_at_local', to_char(c.auto_close_at at time zone tz, 'YYYY-MM-DD HH24:MI')
    )
  from candidates c
  on conflict (dedupe_key) do nothing;

  get diagnostics queued_count = row_count;
  return coalesce(queued_count, 0);
end;
$$;

revoke all on function public.enqueue_session_auto_close_soon_reminders(timestamptz) from public;
revoke all on function public.enqueue_session_auto_close_soon_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_session_auto_close_soon_reminders(timestamptz) to service_role;

commit;
