-- Harden views and owner-rights helpers that were already deployed before the
-- public-release audit. PostgreSQL 17 is configured for local development, so
-- security_invoker views enforce the underlying tables' RLS policies.
begin;

-- Count every kiosk OTP request in a fixed window before any roster lookup.
-- Subjects are HMAC-SHA256 values computed by the server, so this table never
-- stores raw IP addresses, member IDs, or phone numbers. The single-row UPSERT
-- serializes concurrent attempts for the same subject.
create table if not exists public.office_hours_kiosk_otp_rate_limits (
  limiter_scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (limiter_scope, key_hash),
  constraint office_hours_kiosk_otp_rate_limits_scope_check
    check (limiter_scope in ('ip', 'member', 'phone')),
  constraint office_hours_kiosk_otp_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint office_hours_kiosk_otp_rate_limits_attempt_count_check
    check (attempt_count > 0),
  constraint office_hours_kiosk_otp_rate_limits_window_check
    check (expires_at > window_started_at)
);

create index if not exists office_hours_kiosk_otp_rate_limits_expires_idx
  on public.office_hours_kiosk_otp_rate_limits (expires_at);

alter table public.office_hours_kiosk_otp_rate_limits enable row level security;
revoke all on table public.office_hours_kiosk_otp_rate_limits
  from PUBLIC, anon, authenticated, service_role;

comment on table public.office_hours_kiosk_otp_rate_limits is
  'Short-lived, HMAC-pseudonymized counters for kiosk OTP request throttling.';
comment on column public.office_hours_kiosk_otp_rate_limits.key_hash is
  'HMAC-SHA256 of a domain-separated IP, member ID, or normalized phone subject; never raw PII.';

