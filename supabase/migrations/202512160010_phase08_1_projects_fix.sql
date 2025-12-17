-- PHASE 08.1 — Projects hardening + align DB with API
-- Fixes:
-- - created_by FK action (avoid NOT NULL + ON DELETE SET NULL mismatch)
-- - remove hard-delete for projects (API archives; DB should match)
-- - freeze immutable project fields

begin;

-- 1) Fix FK behavior for created_by (match tasks best-practice: keep records stable)
-- Note: tasks.created_by was also defined as NOT NULL + ON DELETE SET NULL in Phase 07.
-- Change both to ON DELETE RESTRICT so deletes fail cleanly instead of attempting to null.

alter table public.tasks drop constraint if exists tasks_created_by_fkey;
alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete restrict;

alter table public.projects drop constraint if exists projects_created_by_fkey;
alter table public.projects
  add constraint projects_created_by_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete restrict;

-- 2) Enforce immutable project fields (committee_id, created_by, created_at)

create or replace function public.enforce_project_invariants()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.committee_id := old.committee_id;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_enforce_invariants on public.projects;
create trigger trg_projects_enforce_invariants
before update on public.projects
for each row
execute function public.enforce_project_invariants();

-- 3) Align delete semantics: projects are archive-only (no hard delete)

drop policy if exists "projects_delete_scoped" on public.projects;

revoke delete on table public.projects from authenticated;

grant select, insert, update on table public.projects to authenticated;

commit;
