-- Office Hours kiosk SMS OTP workflow
-- - Adds per-member kiosk phone allowlist
-- - Adds kiosk OTP challenges
-- - Extends office_hour_sessions with kiosk SMS metadata
-- - Extends notification_log for SMS delivery
-- - Adds hourly checkout reminder enqueue function

begin;

create table if not exists public.office_hours_kiosk_phone_allowlist (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null unique,
  phone_last4 text not null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hours_kiosk_phone_allowlist_phone_last4_check check (char_length(phone_last4) = 4),
  constraint office_hours_kiosk_phone_allowlist_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$')
);

alter table public.office_hours_kiosk_phone_allowlist enable row level security;

drop policy if exists "office_hours_kiosk_phone_allowlist_select_admin" on public.office_hours_kiosk_phone_allowlist;
create policy "office_hours_kiosk_phone_allowlist_select_admin"
  on public.office_hours_kiosk_phone_allowlist
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop trigger if exists trg_office_hours_kiosk_phone_allowlist_set_updated_at on public.office_hours_kiosk_phone_allowlist;
create trigger trg_office_hours_kiosk_phone_allowlist_set_updated_at
before update on public.office_hours_kiosk_phone_allowlist
for each row
execute function public.set_updated_at();

create table if not exists public.office_hours_kiosk_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone_e164 text not null,
  intent text not null,
  code_hash text not null,
  attempt_count integer not null default 0,
  send_count integer not null default 1,
  expires_at timestamptz not null,
  verified_at timestamptz null,
  verification_token text null,
  verification_expires_at timestamptz null,
  used_at timestamptz null,
  request_ip text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hours_kiosk_otp_challenges_intent_check check (intent in ('check_in', 'check_out')),
  constraint office_hours_kiosk_otp_challenges_attempt_count_check check (attempt_count >= 0),
  constraint office_hours_kiosk_otp_challenges_send_count_check check (send_count >= 1),
  constraint office_hours_kiosk_otp_challenges_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$')
);

create index if not exists office_hours_kiosk_otp_challenges_user_intent_idx
  on public.office_hours_kiosk_otp_challenges (user_id, intent, created_at desc);

create index if not exists office_hours_kiosk_otp_challenges_expires_idx
  on public.office_hours_kiosk_otp_challenges (expires_at);

create unique index if not exists office_hours_kiosk_otp_challenges_verification_token_uq
  on public.office_hours_kiosk_otp_challenges (verification_token);

alter table public.office_hours_kiosk_otp_challenges enable row level security;

drop trigger if exists trg_office_hours_kiosk_otp_challenges_set_updated_at on public.office_hours_kiosk_otp_challenges;
create trigger trg_office_hours_kiosk_otp_challenges_set_updated_at
before update on public.office_hours_kiosk_otp_challenges
for each row
execute function public.set_updated_at();

alter table public.office_hour_sessions
  add column if not exists kiosk_auth_method text null,
  add column if not exists kiosk_phone_e164 text null,
  add column if not exists kiosk_phone_last4 text null,
  add column if not exists kiosk_otp_verified_at timestamptz null,
  add column if not exists last_checkout_reminder_at timestamptz null,
  add column if not exists next_checkout_reminder_at timestamptz null;

alter table public.office_hour_sessions
  drop constraint if exists office_hour_sessions_kiosk_auth_method_check;

alter table public.office_hour_sessions
  add constraint office_hour_sessions_kiosk_auth_method_check
  check (kiosk_auth_method is null or kiosk_auth_method in ('sms_otp'));

alter table public.notification_log
  alter column to_email drop not null;

alter table public.notification_log
  add column if not exists to_phone text null;

alter table public.notification_log
  drop constraint if exists notification_log_channel_check;

alter table public.notification_log
  add constraint notification_log_channel_check
  check (channel in ('email', 'sms'));

alter table public.notification_log
  drop constraint if exists notification_log_to_email_nonempty;

alter table public.notification_log
  drop constraint if exists notification_log_recipient_present_check;

