-- PHASE 19 — Auto-close forgotten sessions + long-session reminders
-- Source of truth: 04_office_hours_spec.md (auto-close, reminders)

begin;

-- 1) Config knobs for auto-close and open-session reminders.
alter table public.office_config
  add column if not exists max_session_hours integer not null default 8;

alter table public.office_config
  add column if not exists reminder_session_open_hours integer not null default 2;

-- 2) Enqueue "session still open" reminders (idempotent).
create or replace function public.enqueue_session_open_reminders(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_hours integer;
  tz text;
  inserted_count integer;
begin
  select oc.reminder_session_open_hours into reminder_hours
  from public.office_config oc where oc.id = true;

  if not found or reminder_hours is null or reminder_hours <= 0 then
    return 0;
  end if;

  tz := public.office_timezone();

  with candidates as (
    select
      s.id as session_id,
      s.user_id,
      s.checkin_at,
      pp.email as to_email
    from public.office_hour_sessions s
    join public.profile_private pp on pp.id = s.user_id
    where s.status = 'open'
      and s.checkout_at is null
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
      and _now >= (s.checkin_at + make_interval(hours => reminder_hours))
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
    'office_hours.session_open_long',
    'email',
    'resend',
    c.to_email,
    'Your office hours session is still open',
    'queued',
    public.defer_if_quiet_hours(_now),
    'office_hours.session_open_long:' || c.session_id::text,
    jsonb_build_object(
      'session_id', c.session_id,
      'checkin_at', c.checkin_at,
      'office_tz', tz,
      'checkin_at_local', to_char(c.checkin_at at time zone tz, 'YYYY-MM-DD HH24:MI')
    )
  from candidates c
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return coalesce(inserted_count, 0);
end;
$$;

revoke all on function public.enqueue_session_open_reminders(timestamptz) from public;
revoke all on function public.enqueue_session_open_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_session_open_reminders(timestamptz) to service_role;

-- 3) Auto-close sessions open longer than max_session_hours.
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
      duration_minutes = greatest(round(extract(epoch from (_now - s.checkin_at)) / 60.0)::int, 0),
      needs_review = true,
      review_reason = coalesce(s.review_reason || '; ', '') || 'auto-closed after ' || max_hours || 'h'
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
