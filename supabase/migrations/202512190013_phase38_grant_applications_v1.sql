-- PHASE 38 — Grant intake
-- Source of truth: 02_data_model.md, 03_security_and_permissions.md

begin;

create table if not exists public.grant_applications (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.grant_cycles(id) on delete cascade,
  applicant_type text not null,
  club_id uuid null,
  title text not null,
  event_date date null,
  amount_requested numeric(12,2) not null,
  breakdown_json jsonb not null,
  advisor_approved boolean not null default false,
  doc_id uuid not null references public.docs(id) on delete restrict,
  state text not null default 'draft',
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grant_applications_title_nonempty check (char_length(btrim(title)) > 0),
  constraint grant_applications_amount_positive check (amount_requested > 0),
  constraint grant_applications_breakdown_valid check (public.breakdown_json_is_valid(breakdown_json, amount_requested)),
  constraint grant_applications_state_check check (
    state in ('draft', 'submitted', 'under_review', 'approved', 'denied', 'awarded', 'expended')
  )
);

create index if not exists grant_applications_cycle_idx on public.grant_applications (cycle_id);
create index if not exists grant_applications_state_idx on public.grant_applications (state);
create index if not exists grant_applications_submitted_by_idx on public.grant_applications (submitted_by);

alter table public.grant_applications enable row level security;

drop trigger if exists trg_grant_applications_set_updated_at on public.grant_applications;
create trigger trg_grant_applications_set_updated_at
before update on public.grant_applications
for each row
execute function public.set_updated_at();

create policy "grant_applications_select_own"
  on public.grant_applications
  for select
  to authenticated
  using (submitted_by = auth.uid());

create policy "grant_applications_select_finance"
  on public.grant_applications
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "grant_applications_insert_own"
  on public.grant_applications
  for insert
  to authenticated
  with check (submitted_by = auth.uid());

create policy "grant_applications_update_own"
  on public.grant_applications
  for update
  to authenticated
  using (submitted_by = auth.uid() and state in ('draft', 'submitted'))
  with check (submitted_by = auth.uid() and state in ('draft', 'submitted'));

create policy "grant_applications_update_finance"
  on public.grant_applications
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

create policy "grant_applications_delete_finance"
  on public.grant_applications
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.grant_applications from authenticated;
grant select, insert, update, delete on table public.grant_applications to authenticated;

-- RPC: create grant application (draft).
create or replace function public.create_grant_application(
  _cycle_id uuid,
  _applicant_type text,
  _club_id uuid,
  _title text,
  _event_date date,
  _amount_requested numeric,
  _breakdown_json jsonb,
  _doc_id uuid
)
returns public.grant_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.grant_applications;
  doc_row public.docs;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  if _applicant_type is null or char_length(btrim(_applicant_type)) = 0 then
    raise exception 'applicant_type_required';
  end if;

  if not public.breakdown_json_is_valid(_breakdown_json, _amount_requested) then
    raise exception 'invalid_breakdown';
  end if;

  select * into doc_row from public.docs where id = _doc_id;
  if not found then
    raise exception 'doc_not_found';
  end if;

  if doc_row.doc_type <> 'grant_application' then
    raise exception 'invalid_doc_type';
  end if;

  insert into public.grant_applications (
    cycle_id,
    applicant_type,
    club_id,
    title,
    event_date,
    amount_requested,
    breakdown_json,
    doc_id,
    state,
    submitted_by
  )
  values (
    _cycle_id,
    btrim(_applicant_type),
    _club_id,
    btrim(_title),
    _event_date,
    _amount_requested,
    _breakdown_json,
    _doc_id,
    'draft',
    auth.uid()
  )
  returning * into app;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.grant_application.created',
    'grant_application',
    app.id,
    jsonb_build_object('amount', app.amount_requested)
  );

  return app;
end;
$$;

