-- PHASE 03 — Terms + Roles + Admin bootstrap
-- Source of truth: 02_data_model.md (IDENTITY), 03_security_and_permissions.md (roles), Phase 03 planning notes

begin;

create extension if not exists pgcrypto;

-- 0) Initial administrators are intentionally not identity-bound in source.
-- Create allowlist entries and bootstrap role grants through the admin workflow
-- or the parameterized bootstrap script after deployment.

-- 1) Terms
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date null,
  end_date date null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_name_nonempty check (char_length(btrim(name)) > 0),
  constraint terms_date_range_check check (start_date is null or end_date is null or start_date <= end_date)
);

-- Enforce only one current term.
create unique index if not exists terms_single_current_uniq
  on public.terms ((is_current))
  where is_current;

alter table public.terms enable row level security;

create policy "terms_select_authenticated"
  on public.terms
  for select
  to authenticated
  using (true);

drop trigger if exists trg_terms_set_updated_at on public.terms;
create trigger trg_terms_set_updated_at
before update on public.terms
for each row
execute function public.set_updated_at();

-- Create a default current term if none exists yet.
insert into public.terms (name, start_date, end_date, is_current)
select 'Default Term', null, null, true
where not exists (select 1 from public.terms where is_current);

-- 2) Roles
create table if not exists public.roles (
  role_key text primary key,
  scope text not null,
  description text null,
  created_at timestamptz not null default now(),
  constraint roles_scope_check check (scope in ('global', 'term')),
  constraint roles_key_nonempty check (char_length(btrim(role_key)) > 0)
);

alter table public.roles enable row level security;

create policy "roles_select_authenticated"
  on public.roles
  for select
  to authenticated
  using (true);

-- Seed initial role catalog (idempotent).
insert into public.roles (role_key, scope, description)
values
  ('advisor', 'global', 'Advisor (global super-admin)'),
  ('president', 'term', 'ASGC President (term-scoped)'),
  ('officer', 'term', 'Officer (term-scoped)'),
  ('volunteer', 'term', 'Volunteer (term-scoped)')
on conflict (role_key) do update set
  scope = excluded.scope,
  description = excluded.description;

-- 3) Role assignments
create table if not exists public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.roles(role_key) on delete restrict,
  term_id uuid null references public.terms(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists role_assignments_user_id_idx on public.role_assignments (user_id);
create index if not exists role_assignments_term_id_idx on public.role_assignments (term_id);
create index if not exists role_assignments_role_key_idx on public.role_assignments (role_key);

-- Prevent duplicate active assignments.
create unique index if not exists role_assignments_active_global_uniq
  on public.role_assignments (user_id, role_key)
  where term_id is null and ends_at is null;

create unique index if not exists role_assignments_active_term_uniq
  on public.role_assignments (user_id, role_key, term_id)
  where term_id is not null and ends_at is null;

alter table public.role_assignments enable row level security;

-- Minimal Phase 03 RLS: user may read their own assignments.
create policy "role_assignments_select_own"
  on public.role_assignments
  for select
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists trg_role_assignments_set_updated_at on public.role_assignments;
create trigger trg_role_assignments_set_updated_at
before update on public.role_assignments
for each row
execute function public.set_updated_at();

-- Enforce global vs term scoping.
create or replace function public.enforce_role_assignment_scope()
returns trigger
language plpgsql
as $$
declare
  role_scope text;
begin
  select r.scope into role_scope
  from public.roles r
  where r.role_key = new.role_key;

  if role_scope is null then
    raise exception 'Unknown role_key: %', new.role_key;
  end if;

  if role_scope = 'global' and new.term_id is not null then
    raise exception 'Global role % must have term_id = null', new.role_key;
  end if;

  if role_scope = 'term' and new.term_id is null then
    raise exception 'Term-scoped role % must have term_id set', new.role_key;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_role_assignments_enforce_scope on public.role_assignments;
create trigger trg_role_assignments_enforce_scope
before insert or update on public.role_assignments
for each row
execute function public.enforce_role_assignment_scope();

-- 4) Bootstrap role grants (one-time, keyed by email)
create table if not exists public.bootstrap_role_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  role_key text not null references public.roles(role_key) on delete restrict,
  term_id uuid null references public.terms(id) on delete restrict,
  is_active boolean not null default true,
  consumed_at timestamptz null,
  consumed_by_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  notes text null,
  constraint bootstrap_role_grants_email_nonempty check (char_length(btrim(email)) > 0)
);

create unique index if not exists bootstrap_role_grants_active_uniq
  on public.bootstrap_role_grants (email_normalized, role_key, term_id)
  where is_active and consumed_at is null;

alter table public.bootstrap_role_grants enable row level security;
-- Intentionally no client-facing policies. Service role / migration owner only.

-- Bootstrap grants start empty so a fresh deployment cannot inherit a real
-- person's privileged identity from repository history.

-- 5) Extend auth trigger to also consume bootstrap role grants on first login.
-- This keeps bootstrap server-side and auditable.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row record;
  resolved_term_id uuid;
  role_scope text;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, null)
  on conflict (id) do update set email = excluded.email;

  -- Consume any bootstrap grants for this email.
  for grant_row in
    select g.*
    from public.bootstrap_role_grants g
    where g.email_normalized = lower(btrim(coalesce(new.email, '')))
      and g.is_active = true
      and g.consumed_at is null
  loop
    select r.scope into role_scope
    from public.roles r
    where r.role_key = grant_row.role_key;

    if role_scope = 'global' then
      resolved_term_id := null;
    else
      resolved_term_id := grant_row.term_id;
      if resolved_term_id is null then
        select t.id into resolved_term_id
        from public.terms t
        where t.is_current
        limit 1;
      end if;
    end if;

    -- Insert assignment (idempotent via partial unique indexes).
    begin
      insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
      values (new.id, grant_row.role_key, resolved_term_id, now(), null, false);

      update public.bootstrap_role_grants
      set consumed_at = now(),
          consumed_by_user_id = new.id
      where id = grant_row.id;
    exception when others then
      -- If the assignment already exists or scope enforcement fails, do not consume.
      -- This keeps the bootstrap record available for later repair.
      null;
    end;
  end loop;

  return new;
end;
$$;

commit;