create or replace function public.consume_office_hours_kiosk_otp_rate_limit(
  _scope text,
  _key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_time timestamptz := clock_timestamp();
  max_attempts integer;
  window_length interval := interval '15 minutes';
  current_attempt_count integer;
begin
  max_attempts := case _scope
    when 'ip' then 15
    when 'member' then 5
    when 'phone' then 5
    else null
  end;

  if max_attempts is null then
    raise exception 'invalid OTP rate-limit scope' using errcode = '22023';
  end if;
  if _key_hash is null or _key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid OTP rate-limit key' using errcode = '22023';
  end if;

  -- Each request removes up to 100 expired counters and creates at most one,
  -- bounding retained state without requiring a separate scheduled cleanup.
  delete from public.office_hours_kiosk_otp_rate_limits as expired
  where (expired.limiter_scope, expired.key_hash) in (
    select stale.limiter_scope, stale.key_hash
    from public.office_hours_kiosk_otp_rate_limits as stale
    where stale.expires_at <= request_time
    order by stale.expires_at
    limit 100
  );

  insert into public.office_hours_kiosk_otp_rate_limits as current_bucket (
    limiter_scope,
    key_hash,
    window_started_at,
    attempt_count,
    expires_at,
    updated_at
  )
  values (
    _scope,
    _key_hash,
    request_time,
    1,
    request_time + window_length,
    request_time
  )
  on conflict (limiter_scope, key_hash) do update
  set
    window_started_at = case
      when current_bucket.expires_at <= request_time then request_time
      else current_bucket.window_started_at
    end,
    attempt_count = case
      when current_bucket.expires_at <= request_time then 1
      else least(current_bucket.attempt_count, max_attempts) + 1
    end,
    expires_at = case
      when current_bucket.expires_at <= request_time then request_time + window_length
      else current_bucket.expires_at
    end,
    updated_at = request_time
  returning current_bucket.attempt_count into current_attempt_count;

  return current_attempt_count <= max_attempts;
end;
$$;

revoke all on function public.consume_office_hours_kiosk_otp_rate_limit(text, text)
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.consume_office_hours_kiosk_otp_rate_limit(text, text)
  to service_role;

-- Raw request IP storage is no longer needed. Clear deployed values and prevent
-- older code paths from retaining new ones while keeping either application or
-- migration deployment order safe.
drop index if exists public.office_hours_kiosk_otp_challenges_request_ip_created_idx;

create or replace function public.scrub_office_hours_kiosk_otp_request_ip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.request_ip := null;
  return new;
end;
$$;

revoke all on function public.scrub_office_hours_kiosk_otp_request_ip()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists trg_scrub_office_hours_kiosk_otp_request_ip
  on public.office_hours_kiosk_otp_challenges;
create trigger trg_scrub_office_hours_kiosk_otp_request_ip
before insert or update of request_ip on public.office_hours_kiosk_otp_challenges
for each row
execute function public.scrub_office_hours_kiosk_otp_request_ip();

update public.office_hours_kiosk_otp_challenges
set request_ip = null
where request_ip is not null;
alter table public.office_hours_kiosk_otp_challenges
  drop constraint if exists office_hours_kiosk_otp_challenges_request_ip_deprecated_check;
alter table public.office_hours_kiosk_otp_challenges
  add constraint office_hours_kiosk_otp_challenges_request_ip_deprecated_check
  check (request_ip is null);
comment on column public.office_hours_kiosk_otp_challenges.request_ip is
  'Deprecated. Raw request IP storage is prohibited; rate limits use HMAC-pseudonymized keys.';

alter view public.v_my_weekly_hours set (security_invoker = true);
alter view public.v_budget_burndown set (security_invoker = true);
alter view public.v_icc_quorum_summary set (security_invoker = true);
alter view public.v_club_charter_completion set (security_invoker = true);

revoke all on table public.v_my_weekly_hours from PUBLIC, anon;
revoke all on table public.v_budget_burndown from PUBLIC, anon;
revoke all on table public.v_icc_quorum_summary from PUBLIC, anon;
revoke all on table public.v_club_charter_completion from PUBLIC, anon;

grant select on table public.v_my_weekly_hours to authenticated;
grant select on table public.v_budget_burndown to authenticated;
grant select on table public.v_icc_quorum_summary to authenticated;
grant select on table public.v_club_charter_completion to authenticated;

revoke all on function public._office_hours_check_in_core(uuid, double precision, double precision, timestamptz, boolean)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public._office_hours_presence_ping_core(uuid, timestamptz, boolean)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public._office_hours_presence_core(uuid, double precision, double precision, timestamptz, boolean)
  from PUBLIC, anon, authenticated, service_role;

-- Trigger functions are invoked by their triggers and have no direct client
-- API. Remove PostgreSQL's default PUBLIC execute privilege.
revoke all on function public.auto_add_to_general_committee() from PUBLIC, anon, authenticated, service_role;
revoke all on function public.enforce_invite_only_auth_users() from PUBLIC, anon, authenticated, service_role;
revoke all on function public.enforce_task_assignment_rules() from PUBLIC, anon, authenticated, service_role;
revoke all on function public.handle_new_auth_user() from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trigger_refresh_club_eligibility_from_checklist() from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trigger_refresh_club_eligibility_from_clubs() from PUBLIC, anon, authenticated, service_role;

-- Remove the old identity-specific term hook while retaining the normal admin
-- and service-role term switching behavior.
create or replace function public.set_current_term(term_id uuid)
returns public.terms
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.terms;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if term_id is null then
    raise exception 'term_id is required';
  end if;

  select * into t from public.terms where id = term_id;
  if not found then
    raise exception 'term not found';
  end if;

  update public.terms set is_current = false where is_current;
  update public.terms set is_current = true where id = term_id;

  select * into t from public.terms where id = term_id;
  return t;
end;
$$;

revoke all on function public.set_current_term(uuid) from PUBLIC, anon;
grant execute on function public.set_current_term(uuid) to authenticated, service_role;
drop function if exists public.ensure_president_admin_for_current_term();

commit;
