-- PATCH — Allow committee chairs to mark meeting docs posted

begin;

create or replace function public.mark_meeting_posted(
  _meeting_id uuid,
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
  can_manage boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into m from public.meetings where id = _meeting_id;

  if not found then
    raise exception 'meeting_not_found';
  end if;

  can_manage := public.is_admin(auth.uid());
  if not can_manage and m.committee_id is not null then
    can_manage := public.is_committee_chair(m.committee_id);
  end if;

  if not can_manage then
    raise exception 'forbidden';
  end if;

  update public.meetings
  set
    agenda_posted_at = coalesce(_agenda_posted_at, agenda_posted_at),
    minutes_posted_at = coalesce(_minutes_posted_at, minutes_posted_at)
  where id = _meeting_id
  returning * into m;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'meetings.posted',
    'meeting',
    _meeting_id,
    jsonb_build_object(
      'agenda_posted_at', _agenda_posted_at,
      'minutes_posted_at', _minutes_posted_at
    )
  );

  return m;
end;
$$;

revoke all on function public.mark_meeting_posted(uuid, timestamptz, timestamptz) from public;
grant execute on function public.mark_meeting_posted(uuid, timestamptz, timestamptz) to authenticated;

commit;
