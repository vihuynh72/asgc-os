-- PHASE 08 — Projects v1 (projects table + link tasks to projects + RLS + audit triggers)
-- Source of truth: 01_stack_and_architecture.md, 02_data_model.md, 03_security_and_permissions.md

begin;

create extension if not exists pgcrypto;

-- 1) Projects

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  created_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_nonempty check (char_length(btrim(name)) > 0),
  constraint projects_status_check check (status in ('active', 'archived'))
);

create index if not exists projects_committee_id_idx on public.projects (committee_id);
create index if not exists projects_status_idx on public.projects (status);
create unique index if not exists projects_committee_name_uniq on public.projects (committee_id, lower(btrim(name)));

alter table public.projects enable row level security;

drop trigger if exists trg_projects_set_updated_at on public.projects;
create trigger trg_projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

-- RLS: committee members can read/write projects in their committee; admins override.
create policy "projects_select_scoped"
  on public.projects
  for select
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "projects_insert_scoped"
  on public.projects
  for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (public.is_committee_member(committee_id) and created_by = auth.uid())
  );

create policy "projects_update_scoped"
  on public.projects
  for update
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id))
  with check (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "projects_delete_scoped"
  on public.projects
  for delete
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

-- Deterministic privileges
revoke all on table public.projects from authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

-- 2) Link tasks to projects

alter table public.tasks
  add column if not exists project_id uuid null references public.projects(id) on delete set null;

create index if not exists tasks_project_id_idx on public.tasks (project_id);

-- Enforce cross-committee integrity: a task may only link to a project in the same committee.
create or replace function public.enforce_task_project_consistency()
returns trigger
language plpgsql
as $$
declare
  project_committee uuid;
begin
  if new.project_id is null then
    return new;
  end if;

  select p.committee_id into project_committee
  from public.projects p
  where p.id = new.project_id;

  if project_committee is null then
    raise exception 'invalid project';
  end if;

  if project_committee <> new.committee_id then
    raise exception 'project committee mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tasks_enforce_project_consistency on public.tasks;
create trigger trg_tasks_enforce_project_consistency
before insert or update on public.tasks
for each row
execute function public.enforce_task_project_consistency();

-- 3) Audit log via DB triggers for projects

create or replace function public.audit_projects_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  payload jsonb;
  action text;
  target_id uuid;
begin
  actor := auth.uid();

  if tg_op = 'INSERT' then
    action := 'project.created';
    target_id := new.id;
    payload := jsonb_build_object(
      'committee_id', new.committee_id,
      'name', new.name,
      'status', new.status,
      'created_by', new.created_by
    );
  elsif tg_op = 'UPDATE' then
    action := 'project.updated';
    target_id := new.id;
    payload := jsonb_build_object(
      'committee_id', new.committee_id,
      'name', new.name,
      'status', new.status
    );
  elsif tg_op = 'DELETE' then
    action := 'project.deleted';
    target_id := old.id;
    payload := jsonb_build_object(
      'committee_id', old.committee_id,
      'name', old.name,
      'status', old.status,
      'created_by', old.created_by
    );
  else
    return null;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (actor, action, 'project', target_id, payload);

  return null;
end;
$$;

revoke all on function public.audit_projects_change() from public;
revoke all on function public.audit_projects_change() from authenticated;

drop trigger if exists trg_projects_audit_insert on public.projects;
create trigger trg_projects_audit_insert
after insert on public.projects
for each row
execute function public.audit_projects_change();

drop trigger if exists trg_projects_audit_update on public.projects;
create trigger trg_projects_audit_update
after update on public.projects
for each row
execute function public.audit_projects_change();

drop trigger if exists trg_projects_audit_delete on public.projects;
create trigger trg_projects_audit_delete
after delete on public.projects
for each row
execute function public.audit_projects_change();

commit;
