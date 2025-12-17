-- PHASE 09 — Comments + attachments v1 (task_comments + task_attachments)
-- Source of truth: 01_stack_and_architecture.md (Phase 09), 02_data_model.md, 03_security_and_permissions.md
-- Notes:
-- - Attachments are URL-only in Phase 09 (Docs/Storage come later in Phase 24+).
-- - Deletes are soft-deletes (deleted_at/deleted_by) to preserve auditability.
-- - Audit writes are done via SECURITY DEFINER triggers because audit_log has no client insert policies.

begin;

create extension if not exists pgcrypto;

-- 1) Task comments

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete restrict,
  body text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles(id) on delete set null,
  constraint task_comments_body_nonempty check (char_length(btrim(body)) > 0)
);

create index if not exists task_comments_task_id_idx on public.task_comments (task_id, created_at);
create index if not exists task_comments_committee_id_idx on public.task_comments (committee_id);
create index if not exists task_comments_created_by_idx on public.task_comments (created_by);

alter table public.task_comments enable row level security;

drop trigger if exists trg_task_comments_set_updated_at on public.task_comments;
create trigger trg_task_comments_set_updated_at
before update on public.task_comments
for each row
execute function public.set_updated_at();

-- Derive + validate committee_id from task_id; enforce immutables; keep body append-only.
create or replace function public.enforce_task_comment_invariants()
returns trigger
language plpgsql
as $$
declare
  task_committee uuid;
begin
  select t.committee_id into task_committee
  from public.tasks t
  where t.id = new.task_id;

  if task_committee is null then
    raise exception 'invalid task';
  end if;

  new.committee_id := task_committee;

  if tg_op = 'UPDATE' then
    new.task_id := old.task_id;
    new.committee_id := old.committee_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    -- Append-only: body cannot be edited.
    if new.body is distinct from old.body then
      raise exception 'comment body is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_task_comments_enforce_invariants on public.task_comments;
create trigger trg_task_comments_enforce_invariants
before insert or update on public.task_comments
for each row
execute function public.enforce_task_comment_invariants();

-- RLS: committee members can read/write comments in their committee; admins override.
create policy "task_comments_select_scoped"
  on public.task_comments
  for select
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "task_comments_insert_scoped"
  on public.task_comments
  for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and public.is_committee_member(committee_id))
  );

create policy "task_comments_update_scoped"
  on public.task_comments
  for update
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id))
  with check (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

-- No hard-delete; soft-delete only.

revoke all on table public.task_comments from authenticated;
grant select, insert on table public.task_comments to authenticated;
grant update (deleted_at, deleted_by) on table public.task_comments to authenticated;

-- 2) Task attachments (URL-only)

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete restrict,
  url text not null,
  label text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles(id) on delete set null,
  constraint task_attachments_url_nonempty check (char_length(btrim(url)) > 0),
  constraint task_attachments_url_http check (btrim(url) ~* '^https?://')
);

create index if not exists task_attachments_task_id_idx on public.task_attachments (task_id, created_at);
create index if not exists task_attachments_committee_id_idx on public.task_attachments (committee_id);
create index if not exists task_attachments_created_by_idx on public.task_attachments (created_by);

alter table public.task_attachments enable row level security;

drop trigger if exists trg_task_attachments_set_updated_at on public.task_attachments;
create trigger trg_task_attachments_set_updated_at
before update on public.task_attachments
for each row
execute function public.set_updated_at();

-- Derive + validate committee_id from task_id; enforce immutables.
create or replace function public.enforce_task_attachment_invariants()
returns trigger
language plpgsql
as $$
declare
  task_committee uuid;
begin
  select t.committee_id into task_committee
  from public.tasks t
  where t.id = new.task_id;

  if task_committee is null then
    raise exception 'invalid task';
  end if;

  new.committee_id := task_committee;

  if tg_op = 'UPDATE' then
    new.task_id := old.task_id;
    new.committee_id := old.committee_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    if new.url is distinct from old.url then
      raise exception 'attachment url is immutable';
    end if;

    if new.label is distinct from old.label then
      raise exception 'attachment label is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_task_attachments_enforce_invariants on public.task_attachments;
create trigger trg_task_attachments_enforce_invariants
before insert or update on public.task_attachments
for each row
execute function public.enforce_task_attachment_invariants();

create policy "task_attachments_select_scoped"
  on public.task_attachments
  for select
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

create policy "task_attachments_insert_scoped"
  on public.task_attachments
  for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (created_by = auth.uid() and public.is_committee_member(committee_id))
  );

create policy "task_attachments_update_scoped"
  on public.task_attachments
  for update
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id))
  with check (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

revoke all on table public.task_attachments from authenticated;
grant select, insert on table public.task_attachments to authenticated;
grant update (deleted_at, deleted_by) on table public.task_attachments to authenticated;

-- 3) Audit triggers

create or replace function public.audit_task_comments_change()
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
    action := 'task_comment.created';
    target_id := new.id;
    payload := jsonb_build_object(
      'task_id', new.task_id,
      'committee_id', new.committee_id,
      'created_by', new.created_by
    );
  elsif tg_op = 'UPDATE' then
    -- Log only soft-delete / restore transitions.
    if old.deleted_at is distinct from new.deleted_at then
      if new.deleted_at is null then
        action := 'task_comment.restored';
      else
        action := 'task_comment.deleted';
      end if;

      target_id := new.id;
      payload := jsonb_build_object(
        'task_id', new.task_id,
        'committee_id', new.committee_id,
        'deleted_by', new.deleted_by,
        'deleted_at', new.deleted_at
      );
    else
      return null;
    end if;
  else
    return null;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (actor, action, 'task_comment', target_id, payload);

  return null;
end;
$$;

revoke all on function public.audit_task_comments_change() from public;
revoke all on function public.audit_task_comments_change() from authenticated;

drop trigger if exists trg_task_comments_audit_insert on public.task_comments;
create trigger trg_task_comments_audit_insert
after insert on public.task_comments
for each row
execute function public.audit_task_comments_change();

drop trigger if exists trg_task_comments_audit_update on public.task_comments;
create trigger trg_task_comments_audit_update
after update on public.task_comments
for each row
execute function public.audit_task_comments_change();

create or replace function public.audit_task_attachments_change()
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
    action := 'task_attachment.created';
    target_id := new.id;
    payload := jsonb_build_object(
      'task_id', new.task_id,
      'committee_id', new.committee_id,
      'url', new.url,
      'created_by', new.created_by
    );
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is distinct from new.deleted_at then
      if new.deleted_at is null then
        action := 'task_attachment.restored';
      else
        action := 'task_attachment.deleted';
      end if;

      target_id := new.id;
      payload := jsonb_build_object(
        'task_id', new.task_id,
        'committee_id', new.committee_id,
        'deleted_by', new.deleted_by,
        'deleted_at', new.deleted_at
      );
    else
      return null;
    end if;
  else
    return null;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (actor, action, 'task_attachment', target_id, payload);

  return null;
end;
$$;

revoke all on function public.audit_task_attachments_change() from public;
revoke all on function public.audit_task_attachments_change() from authenticated;

drop trigger if exists trg_task_attachments_audit_insert on public.task_attachments;
create trigger trg_task_attachments_audit_insert
after insert on public.task_attachments
for each row
execute function public.audit_task_attachments_change();

drop trigger if exists trg_task_attachments_audit_update on public.task_attachments;
create trigger trg_task_attachments_audit_update
after update on public.task_attachments
for each row
execute function public.audit_task_attachments_change();

commit;
