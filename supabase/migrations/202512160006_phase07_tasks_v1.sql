-- PHASE 07 — Tasks v1 (committee-scoped CRUD with RLS + audit triggers)
-- Source of truth: 02_data_model.md, 03_security_and_permissions.md

begin;

create extension if not exists pgcrypto;

-- 1) Committees (minimal primitive for RLS scoping)

create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  committee_key text not null,
  committee_key_normalized text generated always as (lower(btrim(committee_key))) stored,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint committees_key_nonempty check (char_length(btrim(committee_key)) > 0),
  constraint committees_name_nonempty check (char_length(btrim(name)) > 0)
);

create unique index if not exists committees_key_uniq on public.committees (committee_key_normalized);

alter table public.committees enable row level security;

drop trigger if exists trg_committees_set_updated_at on public.committees;
create trigger trg_committees_set_updated_at
before update on public.committees
for each row
execute function public.set_updated_at();

create table if not exists public.committee_memberships (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint committee_memberships_role_check check (role in ('member', 'chair'))
);

create index if not exists committee_memberships_committee_id_idx on public.committee_memberships (committee_id);
create index if not exists committee_memberships_user_id_idx on public.committee_memberships (user_id);

create unique index if not exists committee_memberships_unique
  on public.committee_memberships (committee_id, user_id);

alter table public.committee_memberships enable row level security;

drop trigger if exists trg_committee_memberships_set_updated_at on public.committee_memberships;
create trigger trg_committee_memberships_set_updated_at
before update on public.committee_memberships
for each row
execute function public.set_updated_at();

-- Helper predicates for RLS (avoid probing other users; always uses auth.uid()).

create or replace function public.is_committee_member(_committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.committee_memberships cm
    where cm.committee_id = _committee_id
      and cm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_committee_member(uuid) from public;
grant execute on function public.is_committee_member(uuid) to authenticated;

create or replace function public.is_committee_chair(_committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.committee_memberships cm
    where cm.committee_id = _committee_id
      and cm.user_id = auth.uid()
      and cm.role = 'chair'
  );
$$;

revoke all on function public.is_committee_chair(uuid) from public;
grant execute on function public.is_committee_chair(uuid) to authenticated;

-- Committees: members can read committees they belong to; admins can read all.
create policy "committees_select_member"
  on public.committees
  for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = committees.id
        and cm.user_id = auth.uid()
    )
  );

-- Committees: admin-only mutations (future-proof; no UI in Phase 07)
create policy "committees_insert_admin"
  on public.committees
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "committees_update_admin"
  on public.committees
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "committees_delete_admin"
  on public.committees
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Committee memberships: user can read their own; admin can manage.
create policy "committee_memberships_select_own"
  on public.committee_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "committee_memberships_insert_admin"
  on public.committee_memberships
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "committee_memberships_update_admin"
  on public.committee_memberships
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "committee_memberships_delete_admin"
  on public.committee_memberships
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Deterministic privileges
revoke all on table public.committees from authenticated;
revoke all on table public.committee_memberships from authenticated;

grant select on table public.committees to authenticated;
grant select on table public.committee_memberships to authenticated;

grant insert, update, delete on table public.committees to authenticated;
grant insert, update, delete on table public.committee_memberships to authenticated;

-- 2) Tasks

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete restrict,
  title text not null,
  description text null,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_at timestamptz null,
  assigned_to uuid null references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_nonempty check (char_length(btrim(title)) > 0),
  constraint tasks_status_check check (status in ('todo', 'doing', 'done')),
  constraint tasks_priority_check check (priority in ('low', 'medium', 'high'))
);

create index if not exists tasks_committee_id_idx on public.tasks (committee_id);
create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);
create index if not exists tasks_status_idx on public.tasks (status);

alter table public.tasks enable row level security;

drop trigger if exists trg_tasks_set_updated_at on public.tasks;
create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

-- RLS: committee members can read/write tasks in their committee; admins override.
create policy "tasks_select_scoped"
  on public.tasks
  for select
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "tasks_insert_scoped"
  on public.tasks
  for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (public.is_committee_member(committee_id) and created_by = auth.uid())
  );

