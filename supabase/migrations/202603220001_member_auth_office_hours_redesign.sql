alter table public.profile_private
  add column if not exists password_ready_at timestamptz null;

comment on column public.profile_private.password_ready_at is
  'First successful password setup/reset completed for the member-facing ASGC auth flow.';

create table if not exists public.login_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  challenge_kind text not null default 'password_signin',
  code_hash text not null,
  redirect_to text null,
  request_ip text null,
  user_agent text null,
  attempt_count integer not null default 0,
  send_count integer not null default 1,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  last_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint login_email_challenges_kind_check
    check (challenge_kind in ('password_signin')),
  constraint login_email_challenges_attempt_count_check
    check (attempt_count >= 0),
  constraint login_email_challenges_send_count_check
    check (send_count >= 1)
);

alter table public.login_email_challenges enable row level security;

drop trigger if exists trg_login_email_challenges_set_updated_at on public.login_email_challenges;
create trigger trg_login_email_challenges_set_updated_at
before update on public.login_email_challenges
for each row
execute function public.set_updated_at();

create index if not exists login_email_challenges_user_created_idx
  on public.login_email_challenges (user_id, created_at desc);

create index if not exists login_email_challenges_email_created_idx
  on public.login_email_challenges (email, created_at desc);

create index if not exists login_email_challenges_open_idx
  on public.login_email_challenges (expires_at, consumed_at)
  where consumed_at is null;

create table if not exists public.trusted_login_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  device_label text null,
  user_agent text null,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trusted_login_devices enable row level security;

drop trigger if exists trg_trusted_login_devices_set_updated_at on public.trusted_login_devices;
create trigger trg_trusted_login_devices_set_updated_at
before update on public.trusted_login_devices
for each row
execute function public.set_updated_at();

create index if not exists trusted_login_devices_user_idx
  on public.trusted_login_devices (user_id, created_at desc);

create index if not exists trusted_login_devices_active_idx
  on public.trusted_login_devices (user_id, expires_at)
  where revoked_at is null;

alter table public.office_hour_sessions
  drop constraint if exists office_hour_sessions_kiosk_auth_method_check;

alter table public.office_hour_sessions
  add constraint office_hour_sessions_kiosk_auth_method_check
  check (kiosk_auth_method is null or kiosk_auth_method in ('sms_otp', 'selfie'));

update public.office_hour_sessions
set kiosk_auth_method = 'selfie'
where kiosk_auth_method is null
  and kiosk_checkin_photo_path is not null;
