-- PATCH — Consume bootstrap role grants for existing users
--
-- Problem:
-- - bootstrap_role_grants are consumed by handle_new_auth_user() on auth.users INSERT.
-- - If a user already existed before a bootstrap grant was added, they never consume it.
--
-- Fix:
-- - Add an authenticated-executable RPC that consumes any active, unconsumed bootstrap grants
--   for the caller’s JWT email, inserting matching role_assignments and marking grants consumed.

begin;

create or replace function public.consume_bootstrap_role_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  email_norm text;
  grant_row record;
  resolved_term_id uuid;
  role_scope text;
  consumed_count integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  email_norm := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if email_norm = '' then
    return 0;
  end if;

  for grant_row in
    select g.*
    from public.bootstrap_role_grants g
    where g.email_normalized = email_norm
      and g.is_active = true
      and g.consumed_at is null
    order by g.created_at asc
  loop
    select r.scope into role_scope
    from public.roles r
    where r.role_key = grant_row.role_key;

    if role_scope is null then
      continue;
    end if;

    if role_scope = 'global' then
      resolved_term_id := null;
    else
      resolved_term_id := grant_row.term_id;
      if resolved_term_id is null then
        select t.id into resolved_term_id
        from public.terms t
        where t.is_current
        limit 1;
      end if;
    end if;

    begin
      insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
      values (uid, grant_row.role_key, resolved_term_id, now(), null, false);

      update public.bootstrap_role_grants
      set consumed_at = now(),
          consumed_by_user_id = uid
      where id = grant_row.id;

      consumed_count := consumed_count + 1;
    exception when others then
      -- If the assignment already exists or scope enforcement fails, do not consume.
      null;
    end;
  end loop;

  return consumed_count;
end;
$$;

revoke all on function public.consume_bootstrap_role_grants() from public;
grant execute on function public.consume_bootstrap_role_grants() to authenticated;

commit;

