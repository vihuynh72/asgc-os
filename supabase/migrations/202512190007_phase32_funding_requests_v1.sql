-- PHASE 32 — Funding request intake
-- Source of truth: 01_stack_and_architecture.md, 02_data_model.md, 03_security_and_permissions.md

begin;

-- 1) Breakdown JSON validator (immutable for check constraints).
create or replace function public.breakdown_json_is_valid(_breakdown jsonb, _amount numeric)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  item jsonb;
  total numeric := 0;
  line_amount numeric;
  line_desc text;
begin
  if _breakdown is null or jsonb_typeof(_breakdown) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(_breakdown) = 0 then
    return false;
  end if;

  for item in select * from jsonb_array_elements(_breakdown) loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    line_desc := btrim(item ->> 'description');
    if line_desc is null or char_length(line_desc) = 0 then
      return false;
    end if;

    begin
      line_amount := (item ->> 'amount')::numeric;
    exception when others then
      return false;
    end;

    if line_amount is null or line_amount <= 0 then
      return false;
    end if;

    total := total + line_amount;
  end loop;

  if _amount is null or _amount <= 0 then
    return false;
  end if;

  if abs(total - _amount) > 0.01 then
    return false;
  end if;

  return true;
end;
$$;

-- 2) Funding requests table.
create table if not exists public.funding_requests (
  id uuid primary key default gen_random_uuid(),
  requestor_user_id uuid not null references public.profiles(id) on delete restrict,
  committee_id uuid null references public.committees(id) on delete set null,
  title text not null,
  purpose text not null,
  amount_requested numeric(12,2) not null,
  breakdown_json jsonb not null,
  needs_board_action boolean not null default false,
  state text not null default 'draft',
  submitted_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funding_requests_title_nonempty check (char_length(btrim(title)) > 0),
  constraint funding_requests_purpose_nonempty check (char_length(btrim(purpose)) > 0),
  constraint funding_requests_amount_positive check (amount_requested > 0),
  constraint funding_requests_breakdown_valid check (public.breakdown_json_is_valid(breakdown_json, amount_requested)),
  constraint funding_requests_state_check check (
    state in ('draft', 'submitted', 'under_review', 'scheduled_for_vote', 'approved', 'denied', 'withdrawn')
  )
);

create index if not exists funding_requests_requestor_idx on public.funding_requests (requestor_user_id);
create index if not exists funding_requests_committee_idx on public.funding_requests (committee_id);
create index if not exists funding_requests_state_idx on public.funding_requests (state);
create index if not exists funding_requests_needs_board_idx on public.funding_requests (needs_board_action);

alter table public.funding_requests enable row level security;

drop trigger if exists trg_funding_requests_set_updated_at on public.funding_requests;
create trigger trg_funding_requests_set_updated_at
before update on public.funding_requests
for each row
execute function public.set_updated_at();

create policy "funding_requests_select_requestor"
  on public.funding_requests
  for select
  to authenticated
  using (requestor_user_id = auth.uid());

create policy "funding_requests_select_finance"
  on public.funding_requests
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "funding_requests_select_board"
  on public.funding_requests
  for select
  to authenticated
  using (
    public.is_board_member(auth.uid())
    and state in ('submitted', 'scheduled_for_vote', 'approved', 'denied')
  );

create policy "funding_requests_insert_requestor"
  on public.funding_requests
  for insert
  to authenticated
  with check (requestor_user_id = auth.uid() or public.is_finance_admin(auth.uid()));

create policy "funding_requests_update_requestor"
  on public.funding_requests
  for update
  to authenticated
  using (
    requestor_user_id = auth.uid()
    and state in ('draft', 'submitted')
  )
  with check (
    requestor_user_id = auth.uid()
    and state in ('draft', 'submitted')
  );

create policy "funding_requests_update_finance"
  on public.funding_requests
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

create policy "funding_requests_delete_finance"
  on public.funding_requests
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.funding_requests from authenticated;
grant select, insert, update, delete on table public.funding_requests to authenticated;

-- 3) Funding request attachments (docs join table).
create table if not exists public.funding_request_docs (
  id uuid primary key default gen_random_uuid(),
  funding_request_id uuid not null references public.funding_requests(id) on delete cascade,
  doc_id uuid not null references public.docs(id) on delete cascade,
  doc_kind text not null default 'attachment',
  created_at timestamptz not null default now(),
  constraint funding_request_docs_kind_check check (doc_kind in ('attachment', 'quote', 'invoice', 'other')),
  constraint funding_request_docs_unique unique (funding_request_id, doc_id)
);

