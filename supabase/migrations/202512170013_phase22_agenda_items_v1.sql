-- PHASE 22 — Agenda Items Intake
-- Source of truth: 02_data_model.md, 04_office_hours_spec.md

begin;

-- 1) Agenda items table.
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  title text not null,
  category text not null default 'discussion',
  background text null,
  recommended_motion text null,
  fiscal_impact text null,
  attachments_json jsonb null default '[]'::jsonb,
  state text not null default 'draft',
  is_late boolean not null default false,
  admin_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_items_category_check check (category in ('action', 'discussion', 'information', 'consent', 'other')),
  constraint agenda_items_state_check check (state in ('draft', 'submitted', 'accepted', 'rejected', 'tabled', 'withdrawn')),
  constraint agenda_items_title_nonempty check (char_length(btrim(title)) > 0)
);

create index if not exists agenda_items_meeting_idx on public.agenda_items (meeting_id);
create index if not exists agenda_items_submitted_by_idx on public.agenda_items (submitted_by);
create index if not exists agenda_items_state_idx on public.agenda_items (state);

alter table public.agenda_items enable row level security;

drop trigger if exists trg_agenda_items_set_updated_at on public.agenda_items;
create trigger trg_agenda_items_set_updated_at
before update on public.agenda_items
for each row
execute function public.set_updated_at();

-- RLS: submitter can see own; admin can see all; committee members can see accepted items for their committee meetings.
create policy "agenda_items_select_own"
  on public.agenda_items
  for select
  to authenticated
  using (submitted_by = auth.uid());

create policy "agenda_items_select_admin"
  on public.agenda_items
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "agenda_items_select_accepted"
  on public.agenda_items
  for select
  to authenticated
  using (state in ('accepted', 'tabled'));

-- 2) Submit agenda item RPC (member creates draft or submits directly).
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

  -- Check deadline (Phase 23 will add config; for now use meeting start - 84 hours)
  deadline_ts := meeting_row.starts_at - interval '84 hours';

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

revoke all on function public.submit_agenda_item(uuid, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_agenda_item(uuid, text, text, text, text, text, jsonb, boolean) to authenticated;

-- 3) Update agenda item RPC (submitter updates own draft).
create or replace function public.update_agenda_item(
  _item_id uuid,
  _title text default null,
  _category text default null,
  _background text default null,
  _recommended_motion text default null,
  _fiscal_impact text default null,
  _attachments_json jsonb default null
)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
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

  update public.agenda_items
  set
    title = coalesce(nullif(btrim(_title), ''), title),
    category = coalesce(_category, category),
    background = coalesce(_background, background),
    recommended_motion = coalesce(_recommended_motion, recommended_motion),
    fiscal_impact = coalesce(_fiscal_impact, fiscal_impact),
    attachments_json = coalesce(_attachments_json, attachments_json)
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

revoke all on function public.update_agenda_item(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.update_agenda_item(uuid, text, text, text, text, text, jsonb) to authenticated;

-- 4) Submit draft item RPC.
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
  deadline_ts := meeting_row.starts_at - interval '84 hours';

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

revoke all on function public.finalize_agenda_item(uuid) from public;
grant execute on function public.finalize_agenda_item(uuid) to authenticated;

-- 5) Withdraw agenda item RPC.
create or replace function public.withdraw_agenda_item(_item_id uuid)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
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

  if item.state not in ('draft', 'submitted') then
    raise exception 'cannot_withdraw_finalized';
  end if;

  update public.agenda_items
  set state = 'withdrawn'
  where id = _item_id
  returning * into item;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'agenda.item_withdrawn',
    'agenda_item',
    _item_id,
    '{}'::jsonb
  );

  return item;
end;
$$;

revoke all on function public.withdraw_agenda_item(uuid) from public;
grant execute on function public.withdraw_agenda_item(uuid) to authenticated;

-- 6) Admin accept/reject/table agenda item.
create or replace function public.admin_review_agenda_item(
  _item_id uuid,
  _new_state text,
  _admin_notes text default null
)
returns public.agenda_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agenda_items;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _new_state not in ('accepted', 'rejected', 'tabled') then
    raise exception 'invalid_state';
  end if;

  select * into item from public.agenda_items where id = _item_id for update;

  if not found then
    raise exception 'item_not_found';
  end if;

  update public.agenda_items
  set
    state = _new_state,
    admin_notes = coalesce(_admin_notes, admin_notes)
  where id = _item_id
  returning * into item;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'agenda.item_reviewed',
    'agenda_item',
    _item_id,
    jsonb_build_object('new_state', _new_state, 'admin_notes', _admin_notes)
  );

  return item;
end;
$$;

revoke all on function public.admin_review_agenda_item(uuid, text, text) from public;
grant execute on function public.admin_review_agenda_item(uuid, text, text) to authenticated;

-- 7) List agenda items for a meeting.
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
  order by ai.submitted_at asc;
$$;

revoke all on function public.meeting_agenda_items(uuid) from public;
grant execute on function public.meeting_agenda_items(uuid) to authenticated;

-- 8) List own agenda items across all meetings.
create or replace function public.my_agenda_items()
returns setof public.agenda_items
language sql
stable
as $$
  select ai.*
  from public.agenda_items ai
  where ai.submitted_by = auth.uid()
  order by ai.created_at desc;
$$;

revoke all on function public.my_agenda_items() from public;
grant execute on function public.my_agenda_items() to authenticated;

commit;
