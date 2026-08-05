-- Run as a database owner after applying all migrations.
-- The transaction is read-only in effect and always rolls back.
begin;

do $$
declare
  allowed boolean;
  attempt_index integer;
  challenge_id uuid;
  function_signature text;
  limiter_hash text;
  raw_request_ip text;
  role_name text;
  test_scope text;
  view_name text;
begin
  foreach function_signature in array array[
    'public._office_hours_check_in_core(uuid,double precision,double precision,timestamp with time zone,boolean)',
    'public._office_hours_presence_ping_core(uuid,timestamp with time zone,boolean)',
    'public._office_hours_presence_core(uuid,double precision,double precision,timestamp with time zone,boolean)',
    'public.scrub_office_hours_kiosk_otp_request_ip()'
  ]
  loop
    foreach role_name in array array['anon', 'authenticated', 'service_role']
    loop
      if has_function_privilege(role_name, function_signature, 'EXECUTE') then
        raise exception '% must not execute %', role_name, function_signature;
      end if;
    end loop;
  end loop;

  function_signature := 'public.consume_office_hours_kiosk_otp_rate_limit(text,text)';
  foreach role_name in array array['anon', 'authenticated']
  loop
    if has_function_privilege(role_name, function_signature, 'EXECUTE') then
      raise exception '% must not execute %', role_name, function_signature;
    end if;
  end loop;
  if not has_function_privilege('service_role', function_signature, 'EXECUTE') then
    raise exception 'service_role must execute %', function_signature;
  end if;

  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if has_table_privilege(
      role_name,
      'public.office_hours_kiosk_otp_rate_limits',
      'SELECT,INSERT,UPDATE,DELETE'
    ) then
      raise exception '% must not access the OTP rate-limit table directly', role_name;
    end if;
  end loop;

  foreach test_scope in array array['ip', 'member', 'phone']
  loop
    limiter_hash := repeat(
      case test_scope when 'ip' then 'a' when 'member' then 'b' else 'c' end,
      64
    );
    delete from public.office_hours_kiosk_otp_rate_limits
    where office_hours_kiosk_otp_rate_limits.limiter_scope = test_scope
      and key_hash = limiter_hash;

    for attempt_index in 1..(case when test_scope = 'ip' then 15 else 5 end)
    loop
      allowed := public.consume_office_hours_kiosk_otp_rate_limit(test_scope, limiter_hash);
      if not allowed then
        raise exception '% limiter blocked attempt % too early', test_scope, attempt_index;
      end if;
    end loop;

    allowed := public.consume_office_hours_kiosk_otp_rate_limit(test_scope, limiter_hash);
    if allowed then
      raise exception '% limiter did not block the first over-limit attempt', test_scope;
    end if;
  end loop;

  if exists (
    select 1
    from public.office_hours_kiosk_otp_challenges
    where request_ip is not null
  ) then
    raise exception 'raw kiosk OTP request IP values remain stored';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'office_hours_kiosk_otp_challenges'
      and t.tgname = 'trg_scrub_office_hours_kiosk_otp_request_ip'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    raise exception 'raw kiosk OTP request IP scrub trigger is missing or disabled';
  end if;

  select id into challenge_id
  from public.office_hours_kiosk_otp_challenges
  limit 1;

  if challenge_id is not null then
    update public.office_hours_kiosk_otp_challenges
    set request_ip = '203.0.113.10'
    where id = challenge_id;

    select request_ip into raw_request_ip
    from public.office_hours_kiosk_otp_challenges
    where id = challenge_id;

    if raw_request_ip is not null then
      raise exception 'raw kiosk OTP request IP scrub trigger did not clear a write';
    end if;
  end if;

  foreach view_name in array array[
    'v_my_weekly_hours',
    'v_budget_burndown',
    'v_icc_quorum_summary',
    'v_club_charter_completion'
  ]
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = view_name
        and 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
    ) then
      raise exception 'public.% is not a security_invoker view', view_name;
    end if;
  end loop;

  if to_regprocedure('public.ensure_president_admin_for_current_term()') is not null then
    raise exception 'identity-specific president safeguard still exists';
  end if;
end;
$$;

rollback;
