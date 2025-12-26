-- PHASE 48 — Meeting compliance + public access fields
-- Source of truth: meeting compliance expansion

begin;

-- 1) Add public access + compliance columns to meetings.
alter table public.meetings
  add column if not exists remote_url text null,
  add column if not exists livestream_url text null,
  add column if not exists public_comment_instructions text null,
  add column if not exists notice_posted_at timestamptz null,
  add column if not exists agenda_posted_at timestamptz null,
  add column if not exists minutes_posted_at timestamptz null;

-- 2) Update meeting_deadline_info to include special meeting posting deadline + is_special.
drop function if exists public.meeting_deadline_info(uuid);

create or replace function public.meeting_deadline_info(_meeting_id uuid)
returns table (
  meeting_id uuid,
  starts_at timestamptz,
  submission_deadline timestamptz,
  posting_deadline timestamptz,
  is_submission_open boolean,
  is_past_deadline boolean,
  hours_until_deadline numeric,
  is_special boolean
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
  special_post_hours integer;
  submit_deadline timestamptz;
  posting_deadline_ts timestamptz;
  allow_late boolean;
  meeting_is_special boolean;
begin
  select * into meeting_row from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  meeting_is_special := meeting_row.meeting_type = 'special';

  select
    oc.agenda_submit_hours_before,
    oc.agenda_post_hours_before,
    oc.special_post_hours_before,
    oc.allow_late_submissions
  into submit_hours, post_hours, special_post_hours, allow_late
  from public.office_config oc where oc.id = true;

  submit_hours := coalesce(submit_hours, 84);
  if meeting_is_special then
    post_hours := coalesce(special_post_hours, 24);
  else
    post_hours := coalesce(post_hours, 72);
  end if;
  allow_late := coalesce(allow_late, true);

  submit_deadline := meeting_row.starts_at - make_interval(hours => submit_hours);
  posting_deadline_ts := meeting_row.starts_at - make_interval(hours => post_hours);

  return query select
    _meeting_id,
    meeting_row.starts_at,
    submit_deadline,
    posting_deadline_ts,
    (allow_late or now() <= submit_deadline),
    (now() > submit_deadline),
    extract(epoch from (submit_deadline - now())) / 3600.0,
    meeting_is_special;
end;
$$;

revoke all on function public.meeting_deadline_info(uuid) from public;
grant execute on function public.meeting_deadline_info(uuid) to authenticated;

-- 3) Update admin_create_meeting to accept public access fields.
drop function if exists public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text);

create or replace function public.admin_create_meeting(
  _meeting_type text,
  _title text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _committee_id uuid default null,
  _description text default null,
  _location text default null,
  _remote_url text default null,
  _livestream_url text default null,
  _public_comment_instructions text default null
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
    meeting_type,
    title,
    starts_at,
    ends_at,
    committee_id,
    description,
    location,
    remote_url,
    livestream_url,
    public_comment_instructions,
    status,
    created_by
  )
  values (
    _meeting_type,
    btrim(_title),
    _starts_at,
    _ends_at,
    _committee_id,
    _description,
    _location,
    nullif(btrim(_remote_url), ''),
    nullif(btrim(_livestream_url), ''),
    nullif(btrim(_public_comment_instructions), ''),
    'scheduled',
    auth.uid()
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
      'committee_id', _committee_id,
      'remote_url', _remote_url,
      'livestream_url', _livestream_url
    )
  );

  return created;
end;
$$;

revoke all on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text, text, text, text) from public;
grant execute on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_create_meeting(text, text, timestamptz, timestamptz, uuid, text, text, text, text, text) to service_role;

-- 4) Update admin_update_meeting to accept compliance fields.
drop function if exists public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text);

create or replace function public.admin_update_meeting(
  _meeting_id uuid,
  _title text default null,
  _description text default null,
  _location text default null,
  _starts_at timestamptz default null,
  _ends_at timestamptz default null,
  _status text default null,
  _remote_url text default null,
  _livestream_url text default null,
  _public_comment_instructions text default null,
  _notice_posted_at timestamptz default null,
  _agenda_posted_at timestamptz default null,
  _minutes_posted_at timestamptz default null
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
    status = coalesce(_status, status),
    remote_url = case
      when _remote_url is null then remote_url
      when char_length(btrim(_remote_url)) = 0 then null
      else btrim(_remote_url)
    end,
    livestream_url = case
      when _livestream_url is null then livestream_url
      when char_length(btrim(_livestream_url)) = 0 then null
      else btrim(_livestream_url)
    end,
    public_comment_instructions = case
      when _public_comment_instructions is null then public_comment_instructions
      when char_length(btrim(_public_comment_instructions)) = 0 then null
      else btrim(_public_comment_instructions)
    end,
    notice_posted_at = coalesce(_notice_posted_at, notice_posted_at),
    agenda_posted_at = coalesce(_agenda_posted_at, agenda_posted_at),
    minutes_posted_at = coalesce(_minutes_posted_at, minutes_posted_at)
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
      'status', _status,
      'remote_url', _remote_url,
      'livestream_url', _livestream_url,
      'notice_posted_at', _notice_posted_at,
      'agenda_posted_at', _agenda_posted_at,
      'minutes_posted_at', _minutes_posted_at
    )
  );

  return m;
end;
$$;

revoke all on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_update_meeting(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;

commit;
