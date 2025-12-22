-- PHASE 33 — Finance config + threshold routing + state transitions
-- Source of truth: 00_product_brief.md, 02_data_model.md

begin;

-- 1) Finance config singleton.
create table if not exists public.config_finance (
  id boolean primary key default true,
  board_action_threshold numeric(12,2) not null default 100,
  grant_max numeric(12,2) not null default 1000,
  lead_time_days integer not null default 42,
  updated_at timestamptz not null default now(),
  constraint config_finance_singleton check (id is true),
  constraint config_finance_board_threshold_positive check (board_action_threshold >= 0),
  constraint config_finance_grant_max_positive check (grant_max > 0),
  constraint config_finance_lead_time_positive check (lead_time_days >= 0)
);

alter table public.config_finance enable row level security;

create policy "config_finance_select_admin"
  on public.config_finance
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "config_finance_update_admin"
  on public.config_finance
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

revoke all on table public.config_finance from authenticated;
grant select, update on table public.config_finance to authenticated;

-- Seed singleton row (idempotent).
insert into public.config_finance (id)
values (true)
on conflict (id) do nothing;

-- Updated_at trigger.
drop trigger if exists trg_config_finance_set_updated_at on public.config_finance;
create trigger trg_config_finance_set_updated_at
before update on public.config_finance
for each row
execute function public.set_updated_at();

-- 2) Track state transitions on funding requests.
alter table public.funding_requests
  add column if not exists state_updated_at timestamptz not null default now();

-- 3) Update submit_funding_request to set needs_board_action based on config.
create or replace function public.submit_funding_request(_request_id uuid)
returns public.funding_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.funding_requests;
  threshold numeric;
  needs_board boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into fr from public.funding_requests where id = _request_id for update;

  if not found then
    raise exception 'funding_request_not_found';
  end if;

  if fr.requestor_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if fr.state <> 'draft' then
    raise exception 'not_draft';
  end if;

  select cf.board_action_threshold into threshold
  from public.config_finance cf where cf.id = true;

  threshold := coalesce(threshold, 100);
  needs_board := fr.amount_requested >= threshold;

  update public.funding_requests
  set
    state = 'submitted',
    submitted_at = now(),
    needs_board_action = needs_board,
    state_updated_at = now()
  where id = _request_id
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.submitted',
    'funding_request',
    fr.id,
    jsonb_build_object('amount', fr.amount_requested, 'needs_board_action', fr.needs_board_action)
  );

  return fr;
end;
$$;

revoke all on function public.submit_funding_request(uuid) from public;
grant execute on function public.submit_funding_request(uuid) to authenticated;

-- 4) Update withdraw_funding_request to track state_updated_at.
create or replace function public.withdraw_funding_request(_request_id uuid)
returns public.funding_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.funding_requests;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into fr from public.funding_requests where id = _request_id for update;

  if not found then
    raise exception 'funding_request_not_found';
  end if;

  if fr.requestor_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if fr.state not in ('draft', 'submitted') then
    raise exception 'cannot_withdraw';
  end if;

  update public.funding_requests
  set
    state = 'withdrawn',
    state_updated_at = now()
  where id = _request_id
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.withdrawn',
    'funding_request',
    fr.id,
    jsonb_build_object('state', fr.state)
  );

  return fr;
end;
$$;

revoke all on function public.withdraw_funding_request(uuid) from public;
grant execute on function public.withdraw_funding_request(uuid) to authenticated;

-- 5) Finance admin state transition helper.
create or replace function public.transition_funding_request_state(
  _request_id uuid,
  _next_state text,
  _notes text default null
)
returns public.funding_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.funding_requests;
  allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _next_state is null then
    raise exception 'state_required';
  end if;

  select * into fr from public.funding_requests where id = _request_id for update;
  if not found then
    raise exception 'funding_request_not_found';
  end if;

  -- Allowed transitions.
  if fr.state = 'submitted' and _next_state in ('under_review', 'scheduled_for_vote', 'approved', 'denied') then
    allowed := true;
  elsif fr.state = 'under_review' and _next_state in ('scheduled_for_vote', 'approved', 'denied') then
    allowed := true;
  elsif fr.state = 'scheduled_for_vote' and _next_state in ('approved', 'denied') then
    allowed := true;
  end if;

  if not allowed then
    raise exception 'invalid_transition';
  end if;

  update public.funding_requests
  set
    state = _next_state,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    state_updated_at = now()
  where id = _request_id
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.state_changed',
    'funding_request',
    fr.id,
    jsonb_build_object('state', fr.state, 'notes', _notes)
  );

  return fr;
end;
$$;

revoke all on function public.transition_funding_request_state(uuid, text, text) from public;
grant execute on function public.transition_funding_request_state(uuid, text, text) to authenticated;

commit;
