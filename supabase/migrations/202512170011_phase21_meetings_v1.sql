-- PHASE 21 — Meetings v1 (table + admin CRUD + member view)
-- Source of truth: 04_office_hours_spec.md (meetings)

begin;

-- 1) Meetings table.
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid null references public.committees(id) on delete set null,
  meeting_type text not null,
  title text not null,
  description text null,
  location text null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_type_check check (meeting_type in ('board','committee','icc','special','other')),
  constraint meetings_status_check check (status in ('scheduled','cancelled','completed')),
  constraint meetings_time_check check (ends_at > starts_at),
  constraint meetings_title_nonempty check (char_length(btrim(title)) > 0)
);

create index if not exists meetings_starts_at_idx on public.meetings (starts_at);
create index if not exists meetings_committee_idx on public.meetings (committee_id);
create index if not exists meetings_status_idx on public.meetings (status);

alter table public.meetings enable row level security;

-- RLS: admins see all; members see meetings for their committees or board/icc (global).
create policy "meetings_select_admin"
  on public.meetings
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "meetings_select_member"
  on public.meetings
  for select
  to authenticated
  using (
    meeting_type in ('board', 'icc', 'special', 'other')
    or committee_id is null
    or exists (
      select 1 from public.committee_memberships cm
      where cm.user_id = auth.uid()
        and cm.committee_id = meetings.committee_id
    )
  );

drop trigger if exists trg_meetings_set_updated_at on public.meetings;
create trigger trg_meetings_set_updated_at
before update on public.meetings
for each row
execute function public.set_updated_at();

-- 2) Admin create meeting RPC.
create or replace function public.admin_create_meeting(
  _meeting_type text,
  _title text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _committee_id uuid default null,
  _description text default null,
  _location text default null
)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  if _starts_at is null or _ends_at is null then
    raise exception 'time_required';
  end if;

  if _ends_at <= _starts_at then
    raise exception 'invalid_time_range';
  end if;

  insert into public.meetings (
    meeting_type, title, starts_at, ends_at, committee_id, description, location, status, created_by
  )
  values (
    _meeting_type, btrim(_title), _starts_at, _ends_at, _committee_id, _description, _location, 'scheduled', auth.uid()
  )
  returning * into created;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'meetings.created',
    'meeting',
    created.id,
    jsonb_build_object(
      'meeting_type', _meeting_type,
      'title', _title,
      'starts_at', _starts_at,
      'ends_at', _ends_at,
      'committee_id', _committee_id
    )
  );

  return created;
end;
$$;

revoke all on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text) from public;
grant execute on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text) to service_role;

-- 3) Admin update meeting RPC.
create or replace function public.admin_update_meeting(
  _meeting_id uuid,
  _title text default null,
  _description text default null,
  _location text default null,
  _starts_at timestamptz default null,
  _ends_at timestamptz default null,
  _status text default null
)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into m from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  update public.meetings
  set
    title = coalesce(nullif(btrim(_title), ''), title),
    description = coalesce(_description, description),
    location = coalesce(_location, location),
    starts_at = coalesce(_starts_at, starts_at),
    ends_at = coalesce(_ends_at, ends_at),
    status = coalesce(_status, status)
  where id = _meeting_id
  returning * into m;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'meetings.updated',
    'meeting',
    _meeting_id,
    jsonb_build_object(
      'title', _title,
      'description', _description,
      'location', _location,
      'starts_at', _starts_at,
      'ends_at', _ends_at,
      'status', _status
    )
  );

  return m;
end;
$$;

revoke all on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text) to service_role;

-- 4) Admin cancel meeting RPC.
create or replace function public.admin_cancel_meeting(_meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  update public.meetings
  set status = 'cancelled'
  where id = _meeting_id
  returning * into m;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'meetings.cancelled',
    'meeting',
    _meeting_id,
    '{}'::jsonb
  );

  return m;
end;
$$;

revoke all on function public.admin_cancel_meeting(uuid) from public;
grant execute on function public.admin_cancel_meeting(uuid) to authenticated;
grant execute on function public.admin_cancel_meeting(uuid) to service_role;

-- 5) Member: list upcoming meetings.
create or replace function public.my_upcoming_meetings(_limit integer default 20)
returns setof public.meetings
language sql
stable
as $$
  select m.*
  from public.meetings m
  where m.status = 'scheduled'
    and m.starts_at > now()
    and (
      m.meeting_type in ('board', 'icc', 'special', 'other')
      or m.committee_id is null
      or exists (
        select 1 from public.committee_memberships cm
        where cm.user_id = auth.uid()
          and cm.committee_id = m.committee_id
      )
    )
  order by m.starts_at asc
  limit _limit;
$$;

revoke all on function public.my_upcoming_meetings(integer) from public;
grant execute on function public.my_upcoming_meetings(integer) to authenticated;

commit;
