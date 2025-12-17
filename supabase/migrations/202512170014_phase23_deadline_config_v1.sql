-- PHASE 23 — Deadline Enforcement
-- Source of truth: 02_data_model.md (config_deadlines)

begin;

-- 1) Add deadline config columns to office_config (single-row pattern).
alter table public.office_config
  add column if not exists agenda_submit_hours_before integer not null default 84,
  add column if not exists agenda_post_hours_before integer not null default 72,
  add column if not exists special_post_hours_before integer not null default 24,
  add column if not exists allow_late_submissions boolean not null default true;

comment on column public.office_config.agenda_submit_hours_before is 'Hours before meeting start when agenda submission closes (default 84h = 3.5 days)';
comment on column public.office_config.agenda_post_hours_before is 'Hours before meeting when agenda must be posted (default 72h = 3 days)';
comment on column public.office_config.special_post_hours_before is 'Hours before special meeting when agenda must be posted (default 24h)';
comment on column public.office_config.allow_late_submissions is 'Whether to accept late submissions (admin can still override)';

-- 2) Get agenda submission deadline for a meeting.
create or replace function public.get_agenda_deadline(_meeting_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  meeting_row public.meetings;
  submit_hours integer;
begin
  select * into meeting_row from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  select oc.agenda_submit_hours_before into submit_hours
  from public.office_config oc where oc.id = true;

  if not found or submit_hours is null then
    submit_hours := 84;
  end if;

  return meeting_row.starts_at - make_interval(hours => submit_hours);
end;
$$;

revoke all on function public.get_agenda_deadline(uuid) from public;
grant execute on function public.get_agenda_deadline(uuid) to authenticated;

-- 3) Check if submission is still open for a meeting.
create or replace function public.is_submission_open(_meeting_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  deadline_ts timestamptz;
  allow_late boolean;
begin
  deadline_ts := public.get_agenda_deadline(_meeting_id);

  select oc.allow_late_submissions into allow_late
  from public.office_config oc where oc.id = true;

  if not found then
    allow_late := true;
  end if;

  -- If allow_late is true, submission is always open (but will be marked late)
  -- If allow_late is false, submission closes after deadline
  if allow_late then
    return true;
  else
    return now() <= deadline_ts;
  end if;
end;
$$;

revoke all on function public.is_submission_open(uuid) from public;
grant execute on function public.is_submission_open(uuid) to authenticated;

-- 4) Get meeting deadline info (combined helper).
create or replace function public.meeting_deadline_info(_meeting_id uuid)
returns table (
  meeting_id uuid,
  starts_at timestamptz,
  submission_deadline timestamptz,
  post_deadline timestamptz,
  is_submission_open boolean,
  is_past_deadline boolean,
  hours_until_deadline numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  meeting_row public.meetings;
  submit_hours integer;
  post_hours integer;
  submit_deadline timestamptz;
  post_deadline_ts timestamptz;
  allow_late boolean;
begin
  select * into meeting_row from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  select
    oc.agenda_submit_hours_before,
    oc.agenda_post_hours_before,
    oc.allow_late_submissions
  into submit_hours, post_hours, allow_late
  from public.office_config oc where oc.id = true;

  submit_hours := coalesce(submit_hours, 84);
  post_hours := coalesce(post_hours, 72);
  allow_late := coalesce(allow_late, true);

  submit_deadline := meeting_row.starts_at - make_interval(hours => submit_hours);
  post_deadline_ts := meeting_row.starts_at - make_interval(hours => post_hours);

  return query select
    _meeting_id,
    meeting_row.starts_at,
    submit_deadline,
    post_deadline_ts,
    (allow_late or now() <= submit_deadline),
    (now() > submit_deadline),
    extract(epoch from (submit_deadline - now())) / 3600.0;
end;
$$;

revoke all on function public.meeting_deadline_info(uuid) from public;
grant execute on function public.meeting_deadline_info(uuid) to authenticated;

-- 5) Update submit_agenda_item to check submission open status.
create or replace function public.submit_agenda_item(
  _meeting_id uuid,
  _title text,
  _category text default 'discussion',
  _background text default null,
  _recommended_motion text default null,
  _fiscal_impact text default null,
  _attachments_json jsonb default '[]'::jsonb,
  _submit_immediately boolean default false
)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
  meeting_row public.meetings;
  deadline_ts timestamptz;
  allow_late boolean;
  item_state text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into meeting_row from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  if meeting_row.status <> 'scheduled' then
    raise exception 'meeting_not_scheduled';
  end if;

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  -- Get deadline config
  deadline_ts := public.get_agenda_deadline(_meeting_id);

  select oc.allow_late_submissions into allow_late
  from public.office_config oc where oc.id = true;
  allow_late := coalesce(allow_late, true);

  -- Check if submission is allowed
  if _submit_immediately and not allow_late and now() > deadline_ts then
    raise exception 'submission_closed';
  end if;

  if _submit_immediately then
    item_state := 'submitted';
  else
    item_state := 'draft';
  end if;

  insert into public.agenda_items (
    meeting_id, submitted_by, title, category, background,
    recommended_motion, fiscal_impact, attachments_json, state, is_late
  )
  values (
    _meeting_id, auth.uid(), btrim(_title), _category, _background,
    _recommended_motion, _fiscal_impact, _attachments_json, item_state,
    (now() > deadline_ts and _submit_immediately)
  )
  returning * into item;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when _submit_immediately then 'agenda.item_submitted' else 'agenda.item_drafted' end,
    'agenda_item',
    item.id,
    jsonb_build_object('meeting_id', _meeting_id, 'title', _title, 'is_late', item.is_late)
  );

  return item;
end;
$$;

-- 6) Update finalize_agenda_item to check submission open status.
create or replace function public.finalize_agenda_item(_item_id uuid)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
  meeting_row public.meetings;
  deadline_ts timestamptz;
  allow_late boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into item from public.agenda_items where id = _item_id for update;

  if not found then
    raise exception 'item_not_found';
  end if;

  if item.submitted_by <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if item.state <> 'draft' then
    raise exception 'item_not_draft';
  end if;

  select * into meeting_row from public.meetings where id = item.meeting_id;
  deadline_ts := public.get_agenda_deadline(item.meeting_id);

  select oc.allow_late_submissions into allow_late
  from public.office_config oc where oc.id = true;
  allow_late := coalesce(allow_late, true);

  -- Check if submission is allowed
  if not allow_late and now() > deadline_ts then
    raise exception 'submission_closed';
  end if;

  update public.agenda_items
  set
    state = 'submitted',
    submitted_at = now(),
    is_late = (now() > deadline_ts)
  where id = _item_id
  returning * into item;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'agenda.item_submitted',
    'agenda_item',
    _item_id,
    jsonb_build_object('is_late', item.is_late)
  );

  return item;
end;
$$;

commit;