alter table public.notification_log
  add constraint notification_log_recipient_present_check
  check (
    (channel = 'email' and to_email is not null and char_length(btrim(to_email)) > 0)
    or
    (channel = 'sms' and to_phone is not null and char_length(btrim(to_phone)) > 0)
  );

alter table public.office_config
  add column if not exists kiosk_sms_enabled boolean not null default false,
  add column if not exists kiosk_otp_ttl_minutes integer not null default 5,
  add column if not exists kiosk_checkout_reminder_interval_minutes integer not null default 60;

alter table public.office_config
  drop constraint if exists office_config_kiosk_otp_ttl_minutes_check;

alter table public.office_config
  add constraint office_config_kiosk_otp_ttl_minutes_check
  check (kiosk_otp_ttl_minutes between 1 and 30);

alter table public.office_config
  drop constraint if exists office_config_kiosk_checkout_reminder_interval_minutes_check;

alter table public.office_config
  add constraint office_config_kiosk_checkout_reminder_interval_minutes_check
  check (kiosk_checkout_reminder_interval_minutes between 15 and 240);

create or replace function public.enqueue_kiosk_checkout_sms_reminders(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_minutes integer := 60;
  queued_count integer := 0;
begin
  select coalesce(oc.kiosk_checkout_reminder_interval_minutes, 60)
    into reminder_minutes
  from public.office_config oc
  where oc.id = true;

  if reminder_minutes is null or reminder_minutes <= 0 then
    reminder_minutes := 60;
  end if;

  with candidates as (
    select
      s.id as session_id,
      s.user_id,
      s.checkin_at,
      s.kiosk_phone_e164 as to_phone,
      coalesce(
        s.next_checkout_reminder_at,
        s.checkin_at + make_interval(mins => reminder_minutes)
      ) as scheduled_at
    from public.office_hour_sessions s
    where s.status = 'open'
      and s.checkout_at is null
      and s.kiosk_auth_method = 'sms_otp'
      and s.kiosk_phone_e164 is not null
      and char_length(btrim(s.kiosk_phone_e164)) > 0
      and coalesce(
        s.next_checkout_reminder_at,
        s.checkin_at + make_interval(mins => reminder_minutes)
      ) <= _now
  ),
  queued as (
    insert into public.notification_log (
      actor_user_id,
      user_id,
      type,
      channel,
      provider,
      to_phone,
      subject,
      status,
      send_after,
      dedupe_key,
      metadata
    )
    select
      null,
      c.user_id,
      'office_hours.kiosk_checkout_reminder',
      'sms',
      'twilio',
      c.to_phone,
      null,
      'queued',
      public.defer_if_quiet_hours(_now),
      'office_hours.kiosk_checkout_reminder:' || c.session_id::text || ':' || extract(epoch from c.scheduled_at)::bigint::text,
      jsonb_build_object(
        'session_id', c.session_id,
        'checkin_at', c.checkin_at,
        'scheduled_at', c.scheduled_at,
        'elapsed_minutes', greatest(round(extract(epoch from (c.scheduled_at - c.checkin_at)) / 60.0), 0)
      )
    from candidates c
    on conflict (dedupe_key) do nothing
    returning
      (metadata->>'session_id')::uuid as session_id,
      (metadata->>'scheduled_at')::timestamptz as scheduled_at
  ),
  updated as (
    update public.office_hour_sessions s
    set
      last_checkout_reminder_at = q.scheduled_at,
      next_checkout_reminder_at = q.scheduled_at + make_interval(mins => reminder_minutes)
    from queued q
    where s.id = q.session_id
    returning s.id
  )
  select count(*) into queued_count from queued;

  return coalesce(queued_count, 0);
end;
$$;

revoke all on function public.enqueue_kiosk_checkout_sms_reminders(timestamptz) from public;
revoke all on function public.enqueue_kiosk_checkout_sms_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_kiosk_checkout_sms_reminders(timestamptz) to service_role;

commit;
