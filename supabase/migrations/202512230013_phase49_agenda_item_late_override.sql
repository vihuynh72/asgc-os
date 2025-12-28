-- PHASE 49 — Agenda item late override + ordering

begin;

alter table public.agenda_items
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (partition by meeting_id order by submitted_at asc) as rn
  from public.agenda_items
)
update public.agenda_items ai
set sort_order = ranked.rn
from ranked
where ai.id = ranked.id
  and ai.sort_order is null;

create index if not exists agenda_items_meeting_sort_idx
  on public.agenda_items (meeting_id, sort_order);

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
  next_order integer;
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

  deadline_ts := public.get_agenda_deadline(_meeting_id);

  select oc.allow_late_submissions into allow_late
  from public.office_config oc where oc.id = true;
  allow_late := coalesce(allow_late, true);

  if _submit_immediately and not allow_late and now() > deadline_ts then
    raise exception 'submission_closed';
  end if;

  if _submit_immediately then
    item_state := 'submitted';
  else
    item_state := 'draft';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_order
  from public.agenda_items
  where meeting_id = _meeting_id;

  insert into public.agenda_items (
    meeting_id, submitted_by, title, category, background,
    recommended_motion, fiscal_impact, attachments_json, state, is_late, sort_order
  )
  values (
    _meeting_id, auth.uid(), btrim(_title), _category, _background,
    _recommended_motion, _fiscal_impact, _attachments_json, item_state,
    (now() > deadline_ts and _submit_immediately), next_order
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

revoke all on function public.submit_agenda_item(uuid, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_agenda_item(uuid, text, text, text, text, text, jsonb, boolean) to authenticated;

create or replace function public.update_agenda_item(
  _item_id uuid,
  _title text default null,
  _category text default null,
  _background text default null,
  _recommended_motion text default null,
  _fiscal_impact text default null,
  _attachments_json jsonb default null,
  _is_late boolean default null,
  _sort_order integer default null
)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
  admin_override boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into item from public.agenda_items where id = _item_id for update;

  if not found then
    raise exception 'item_not_found';
  end if;

  if item.submitted_by <> auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if item.state not in ('draft', 'submitted') and not public.is_admin(auth.uid()) then
    raise exception 'cannot_edit_finalized_item';
  end if;

  admin_override := public.is_admin(auth.uid());

  update public.agenda_items
  set
    title = coalesce(nullif(btrim(_title), ''), title),
    category = coalesce(_category, category),
    background = coalesce(_background, background),
    recommended_motion = coalesce(_recommended_motion, recommended_motion),
    fiscal_impact = coalesce(_fiscal_impact, fiscal_impact),
    attachments_json = coalesce(_attachments_json, attachments_json),
    is_late = case
      when _is_late is null then is_late
      when admin_override then _is_late
      else is_late
    end,
    sort_order = case
      when _sort_order is null then sort_order
      when admin_override then _sort_order
      else sort_order
    end
  where id = _item_id
  returning * into item;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'agenda.item_updated',
    'agenda_item',
    _item_id,
    jsonb_build_object('title', item.title)
  );

  return item;
end;
$$;

revoke all on function public.update_agenda_item(uuid, text, text, text, text, text, jsonb, boolean, integer) from public;
grant execute on function public.update_agenda_item(uuid, text, text, text, text, text, jsonb, boolean, integer) to authenticated;

create or replace function public.meeting_agenda_items(_meeting_id uuid)
returns setof public.agenda_items
language sql
stable
as $$
  select ai.*
  from public.agenda_items ai
  where ai.meeting_id = _meeting_id
    and (
      ai.submitted_by = auth.uid()
      or public.is_admin(auth.uid())
      or ai.state in ('accepted', 'tabled')
    )
  order by ai.sort_order asc nulls last, ai.submitted_at asc;
$$;

revoke all on function public.meeting_agenda_items(uuid) from public;
grant execute on function public.meeting_agenda_items(uuid) to authenticated;

commit;
