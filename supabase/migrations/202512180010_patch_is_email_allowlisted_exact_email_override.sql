-- PATCH — Invite allowlist precedence
--
-- Make exact-email rules take precedence over domain rules:
-- - If an exact email row exists in invites_allowlist, its `is_active` controls access.
-- - Otherwise, domain entries (including subdomains) may allow access.
-- - Blocklist entries always deny (block wins).

begin;

create or replace function public.is_email_allowlisted(_email text)
returns boolean
language sql
stable
as $$
  with n as (
    select lower(btrim(coalesce(_email, ''))) as email_norm
  ),
  d as (
    select split_part((select email_norm from n), '@', 2) as domain
  ),
  parts as (
    select regexp_split_to_array((select domain from d), '\\.') as parts
  ),
  suffixes as (
    -- Build domain suffixes with at least 2 labels ("example.com").
    select array_to_string(parts[i:array_length(parts, 1)], '.') as suffix
    from parts, generate_series(1, array_length(parts, 1) - 1) as i
    where array_length(parts, 1) >= 2
  ),
  blocked as (
    select exists (
      select 1
      from public.invites_blocklist ib, n
      where ib.is_active = true
        and (
          ib.pattern_normalized = n.email_norm
          or (
            (select domain from d) <> ''
            and ib.pattern_normalized in (select '@' || s.suffix from suffixes s)
          )
        )
    ) as is_blocked
  ),
  email_rule as (
    select ia.is_active as email_is_active
    from public.invites_allowlist ia, n
    where ia.email_normalized = n.email_norm
    limit 1
  ),
  domain_allowed as (
    select exists (
      select 1
      from public.invites_allowlist ia
      where ia.is_active = true
        and (select domain from d) <> ''
        and ia.email_normalized in (select '@' || s.suffix from suffixes s)
    ) as is_allowed
  )
  select
    case
      when (select is_blocked from blocked) then false
      when exists (select 1 from email_rule) then (select email_is_active from email_rule)
      else (select is_allowed from domain_allowed)
    end;
$$;

revoke all on function public.is_email_allowlisted(text) from public;
revoke all on function public.is_email_allowlisted(text) from authenticated;
grant execute on function public.is_email_allowlisted(text) to service_role;

commit;

