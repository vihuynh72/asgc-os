-- PHASE 20 — Coverage workflow v1 (request + claim)
-- Source of truth: 04_office_hours_spec.md (coverage)

begin;

-- 1) Add covered_by column to shifts.
alter table public.office_hour_shifts
  add column if not exists covered_by_user_id uuid null references public.profiles(id) on delete set null;

-- 2) Coverage requests table.
create table if not exists public.coverage_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.office_hour_shifts(id) on delete cascade,
  requestor_user_id uuid not null references public.profiles(id) on delete cascade,
  claimer_user_id uuid null references public.profiles(id) on delete set null,
  status text not null default 'open',
  notes text null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz null,
  cancelled_at timestamptz null,
  constraint coverage_requests_status_check check (status in ('open','claimed','cancelled'))
);

create index if not exists coverage_requests_shift_idx on public.coverage_requests (shift_id);
create index if not exists coverage_requests_requestor_idx on public.coverage_requests (requestor_user_id);
create index if not exists coverage_requests_status_idx on public.coverage_requests (status);

alter table public.coverage_requests enable row level security;

-- RLS: requestor sees own, admins see all, members see open requests.
create policy "coverage_requests_select_own"
  on public.coverage_requests
  for select
  to authenticated
  using (requestor_user_id = auth.uid());

create policy "coverage_requests_select_open"
  on public.coverage_requests
  for select
  to authenticated
  using (status = 'open');

