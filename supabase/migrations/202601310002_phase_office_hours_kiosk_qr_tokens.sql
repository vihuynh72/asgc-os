-- PHASE — Office Hours kiosk QR tokens (mobile-friendly)
--
-- Purpose:
-- - Kiosk device (in-office) issues short-lived, single-use tokens.
-- - Members scan QR on mobile to check in/out without background location.
-- - Session is marked requires_presence=false to avoid false mobile auto-checkouts.

begin;

create table if not exists public.office_hour_kiosk_tokens (
  token text primary key,
  action text not null,
  office_location_id uuid null references public.office_locations(id) on delete set null,
  distance_m integer null,
  within_radius boolean null,
  within_grace boolean null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  used_by_user_id uuid null references public.profiles(id) on delete set null,
  constraint office_hour_kiosk_tokens_action_check check (action in ('check_in','check_out')),
  constraint office_hour_kiosk_tokens_distance_nonnegative check (distance_m is null or distance_m >= 0)
);

create index if not exists office_hour_kiosk_tokens_expires_at_idx
  on public.office_hour_kiosk_tokens (expires_at);

create index if not exists office_hour_kiosk_tokens_used_at_idx
  on public.office_hour_kiosk_tokens (used_at);

alter table public.office_hour_kiosk_tokens enable row level security;

-- Server-only usage; keep fully locked down.
revoke all on table public.office_hour_kiosk_tokens from authenticated;
revoke all on table public.office_hour_kiosk_tokens from anon;

commit;

