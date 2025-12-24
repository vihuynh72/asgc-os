-- PATCH — Ensure president admin role for the current term
begin;

create or replace function public.ensure_president_admin_for_current_term()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ct uuid;
  president_email text := 'asgc.president@gcccd.edu';
  uid uuid;
begin
  ct := public.current_term_id();
  if ct is null then
    return;
  end if;

  select id into uid
  from public.profile_private
  where lower(btrim(email)) = lower(btrim(president_email))
  limit 1;

  if uid is not null then
    if not exists (
      select 1
      from public.role_assignments
      where user_id = uid
        and role_key = 'president'
        and term_id = ct
        and ends_at is null
    ) then
      insert into public.role_assignments (user_id, role_key, term_id, starts_at, ends_at, is_primary)
      values (uid, 'president', ct, now(), null, true);
    end if;
  else
    insert into public.bootstrap_role_grants (email, role_key, term_id, is_active, notes)
    values (president_email, 'president', ct, true, 'Auto-ensure president admin for current term')
    on conflict (email_normalized, role_key, term_id)
    where is_active and consumed_at is null
    do update set is_active = true;
  end if;
end;
$$;

revoke all on function public.ensure_president_admin_for_current_term() from public;
revoke all on function public.ensure_president_admin_for_current_term() from authenticated;
grant execute on function public.ensure_president_admin_for_current_term() to service_role;

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
    -- Service role context is allowed.
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

  perform public.ensure_president_admin_for_current_term();

  select * into t from public.terms where id = term_id;
  return t;
end;
$$;

revoke all on function public.set_current_term(uuid) from public;
grant execute on function public.set_current_term(uuid) to authenticated;
grant execute on function public.set_current_term(uuid) to service_role;

select public.ensure_president_admin_for_current_term();

commit;
