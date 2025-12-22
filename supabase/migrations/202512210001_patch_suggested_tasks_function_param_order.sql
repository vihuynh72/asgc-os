-- Patch: Fix create_suggested_tasks parameter order
-- PostgreSQL requires parameters with defaults to come AFTER parameters without defaults

begin;

-- Drop existing function with wrong parameter order (if exists)
drop function if exists public.create_suggested_tasks(uuid, uuid, jsonb, jsonb, text);

-- Recreate with correct parameter order: required params first, then optional params with defaults
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

commit;
