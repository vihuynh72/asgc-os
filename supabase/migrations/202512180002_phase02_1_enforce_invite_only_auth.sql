-- PHASE 02.1 — Enforce invite-only auth at the database layer
-- Prevents bypassing the app allowlist by calling Supabase Auth directly with the anon key.
--
-- Allowlist matching rules:
-- - Exact email match: invites_allowlist.email_normalized = lower(trim(email))
-- - Domain match: invites_allowlist.email_normalized = '@' || domain (e.g. '@gcccd.edu')

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
  )
  select exists (
    select 1
    from public.invites_allowlist ia, n, d
    where ia.is_active = true
      and (
        ia.email_normalized = n.email_norm
        or (d.domain <> '' and ia.email_normalized = ('@' || d.domain))
      )
  );
$$;

revoke all on function public.is_email_allowlisted(text) from public;
revoke all on function public.is_email_allowlisted(text) from authenticated;
grant execute on function public.is_email_allowlisted(text) to service_role;

create or replace function public.enforce_invite_only_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or char_length(btrim(new.email)) = 0 then
    raise exception 'email_required';
  end if;

  if not public.is_email_allowlisted(new.email) then
    raise exception 'email_not_allowed';
  end if;

  return new;
end;
$$;

-- Important: this trigger must be executable by whatever internal Supabase role inserts into auth.users.
-- Trigger functions cannot be called directly anyway, so leaving EXECUTE to PUBLIC is safe here.

drop trigger if exists trg_auth_users_enforce_allowlist on auth.users;
create trigger trg_auth_users_enforce_allowlist
before insert on auth.users
for each row
execute function public.enforce_invite_only_auth_users();

commit;
