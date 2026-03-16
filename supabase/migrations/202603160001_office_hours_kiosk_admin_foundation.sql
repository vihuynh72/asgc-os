-- Office Hours kiosk Phase 1 foundation
-- - Adds per-member kiosk phone allowlist
-- - Adds kiosk SMS settings fields to office_config

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

commit;
