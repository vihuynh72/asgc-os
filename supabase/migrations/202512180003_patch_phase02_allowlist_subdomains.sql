-- PATCH — Phase 02 allowlist: allow domain entries to match subdomains
-- Example: an allowlist entry of '@gcccd.edu' matches:
-- - user@gcccd.edu
-- - user@student.gcccd.edu

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
  )
  select exists (
    select 1
    from public.invites_allowlist ia, n
    where ia.is_active = true
      and (
        ia.email_normalized = n.email_norm
        or (
          (select domain from d) <> ''
          and ia.email_normalized in (select '@' || s.suffix from suffixes s)
        )
      )
  );
$$;

revoke all on function public.is_email_allowlisted(text) from public;
revoke all on function public.is_email_allowlisted(text) from authenticated;
grant execute on function public.is_email_allowlisted(text) to service_role;

commit;