create policy "coverage_requests_select_admin"
  on public.coverage_requests
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- 3) Request coverage RPC (member creates request for own shift).
create or replace function public.request_coverage(_shift_id uuid, _notes text default null)
returns public.coverage_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row public.office_hour_shifts;
  req public.coverage_requests;
  tz text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into shift_row
  from public.office_hour_shifts s
  where s.id = _shift_id;

  if not found then
    raise exception 'shift_not_found';
  end if;

  if shift_row.user_id <> auth.uid() then
    raise exception 'not_your_shift';
  end if;

  if shift_row.status <> 'scheduled' then
    raise exception 'shift_not_scheduled';
  end if;

  if shift_row.starts_at <= now() then
    raise exception 'shift_already_started';
  end if;

  -- Check for existing open request.
  if exists (
    select 1 from public.coverage_requests cr
    where cr.shift_id = _shift_id and cr.status = 'open'
  ) then
    raise exception 'coverage_already_requested';
  end if;

  insert into public.coverage_requests (shift_id, requestor_user_id, status, notes)
  values (_shift_id, auth.uid(), 'open', _notes)
  returning * into req;

  -- Audit
  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.coverage_requested',
    'coverage_request',
    req.id,
    jsonb_build_object('shift_id', _shift_id, 'notes', _notes)
  );

  -- Notify active members (excluding requestor) — enqueue one notification per eligible user.
  tz := public.office_timezone();

  insert into public.notification_log (
    actor_user_id,
    user_id,
    type,
    channel,
    provider,
    to_email,
    subject,
    status,
    send_after,
    dedupe_key,
    metadata
  )
  select
    auth.uid(),
    p.id,
    'office_hours.coverage_requested',
    'email',
    'resend',
    pp.email,
    'Office hours coverage needed',
    'queued',
    public.defer_if_quiet_hours(now()),
    'office_hours.coverage_requested:' || req.id::text || ':' || p.id::text,
    jsonb_build_object(
      'coverage_request_id', req.id,
      'shift_id', _shift_id,
      'starts_at', shift_row.starts_at,
      'ends_at', shift_row.ends_at,
      'office_tz', tz,
      'starts_at_local', to_char(shift_row.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'ends_at_local', to_char(shift_row.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'requestor_user_id', auth.uid()
    )
  from public.profiles p
  join public.profile_private pp on pp.id = p.id
  where p.status = 'active'
    and p.id <> auth.uid()
    and pp.email is not null
    and char_length(btrim(pp.email)) > 0
  on conflict (dedupe_key) do nothing;

  return req;
end;
$$;

revoke all on function public.request_coverage(uuid, text) from public;
grant execute on function public.request_coverage(uuid, text) to authenticated;

-- 4) Claim coverage RPC.
create or replace function public.claim_coverage(_request_id uuid)
returns public.coverage_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.coverage_requests;
  shift_row public.office_hour_shifts;
  tz text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into req
  from public.coverage_requests cr
  where cr.id = _request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if req.status <> 'open' then
    raise exception 'request_not_open';
  end if;

  if req.requestor_user_id = auth.uid() then
    raise exception 'cannot_claim_own_request';
  end if;

  select * into shift_row
  from public.office_hour_shifts s
  where s.id = req.shift_id;

  if shift_row.starts_at <= now() then
    raise exception 'shift_already_started';
  end if;

  -- Update request.
  update public.coverage_requests cr
  set status = 'claimed', claimer_user_id = auth.uid(), claimed_at = now()
  where cr.id = _request_id
  returning * into req;

  -- Update shift to reflect coverage.
  update public.office_hour_shifts s
  set covered_by_user_id = auth.uid()
  where s.id = req.shift_id;

  -- Audit
  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.coverage_claimed',
    'coverage_request',
    req.id,
    jsonb_build_object('shift_id', req.shift_id, 'requestor_user_id', req.requestor_user_id)
  );

  -- Notify requestor.
  tz := public.office_timezone();

  insert into public.notification_log (
    actor_user_id,
    user_id,
    type,
    channel,
    provider,
    to_email,
    subject,
    status,
    send_after,
    dedupe_key,
    metadata
  )
  select
    auth.uid(),
    req.requestor_user_id,
    'office_hours.coverage_claimed',
    'email',
    'resend',
    pp.email,
    'Your shift coverage was claimed',
    'queued',
    public.defer_if_quiet_hours(now()),
    'office_hours.coverage_claimed:' || req.id::text,
    jsonb_build_object(
      'coverage_request_id', req.id,
      'shift_id', req.shift_id,
      'starts_at', shift_row.starts_at,
      'ends_at', shift_row.ends_at,
      'office_tz', tz,
      'starts_at_local', to_char(shift_row.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'ends_at_local', to_char(shift_row.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
      'claimer_user_id', auth.uid()
    )
  from public.profile_private pp
  where pp.id = req.requestor_user_id
    and pp.email is not null
    and char_length(btrim(pp.email)) > 0
  on conflict (dedupe_key) do nothing;

  return req;
end;
$$;

revoke all on function public.claim_coverage(uuid) from public;
grant execute on function public.claim_coverage(uuid) to authenticated;

-- 5) Cancel coverage request RPC.
create or replace function public.cancel_coverage_request(_request_id uuid)
returns public.coverage_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.coverage_requests;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into req
  from public.coverage_requests cr
  where cr.id = _request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if req.requestor_user_id <> auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if req.status <> 'open' then
    raise exception 'request_not_open';
  end if;

  update public.coverage_requests cr
  set status = 'cancelled', cancelled_at = now()
  where cr.id = _request_id
  returning * into req;

  -- Audit
  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.coverage_cancelled',
    'coverage_request',
    req.id,
    jsonb_build_object('shift_id', req.shift_id)
  );

  return req;
end;
$$;

revoke all on function public.cancel_coverage_request(uuid) from public;
grant execute on function public.cancel_coverage_request(uuid) to authenticated;

-- 6) List open coverage requests (member RPC).
create or replace function public.open_coverage_requests()
returns setof public.coverage_requests
language sql
stable
as $$
  select cr.*
  from public.coverage_requests cr
  join public.office_hour_shifts s on s.id = cr.shift_id
  where cr.status = 'open'
    and s.starts_at > now()
  order by s.starts_at asc;
$$;

revoke all on function public.open_coverage_requests() from public;
grant execute on function public.open_coverage_requests() to authenticated;

commit;
