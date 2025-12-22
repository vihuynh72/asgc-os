-- PHASE 34 — Vote capture v1
-- Source of truth: 02_data_model.md, 03_security_and_permissions.md

begin;

create table if not exists public.board_votes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  funding_request_id uuid null references public.funding_requests(id) on delete set null,
  motion_text text not null,
  moved_by uuid null references public.profiles(id) on delete set null,
  seconded_by uuid null references public.profiles(id) on delete set null,
  vote_yes integer not null default 0,
  vote_no integer not null default 0,
  vote_abstain integer not null default 0,
  result text not null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint board_votes_motion_nonempty check (char_length(btrim(motion_text)) > 0),
  constraint board_votes_votes_nonnegative check (vote_yes >= 0 and vote_no >= 0 and vote_abstain >= 0),
  constraint board_votes_result_check check (result in ('approved', 'denied', 'tabled'))
);

create index if not exists board_votes_meeting_idx on public.board_votes (meeting_id);
create index if not exists board_votes_request_idx on public.board_votes (funding_request_id);

alter table public.board_votes enable row level security;

create policy "board_votes_select_finance"
  on public.board_votes
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "board_votes_select_board"
  on public.board_votes
  for select
  to authenticated
  using (public.is_board_member(auth.uid()));

create policy "board_votes_select_requestor"
  on public.board_votes
  for select
  to authenticated
  using (
    funding_request_id is not null
    and exists (
      select 1
      from public.funding_requests fr
      where fr.id = board_votes.funding_request_id
        and fr.requestor_user_id = auth.uid()
    )
  );

create policy "board_votes_insert_board"
  on public.board_votes
  for insert
  to authenticated
  with check (public.is_board_member(auth.uid()) or public.is_finance_admin(auth.uid()));

create policy "board_votes_update_finance"
  on public.board_votes
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

revoke all on table public.board_votes from authenticated;
grant select, insert, update on table public.board_votes to authenticated;

-- RPC: record board vote and update funding request state if linked.
create or replace function public.record_board_vote(
  _meeting_id uuid,
  _funding_request_id uuid,
  _motion_text text,
  _moved_by uuid,
  _seconded_by uuid,
  _vote_yes integer,
  _vote_no integer,
  _vote_abstain integer,
  _result text,
  _notes text default null
)
returns public.board_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  vote public.board_votes;
  fr public.funding_requests;
  next_state text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_board_member(auth.uid()) and not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _motion_text is null or char_length(btrim(_motion_text)) = 0 then
    raise exception 'motion_required';
  end if;

  if _result not in ('approved', 'denied', 'tabled') then
    raise exception 'invalid_result';
  end if;

  if _vote_yes < 0 or _vote_no < 0 or _vote_abstain < 0 then
    raise exception 'invalid_votes';
  end if;

  if not exists (select 1 from public.meetings m where m.id = _meeting_id) then
    raise exception 'meeting_not_found';
  end if;

  if _funding_request_id is not null then
    select * into fr from public.funding_requests where id = _funding_request_id for update;
    if not found then
      raise exception 'funding_request_not_found';
    end if;

    if fr.state <> 'scheduled_for_vote' then
      raise exception 'funding_request_not_ready_for_vote';
    end if;

    if _result = 'approved' then
      next_state := 'approved';
    elsif _result = 'denied' then
      next_state := 'denied';
    else
      next_state := 'under_review';
    end if;

    update public.funding_requests
    set
      state = next_state,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      state_updated_at = now()
    where id = _funding_request_id;
  end if;

  insert into public.board_votes (
    meeting_id,
    funding_request_id,
    motion_text,
    moved_by,
    seconded_by,
    vote_yes,
    vote_no,
    vote_abstain,
    result,
    notes
  )
  values (
    _meeting_id,
    _funding_request_id,
    btrim(_motion_text),
    _moved_by,
    _seconded_by,
    _vote_yes,
    _vote_no,
    _vote_abstain,
    _result,
    _notes
  )
  returning * into vote;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.board_vote.recorded',
    'board_vote',
    vote.id,
    jsonb_build_object('result', _result, 'funding_request_id', _funding_request_id)
  );

  return vote;
end;
$$;

revoke all on function public.record_board_vote(uuid, uuid, text, uuid, uuid, integer, integer, integer, text, text) from public;
grant execute on function public.record_board_vote(uuid, uuid, text, uuid, uuid, integer, integer, integer, text, text) to authenticated;

commit;
