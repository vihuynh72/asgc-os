-- PHASE 05 — Audit log v1 + invariants + admin helpers
-- Source of truth: 02_data_model.md, 03_security_and_permissions.md

begin;

create extension if not exists pgcrypto;

-- 1) Invariants: keep profiles.email permanently null (Phase 04 split), and prevent users from
-- updating privileged fields via broad update policies.

create or replace function public.enforce_profiles_invariants()
returns trigger
language plpgsql
as $$
begin
  -- Email is directory-sensitive and must never be stored on public.profiles.
  new.email = null;

  -- Authenticated users may only change display_name. Prevent client-side status changes.
  if auth.uid() is not null then
    new.status = old.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_invariants on public.profiles;
create trigger trg_profiles_enforce_invariants
before update on public.profiles
for each row
execute function public.enforce_profiles_invariants();

-- Restrict UPDATE privileges for authenticated users to display_name only.
-- (RLS still applies; this is an additional guardrail.)
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Phase 04: users should not edit private email directly (auth is source of truth).
-- Keep select policies; remove update policy + privilege.
drop policy if exists "profile_private_update_own" on public.profile_private;
revoke update on table public.profile_private from authenticated;

-- 2) Audit log (append-only)

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid null references public.profiles(id) on delete set null,
  action_key text not null,
  target_type text null,
  target_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_actor_user_id_idx on public.audit_log (actor_user_id);
create index if not exists audit_log_action_key_idx on public.audit_log (action_key);

alter table public.audit_log enable row level security;

-- Admin-only read (advisor global OR president current term)
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- No client-facing insert/update/delete policies.
-- Writing is server-only (service role) via function.

create or replace function public.log_event(
  action_key text,
  actor_user_id uuid,
  target_type text default null,
  target_id uuid default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if action_key is null or char_length(btrim(action_key)) = 0 then
    raise exception 'action_key is required';
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (actor_user_id, action_key, target_type, target_id, coalesce(metadata, '{}'::jsonb))
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.log_event(text, uuid, text, uuid, jsonb) from public;
revoke all on function public.log_event(text, uuid, text, uuid, jsonb) from authenticated;
grant execute on function public.log_event(text, uuid, text, uuid, jsonb) to service_role;

-- 3) Transactional current-term setter to avoid ending up with no current term.

create or replace function public.set_current_term(term_id uuid)
returns public.terms
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.terms;
begin
  if auth.uid() is null then
    -- Service role context is allowed.
    null;
  elsif not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if term_id is null then
    raise exception 'term_id is required';
  end if;

  select * into t from public.terms where id = term_id;
  if not found then
    raise exception 'term not found';
  end if;

  update public.terms set is_current = false where is_current;
  update public.terms set is_current = true where id = term_id;

  select * into t from public.terms where id = term_id;
  return t;
end;
$$;

revoke all on function public.set_current_term(uuid) from public;
grant execute on function public.set_current_term(uuid) to authenticated;
grant execute on function public.set_current_term(uuid) to service_role;

commit;