create policy "tasks_update_scoped"
  on public.tasks
  for update
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id))
  with check (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "tasks_delete_scoped"
  on public.tasks
  for delete
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

-- Deterministic privileges
revoke all on table public.tasks from authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;

-- Assignment rules:
-- - Any member can create/update tasks.
-- - Only a chair (or admin) may assign another user.
-- - Any assignment must target a committee member.

create or replace function public.enforce_task_assignment_rules()
returns trigger
language plpgsql
as $$
declare
  is_chair boolean;
  is_admin boolean;
  is_member boolean;
begin
  is_admin := public.is_admin(auth.uid());

  if new.assigned_to is not null then
    -- Prevent assigning non-members.
    select exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = new.committee_id
        and cm.user_id = new.assigned_to
    ) into is_member;

    if not is_member then
      raise exception 'invalid assignee';
    end if;

    -- Only chairs/admin can assign others.
    if not is_admin and new.assigned_to <> auth.uid() then
      is_chair := public.is_committee_chair(new.committee_id);
      if not is_chair then
        raise exception 'forbidden';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tasks_enforce_assignment on public.tasks;
create trigger trg_tasks_enforce_assignment
before insert or update on public.tasks
for each row
execute function public.enforce_task_assignment_rules();

-- Audit log via DB triggers (covers RLS writes; no service-role API required)

create or replace function public.audit_tasks_change()
returns trigger
language plpgsql
as $$
declare
  actor uuid;
  payload jsonb;
  action text;
  target_id uuid;
  committee uuid;
begin
  actor := auth.uid();

  if tg_op = 'INSERT' then
    action := 'task.created';
    target_id := new.id;
    committee := new.committee_id;
    payload := jsonb_build_object(
      'committee_id', new.committee_id,
      'title', new.title,
      'status', new.status,
      'priority', new.priority,
      'due_at', new.due_at,
      'assigned_to', new.assigned_to,
      'created_by', new.created_by
    );
  elsif tg_op = 'UPDATE' then
    action := 'task.updated';
    target_id := new.id;
    committee := new.committee_id;
    payload := jsonb_build_object(
      'committee_id', new.committee_id,
      'title', new.title,
      'status', new.status,
      'priority', new.priority,
      'due_at', new.due_at,
      'assigned_to', new.assigned_to
    );
  elsif tg_op = 'DELETE' then
    action := 'task.deleted';
    target_id := old.id;
    committee := old.committee_id;
    payload := jsonb_build_object(
      'committee_id', old.committee_id,
      'title', old.title,
      'status', old.status,
      'priority', old.priority,
      'due_at', old.due_at,
      'assigned_to', old.assigned_to,
      'created_by', old.created_by
    );
  else
    return null;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    actor,
    action,
    'task',
    target_id,
    payload
  );

  return null;
end;
$$;

drop trigger if exists trg_tasks_audit_insert on public.tasks;
create trigger trg_tasks_audit_insert
after insert on public.tasks
for each row
execute function public.audit_tasks_change();

drop trigger if exists trg_tasks_audit_update on public.tasks;
create trigger trg_tasks_audit_update
after update on public.tasks
for each row
execute function public.audit_tasks_change();

drop trigger if exists trg_tasks_audit_delete on public.tasks;
create trigger trg_tasks_audit_delete
after delete on public.tasks
for each row
execute function public.audit_tasks_change();

-- 3) Bootstrap: ensure everyone belongs to a default committee so Tasks works immediately.

insert into public.committees (committee_key, name)
values ('general', 'General')
on conflict (committee_key_normalized) do update set
  name = excluded.name;

create or replace function public.auto_add_to_general_committee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  general_id uuid;
begin
  select c.id into general_id
  from public.committees c
  where c.committee_key_normalized = 'general'
  limit 1;

  if general_id is null then
    return new;
  end if;

  insert into public.committee_memberships (committee_id, user_id, role)
  values (general_id, new.id, 'member')
  on conflict (committee_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_general_committee on public.profiles;
create trigger trg_profiles_auto_general_committee
after insert on public.profiles
for each row
execute function public.auto_add_to_general_committee();

-- Backfill existing profiles into General committee.
insert into public.committee_memberships (committee_id, user_id, role)
select c.id, p.id, 'member'
from public.committees c
cross join public.profiles p
where c.committee_key_normalized = 'general'
on conflict (committee_id, user_id) do nothing;

commit;
