-- PHASE 18 — Reminders v1 (shift reminders + quiet-hours-aware notification queue)
-- Source of truth: 04_office_hours_spec.md (notifications + quiet hours + shifts)

begin;

-- 1) Config knobs (org-wide) for shifts + reminders.
alter table public.office_config
  add column if not exists shift_grace_minutes integer not null default 15;

alter table public.office_config
  add column if not exists reminder_shift_soon_minutes integer not null default 30;

alter table public.office_config
  add column if not exists reminder_shift_late_minutes integer not null default 15;

-- 2) Notification queue enhancements: idempotency + scheduling + locking + retries.
alter table public.notification_log
  add column if not exists send_after timestamptz not null default now();

alter table public.notification_log
  add column if not exists dedupe_key text null;

alter table public.notification_log
  add column if not exists attempt_count integer not null default 0;

alter table public.notification_log
  add column if not exists locked_at timestamptz null;

alter table public.notification_log
  add column if not exists locked_by text null;

alter table public.notification_log
  drop constraint if exists notification_log_attempt_count_nonnegative;

alter table public.notification_log
  add constraint notification_log_attempt_count_nonnegative check (attempt_count >= 0);

create index if not exists notification_log_send_after_idx
  on public.notification_log (status, send_after asc);

create index if not exists notification_log_locked_at_idx
  on public.notification_log (locked_at);

create unique index if not exists notification_log_dedupe_key_uq
  on public.notification_log (dedupe_key)
  where dedupe_key is not null;

