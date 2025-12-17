-- PHASE 07.1 — Fix task audit trigger under RLS + lock key invariants
-- Why: audit_log has RLS and no INSERT policies; non-definer triggers cannot write audit rows.

begin;

-- 1) Make task audit trigger SECURITY DEFINER so it can write audit_log without opening client INSERT.

create or replace function public.audit_tasks_change()
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
    action := 'task.created';
    target_id := new.id;
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
  values (actor, action, 'task', target_id, payload);

  return null;
end;
$$;

revoke all on function public.audit_tasks_change() from public;
revoke all on function public.audit_tasks_change() from authenticated;

-- 2) Freeze immutable task fields (best practice): created_by and committee_id should not change after insert.

create or replace function public.enforce_task_invariants()
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

drop trigger if exists trg_tasks_enforce_invariants on public.tasks;
create trigger trg_tasks_enforce_invariants
before update on public.tasks
for each row
execute function public.enforce_task_invariants();

commit;
