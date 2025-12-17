-- PHASE 10 — Notifications plumbing (notification_log + admin-only visibility)
-- Source of truth: 01_stack_and_architecture.md (Phase 10), 02_data_model.md, 03_security_and_permissions.md

begin;

create extension if not exists pgcrypto;

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Who triggered this notification (admin for test sends)
  actor_user_id uuid null references public.profiles(id) on delete set null,

  -- Optional: recipient user (if known); for Phase 10 test sends we may only store to_email
  user_id uuid null references public.profiles(id) on delete set null,

  type text not null,
  channel text not null,
  provider text not null,

  to_email text not null,
  subject text null,

  status text not null,
  provider_message_id text null,
  error_message text null,

  metadata jsonb not null default '{}'::jsonb,

  constraint notification_log_type_nonempty check (char_length(btrim(type)) > 0),
  constraint notification_log_channel_check check (channel in ('email')),
  constraint notification_log_status_check check (status in ('queued', 'sent', 'failed')),
  constraint notification_log_to_email_nonempty check (char_length(btrim(to_email)) > 0)
);

create index if not exists notification_log_created_at_idx on public.notification_log (created_at desc);
create index if not exists notification_log_actor_user_id_idx on public.notification_log (actor_user_id);
create index if not exists notification_log_user_id_idx on public.notification_log (user_id);
create index if not exists notification_log_status_idx on public.notification_log (status);
create index if not exists notification_log_type_idx on public.notification_log (type);

alter table public.notification_log enable row level security;

-- Admin-only read. Writes are server-only via service role.
create policy "notification_log_select_admin"
  on public.notification_log
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.notification_log from authenticated;
grant select on table public.notification_log to authenticated;

commit;