-- 3) Quiet-hours deferral helper: if ts falls within quiet hours, return next quiet-hours end.
create or replace function public.defer_if_quiet_hours(ts timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  enabled boolean;
  start_t time;
  end_t time;
  tz text;
  local_ts timestamp;
  local_date date;
  end_local_ts timestamp;
begin
  select oc.quiet_hours_enabled, oc.quiet_hours_start_local, oc.quiet_hours_end_local
    into enabled, start_t, end_t
  from public.office_config oc
  where oc.id = true;

  if not found or not enabled then
    return ts;
  end if;

  if not public.is_quiet_hours(ts) then
    return ts;
  end if;

  tz := public.office_timezone();
  local_ts := ts at time zone tz;
  local_date := local_ts::date;

  -- If start < end, quiet window is same-day.
  -- If start > end, quiet window spans midnight.
  if start_t < end_t then
    end_local_ts := (local_date::timestamp + end_t);
  else
    if (local_ts::time) < end_t then
      end_local_ts := (local_date::timestamp + end_t);
    else
      end_local_ts := ((local_date + 1)::timestamp + end_t);
    end if;
  end if;

  -- Safety: ensure we move forward.
  if end_local_ts <= local_ts then
    end_local_ts := end_local_ts + interval '1 day';
  end if;

  return end_local_ts at time zone tz;
end;
$$;

revoke all on function public.defer_if_quiet_hours(timestamptz) from public;
revoke all on function public.defer_if_quiet_hours(timestamptz) from authenticated;
grant execute on function public.defer_if_quiet_hours(timestamptz) to authenticated;
grant execute on function public.defer_if_quiet_hours(timestamptz) to service_role;

-- 4) Enqueue shift reminders (idempotent).
create or replace function public.enqueue_shift_reminders(_now timestamptz default now())
returns table (queued_start_soon integer, queued_late integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  soon_min integer;
  late_min integer;
  grace_min integer;
  tz text;
  inserted_soon integer;
  inserted_late integer;
begin
  select oc.reminder_shift_soon_minutes, oc.reminder_shift_late_minutes, oc.shift_grace_minutes
    into soon_min, late_min, grace_min
  from public.office_config oc
  where oc.id = true;

  if not found then
    raise exception 'office_config_missing';
  end if;

  tz := public.office_timezone();

  -- Shift starts soon (T - soon_min)
  with candidates as (
    select
      s.id as shift_id,
      s.user_id,
      s.starts_at,
      s.ends_at,
      pp.email as to_email,
      greatest((s.starts_at - make_interval(mins => soon_min)), _now) as intended_send_at
    from public.office_hour_shifts s
    join public.profile_private pp on pp.id = s.user_id
    where s.status = 'scheduled'
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
      and s.starts_at > _now
      and (s.starts_at - make_interval(mins => soon_min)) <= _now
      and s.starts_at <= (_now + interval '36 hours')
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
    'office_hours.shift_start_soon',
    'email',
    'resend',
    c.to_email,
    'Office hours shift starts soon',
    'queued',
    public.defer_if_quiet_hours(c.intended_send_at),
    'office_hours.shift_start_soon:' || c.shift_id::text,
    jsonb_build_object(
      'shift_id', c.shift_id,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at,
      'office_tz', tz,
      'starts_at_local', to_char(c.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'ends_at_local', to_char(c.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI')
    )
  from candidates c
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_soon = row_count;

  -- Late to shift (T + late_min) if not checked in by start+grace.
  with candidates as (
    select
      s.id as shift_id,
      s.user_id,
      s.starts_at,
      s.ends_at,
      pp.email as to_email,
      greatest((s.starts_at + make_interval(mins => late_min)), _now) as intended_send_at
    from public.office_hour_shifts s
    join public.profile_private pp on pp.id = s.user_id
    where s.status = 'scheduled'
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
      and _now >= (s.starts_at + make_interval(mins => late_min))
      and _now < s.ends_at
      and not exists (
        select 1
        from public.office_hour_sessions sess
        where sess.user_id = s.user_id
          and sess.checkin_at <= (s.starts_at + make_interval(mins => grace_min))
          and (sess.checkout_at is null or sess.checkout_at >= s.starts_at)
          and sess.checkin_at <= s.ends_at
      )
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
    'office_hours.shift_late',
    'email',
    'resend',
    c.to_email,
    'You are late to your office hours shift',
    'queued',
    public.defer_if_quiet_hours(c.intended_send_at),
    'office_hours.shift_late:' || c.shift_id::text,
    jsonb_build_object(
      'shift_id', c.shift_id,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at,
      'office_tz', tz,
      'starts_at_local', to_char(c.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'ends_at_local', to_char(c.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI')
    )
  from candidates c
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_late = row_count;

  queued_start_soon := coalesce(inserted_soon, 0);
  queued_late := coalesce(inserted_late, 0);
  return next;
end;
$$;

revoke all on function public.enqueue_shift_reminders(timestamptz) from public;
revoke all on function public.enqueue_shift_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_shift_reminders(timestamptz) to service_role;

-- 5) Mark missed shifts (after end) + enqueue missed notification (idempotent).
create or replace function public.mark_missed_shifts(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  updated_count integer;
begin
  tz := public.office_timezone();

  with updated as (
    update public.office_hour_shifts s
    set status = 'missed'
    where s.status = 'scheduled'
      and _now >= s.ends_at
      and not exists (
        select 1
        from public.office_hour_sessions sess
        where sess.user_id = s.user_id
          and sess.checkin_at <= s.ends_at
          and (sess.checkout_at is null or sess.checkout_at >= s.starts_at)
      )
    returning s.id as shift_id, s.user_id, s.starts_at, s.ends_at
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
    u.user_id,
    'office_hours.shift_missed',
    'email',
    'resend',
    pp.email,
    'You missed your office hours shift',
    'queued',
    public.defer_if_quiet_hours(_now),
    'office_hours.shift_missed:' || u.shift_id::text,
    jsonb_build_object(
      'shift_id', u.shift_id,
      'starts_at', u.starts_at,
      'ends_at', u.ends_at,
      'office_tz', tz,
      'starts_at_local', to_char(u.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'ends_at_local', to_char(u.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI')
    )
  from updated u
  join public.profile_private pp on pp.id = u.user_id
  where pp.email is not null
    and char_length(btrim(pp.email)) > 0
  on conflict (dedupe_key) do nothing;

  get diagnostics updated_count = row_count;
  return coalesce(updated_count, 0);
end;
$$;

revoke all on function public.mark_missed_shifts(timestamptz) from public;
revoke all on function public.mark_missed_shifts(timestamptz) from authenticated;
grant execute on function public.mark_missed_shifts(timestamptz) to service_role;

-- 6) Claim a batch of queued notifications safely (concurrency-safe worker).
create or replace function public.claim_notification_log(
  _limit integer,
  _lock_id text,
  _type_prefix text default null
)
returns setof public.notification_log
language plpgsql
security definer
set search_path = public
as $$
begin
  if _limit is null or _limit <= 0 then
    raise exception 'limit_required';
  end if;

  if _lock_id is null or char_length(btrim(_lock_id)) = 0 then
    raise exception 'lock_id_required';
  end if;

  return query
  with c as (
    select nl.id
    from public.notification_log nl
    where nl.status = 'queued'
      and nl.send_after <= now()
      and (nl.locked_at is null or nl.locked_at < (now() - interval '10 minutes'))
      and (_type_prefix is null or nl.type like (_type_prefix || '%'))
    order by nl.send_after asc, nl.created_at asc
    limit _limit
    for update skip locked
  )
  update public.notification_log nl
  set locked_at = now(), locked_by = _lock_id
  from c
  where nl.id = c.id
  returning nl.*;
end;
$$;

revoke all on function public.claim_notification_log(integer, text, text) from public;
revoke all on function public.claim_notification_log(integer, text, text) from authenticated;
grant execute on function public.claim_notification_log(integer, text, text) to service_role;

commit;