create index if not exists funding_request_docs_request_idx on public.funding_request_docs (funding_request_id);

alter table public.funding_request_docs enable row level security;

create policy "funding_request_docs_select"
  on public.funding_request_docs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.funding_requests fr
      where fr.id = funding_request_docs.funding_request_id
        and (
          fr.requestor_user_id = auth.uid()
          or public.is_finance_admin(auth.uid())
          or (public.is_board_member(auth.uid()) and fr.state in ('submitted','scheduled_for_vote','approved','denied'))
        )
    )
  );

create policy "funding_request_docs_insert"
  on public.funding_request_docs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.funding_requests fr
      where fr.id = funding_request_docs.funding_request_id
        and fr.requestor_user_id = auth.uid()
        and fr.state in ('draft','submitted')
    )
    or public.is_finance_admin(auth.uid())
  );

create policy "funding_request_docs_delete"
  on public.funding_request_docs
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.funding_request_docs from authenticated;
grant select, insert, delete on table public.funding_request_docs to authenticated;

-- 4) RPC: create funding request (draft).
create or replace function public.create_funding_request(
  _committee_id uuid,
  _title text,
  _purpose text,
  _amount_requested numeric,
  _breakdown_json jsonb
)
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

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  if _purpose is null or char_length(btrim(_purpose)) = 0 then
    raise exception 'purpose_required';
  end if;

  if not public.breakdown_json_is_valid(_breakdown_json, _amount_requested) then
    raise exception 'invalid_breakdown';
  end if;

  insert into public.funding_requests (
    requestor_user_id,
    committee_id,
    title,
    purpose,
    amount_requested,
    breakdown_json,
    state
  )
  values (
    auth.uid(),
    _committee_id,
    btrim(_title),
    btrim(_purpose),
    _amount_requested,
    _breakdown_json,
    'draft'
  )
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.created',
    'funding_request',
    fr.id,
    jsonb_build_object('amount', _amount_requested)
  );

  return fr;
end;
$$;

revoke all on function public.create_funding_request(uuid, text, text, numeric, jsonb) from public;
grant execute on function public.create_funding_request(uuid, text, text, numeric, jsonb) to authenticated;

-- 5) RPC: update funding request (draft/submitted by requestor; finance admins can update separately).
create or replace function public.update_funding_request(
  _request_id uuid,
  _committee_id uuid default null,
  _title text default null,
  _purpose text default null,
  _amount_requested numeric default null,
  _breakdown_json jsonb default null
)
returns public.funding_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.funding_requests;
  next_amount numeric;
  next_breakdown jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into fr from public.funding_requests where id = _request_id for update;

  if not found then
    raise exception 'funding_request_not_found';
  end if;

  if fr.requestor_user_id <> auth.uid() and not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if fr.requestor_user_id = auth.uid() and fr.state not in ('draft', 'submitted') then
    raise exception 'cannot_edit_finalized_request';
  end if;

  next_amount := coalesce(_amount_requested, fr.amount_requested);
  next_breakdown := coalesce(_breakdown_json, fr.breakdown_json);

  if not public.breakdown_json_is_valid(next_breakdown, next_amount) then
    raise exception 'invalid_breakdown';
  end if;

  update public.funding_requests
  set
    committee_id = coalesce(_committee_id, committee_id),
    title = coalesce(nullif(btrim(_title), ''), title),
    purpose = coalesce(nullif(btrim(_purpose), ''), purpose),
    amount_requested = next_amount,
    breakdown_json = next_breakdown
  where id = _request_id
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.updated',
    'funding_request',
    fr.id,
    jsonb_build_object('amount', fr.amount_requested)
  );

  return fr;
end;
$$;

revoke all on function public.update_funding_request(uuid, uuid, text, text, numeric, jsonb) from public;
grant execute on function public.update_funding_request(uuid, uuid, text, text, numeric, jsonb) to authenticated;

-- 6) RPC: submit funding request.
create or replace function public.submit_funding_request(_request_id uuid)
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

  if fr.state <> 'draft' then
    raise exception 'not_draft';
  end if;

  update public.funding_requests
  set
    state = 'submitted',
    submitted_at = now()
  where id = _request_id
  returning * into fr;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.funding_request.submitted',
    'funding_request',
    fr.id,
    jsonb_build_object('amount', fr.amount_requested)
  );

  return fr;
end;
$$;

revoke all on function public.submit_funding_request(uuid) from public;
grant execute on function public.submit_funding_request(uuid) to authenticated;

-- 7) RPC: withdraw funding request.
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
  set state = 'withdrawn'
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

commit;
