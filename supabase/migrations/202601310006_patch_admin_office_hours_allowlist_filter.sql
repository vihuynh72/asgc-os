-- PATCH — Admin Office Hours: filter to invite-allowlisted users only
--
-- Rule:
-- - Admin Office Hours UI/exports should not show any names/emails for users who are not allowlisted.
-- - Allowlist source of truth: public.is_email_allowlisted(email) (invites_allowlist + blocklist rules).

begin;

-- Helper: resolve which user_ids are allowlisted (by profile_private.email).
create or replace function public.allowlisted_user_ids(_user_ids uuid[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select pp.id
  from public.profile_private pp
  where (_user_ids is null or pp.id = any(_user_ids))
    and pp.email is not null
    and public.is_email_allowlisted(pp.email) = true;
$$;

revoke all on function public.allowlisted_user_ids(uuid[]) from public;
revoke all on function public.allowlisted_user_ids(uuid[]) from authenticated;
grant execute on function public.allowlisted_user_ids(uuid[]) to service_role;

-- Helper: admin list of users (for dropdown filters, etc), allowlisted only.
create or replace function public.admin_list_allowlisted_users(_limit integer default 500)
returns table (
  id uuid,
  email text,
  display_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    pp.email,
    p.display_name,
    p.status,
    p.created_at
  from public.profiles p
  join public.profile_private pp on pp.id = p.id
  where pp.email is not null
    and public.is_email_allowlisted(pp.email) = true
  order by p.created_at desc
  limit greatest(1, least(coalesce(_limit, 500), 2000));
$$;

revoke all on function public.admin_list_allowlisted_users(integer) from public;
revoke all on function public.admin_list_allowlisted_users(integer) from authenticated;
grant execute on function public.admin_list_allowlisted_users(integer) to service_role;

commit;