revoke all on function public.create_grant_application(uuid, text, uuid, text, date, numeric, jsonb, uuid) from public;
grant execute on function public.create_grant_application(uuid, text, uuid, text, date, numeric, jsonb, uuid) to authenticated;

-- RPC: submit grant application.
create or replace function public.submit_grant_application(_application_id uuid)
returns public.grant_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.grant_applications;
  cycle_row public.grant_cycles;
  config_row public.config_finance;
  max_allowed numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into app from public.grant_applications where id = _application_id for update;
  if not found then
    raise exception 'grant_application_not_found';
  end if;

  if app.submitted_by <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if app.state <> 'draft' then
    raise exception 'not_draft';
  end if;

  select * into cycle_row from public.grant_cycles where id = app.cycle_id;
  if not found then
    raise exception 'grant_cycle_not_found';
  end if;

  select * into config_row from public.config_finance where id = true;
  max_allowed := cycle_row.max_amount;
  if config_row.grant_max is not null then
    max_allowed := least(max_allowed, config_row.grant_max);
  end if;

  if app.amount_requested > max_allowed then
    raise exception 'amount_exceeds_max';
  end if;

  update public.grant_applications
  set
    state = 'submitted',
    submitted_at = now()
  where id = _application_id
  returning * into app;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.grant_application.submitted',
    'grant_application',
    app.id,
    jsonb_build_object('amount', app.amount_requested)
  );

  return app;
end;
$$;

revoke all on function public.submit_grant_application(uuid) from public;
grant execute on function public.submit_grant_application(uuid) to authenticated;

-- RPC: finance review for grant applications.
create or replace function public.review_grant_application(
  _application_id uuid,
  _decision text,
  _notes text default null
)
returns public.grant_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.grant_applications;
  decision_lower text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  decision_lower := lower(coalesce(_decision, ''));
  if decision_lower not in ('approved', 'denied') then
    raise exception 'invalid_decision';
  end if;

  select * into app from public.grant_applications where id = _application_id for update;
  if not found then
    raise exception 'grant_application_not_found';
  end if;

  if app.state not in ('submitted', 'under_review') then
    raise exception 'invalid_state';
  end if;

  update public.grant_applications
  set
    state = decision_lower,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = _application_id
  returning * into app;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.grant_application.reviewed',
    'grant_application',
    app.id,
    jsonb_build_object('decision', decision_lower, 'notes', _notes)
  );

  return app;
end;
$$;

revoke all on function public.review_grant_application(uuid, text, text) from public;
grant execute on function public.review_grant_application(uuid, text, text) to authenticated;

-- RPC: mark grant awarded.
create or replace function public.mark_grant_awarded(_application_id uuid)
returns public.grant_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.grant_applications;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into app from public.grant_applications where id = _application_id for update;
  if not found then
    raise exception 'grant_application_not_found';
  end if;

  if app.state <> 'approved' then
    raise exception 'invalid_state';
  end if;

  update public.grant_applications
  set state = 'awarded'
  where id = _application_id
  returning * into app;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.grant_application.awarded',
    'grant_application',
    app.id,
    jsonb_build_object('state', app.state)
  );

  return app;
end;
$$;

revoke all on function public.mark_grant_awarded(uuid) from public;
grant execute on function public.mark_grant_awarded(uuid) to authenticated;

-- RPC: mark grant expended.
create or replace function public.mark_grant_expended(_application_id uuid)
returns public.grant_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.grant_applications;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into app from public.grant_applications where id = _application_id for update;
  if not found then
    raise exception 'grant_application_not_found';
  end if;

  if app.state <> 'awarded' then
    raise exception 'invalid_state';
  end if;

  update public.grant_applications
  set state = 'expended'
  where id = _application_id
  returning * into app;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.grant_application.expended',
    'grant_application',
    app.id,
    jsonb_build_object('state', app.state)
  );

  return app;
end;
$$;

revoke all on function public.mark_grant_expended(uuid) from public;
grant execute on function public.mark_grant_expended(uuid) to authenticated;

commit;
