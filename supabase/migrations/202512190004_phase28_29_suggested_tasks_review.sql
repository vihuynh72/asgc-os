-- PHASE 28/29 - AI action items + review workflow
-- Source of truth: 02_data_model.md, 00_product_brief.md (AI guardrails)

begin;

create table if not exists public.suggested_tasks (
  id uuid primary key default gen_random_uuid(),
  source_doc_id uuid not null references public.docs(id) on delete cascade,
  source_summary_id uuid null references public.doc_summaries(id) on delete set null,
  committee_id uuid not null references public.committees(id) on delete cascade,
  proposed_title text not null,
  proposed_description text null,
  proposed_assignee uuid null references public.profiles(id) on delete set null,
  status text not null default 'draft',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  decision_notes text null,
  published_task_id uuid null references public.tasks(id) on delete set null,
  model_info_json jsonb not null default '{}'::jsonb,
  prompt_text text null,
  constraint suggested_tasks_status_check check (status in ('draft', 'approved', 'rejected')),
  constraint suggested_tasks_title_nonempty check (char_length(btrim(proposed_title)) > 0)
);

create index if not exists suggested_tasks_doc_id_idx on public.suggested_tasks (source_doc_id);
create index if not exists suggested_tasks_committee_idx on public.suggested_tasks (committee_id);
create index if not exists suggested_tasks_status_idx on public.suggested_tasks (status);

alter table public.suggested_tasks enable row level security;

create policy "suggested_tasks_select_scoped"
  on public.suggested_tasks
  for select
  to authenticated
  using (public.is_admin(auth.uid()) or public.is_committee_member(committee_id));

revoke all on table public.suggested_tasks from authenticated;
grant select on table public.suggested_tasks to authenticated;

create or replace function public.create_suggested_tasks(
  _source_doc_id uuid,
  _tasks jsonb,
  _summary_id uuid default null,
  _model_info_json jsonb default '{}'::jsonb,
  _prompt_text text default null
)
returns setof public.suggested_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_row public.docs;
  summary_row public.doc_summaries;
  task_item jsonb;
  task_title text;
  task_description text;
  task_assignee uuid;
  inserted public.suggested_tasks;
  inserted_count int := 0;
  limit_count int := 20;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into doc_row from public.docs where id = _source_doc_id;

  if not found then
    raise exception 'doc_not_found';
  end if;

  if doc_row.doc_type <> 'committee_notes' then
    raise exception 'invalid_doc_type';
  end if;

  if doc_row.committee_id is null then
    raise exception 'committee_id_required';
  end if;

  if not public.can_view_doc(_source_doc_id) then
    raise exception 'forbidden';
  end if;

  if _summary_id is not null then
    select * into summary_row from public.doc_summaries where id = _summary_id;
    if not found then
      raise exception 'summary_not_found';
    end if;
    if summary_row.doc_id <> _source_doc_id then
      raise exception 'summary_doc_mismatch';
    end if;
  end if;

  if _tasks is null or jsonb_typeof(_tasks) <> 'array' then
    raise exception 'tasks_array_required';
  end if;

  for task_item in select * from jsonb_array_elements(_tasks) loop
    if inserted_count >= limit_count then
      exit;
    end if;

    task_title := null;
    task_description := null;
    task_assignee := null;

    if jsonb_typeof(task_item) = 'object' then
      task_title := btrim(task_item ->> 'title');
      task_description := nullif(btrim(task_item ->> 'description'), '');

      if (task_item ? 'assignee_id') then
        begin
          task_assignee := (task_item ->> 'assignee_id')::uuid;
        exception when others then
          task_assignee := null;
        end;
      end if;
    end if;

    if task_title is null or char_length(task_title) = 0 then
      continue;
    end if;

    if task_assignee is not null then
      if not exists (
        select 1
        from public.committee_memberships cm
        where cm.committee_id = doc_row.committee_id
          and cm.user_id = task_assignee
      ) then
        task_assignee := null;
      end if;
    end if;

    insert into public.suggested_tasks (
      source_doc_id,
      source_summary_id,
      committee_id,
      proposed_title,
      proposed_description,
      proposed_assignee,
      status,
      created_by,
      model_info_json,
      prompt_text
    )
    values (
      _source_doc_id,
      _summary_id,
      doc_row.committee_id,
      task_title,
      task_description,
      task_assignee,
      'draft',
      auth.uid(),
      coalesce(_model_info_json, '{}'::jsonb),
      _prompt_text
    )
    returning * into inserted;

    inserted_count := inserted_count + 1;
    return next inserted;
  end loop;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'suggested_tasks.created',
    'doc',
    _source_doc_id,
    jsonb_build_object('count', inserted_count, 'summary_id', _summary_id)
  );

  return;
end;
$$;

revoke all on function public.create_suggested_tasks(uuid, jsonb, uuid, jsonb, text) from public;

grant execute on function public.create_suggested_tasks(uuid, jsonb, uuid, jsonb, text) to authenticated;

create or replace function public.review_suggested_task(
  _suggested_task_id uuid,
  _decision text,
  _assignee_id uuid default null,
  _decision_notes text default null
)
returns public.suggested_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.suggested_tasks;
  created_task public.tasks;
  decision_lower text;
  final_assignee uuid;
  is_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  decision_lower := lower(coalesce(_decision, ''));
  if decision_lower not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  select * into st from public.suggested_tasks where id = _suggested_task_id for update;

  if not found then
    raise exception 'suggested_task_not_found';
  end if;

  if st.status <> 'draft' then
    raise exception 'suggested_task_not_draft';
  end if;

  is_allowed := public.is_admin(auth.uid()) or public.is_committee_chair(st.committee_id);
  if not is_allowed then
    raise exception 'forbidden';
  end if;

  final_assignee := _assignee_id;
  if final_assignee is not null then
    if not exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = st.committee_id
        and cm.user_id = final_assignee
    ) then
      raise exception 'invalid_assignee';
    end if;
  end if;

  if decision_lower = 'approved' then
    insert into public.tasks (
      committee_id,
      title,
      description,
      status,
      priority,
      assigned_to,
      created_by
    )
    values (
      st.committee_id,
      st.proposed_title,
      st.proposed_description,
      'todo',
      'medium',
      final_assignee,
      auth.uid()
    )
    returning * into created_task;

    update public.suggested_tasks
    set
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      decision_notes = _decision_notes,
      published_task_id = created_task.id
    where id = _suggested_task_id
    returning * into st;
  else
    update public.suggested_tasks
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      decision_notes = _decision_notes
    where id = _suggested_task_id
    returning * into st;
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'suggested_tasks.reviewed',
    'suggested_task',
    _suggested_task_id,
    jsonb_build_object('decision', decision_lower, 'published_task_id', st.published_task_id)
  );

  return st;
end;
$$;

revoke all on function public.review_suggested_task(uuid, text, uuid, text) from public;

grant execute on function public.review_suggested_task(uuid, text, uuid, text) to authenticated;

commit;
