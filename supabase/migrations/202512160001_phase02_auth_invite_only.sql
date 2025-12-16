-- PHASE 02 — Auth (invite-only)
-- Source of truth: 01_stack_and_architecture.md (PHASE 02), 02_data_model.md (IDENTITY), 03_security_and_permissions.md (invite-only + RLS)

begin;

-- Common extension for UUID generation (safe if already enabled)
create extension if not exists pgcrypto;

-- 1) Allowlist: controls who is allowed to request an auth link.
-- Best practice: store a normalized (lowercased + trimmed) version and enforce uniqueness on it.
-- This table is sensitive; enable RLS and do not create client-facing SELECT policies.
create table if not exists public.invites_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  is_active boolean not null default true,
  invited_by uuid null,
  invited_at timestamptz not null default now(),
  revoked_at timestamptz null,
  notes text null,
  constraint invites_allowlist_email_nonempty check (char_length(btrim(email)) > 0)
);

create unique index if not exists invites_allowlist_email_normalized_uniq
  on public.invites_allowlist (email_normalized);

alter table public.invites_allowlist enable row level security;

-- Intentionally no RLS policies in PHASE 02.
-- Access is via server-only service role (trusted).

-- 2) Profiles: app identity record tied 1:1 with auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text null,
  display_name text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_status_check check (status in ('active', 'inactive'))
);

create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

-- Minimal PHASE 02 RLS:
-- - A signed-in user may read their own profile.
-- - A signed-in user may update their own profile.
-- Directory-style reads are a PHASE 04 concern; do not invent policy here.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- 3) Auth trigger: auto-create profile row when a new auth user is created.
-- Note: RLS is enabled, but table owners (migration role) bypass RLS unless FORCE is enabled.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, null)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

-- Ensure the trigger exists on auth.users.
-- (Supabase uses auth.users; this trigger runs after user creation.)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

commit;
