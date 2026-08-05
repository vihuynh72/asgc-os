-- PATCH — Safe current-term switch without identity-bound role assignment
begin;

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

  select * into t from public.terms where id = term_id;
  return t;
end;
$$;

revoke all on function public.set_current_term(uuid) from PUBLIC, anon;
grant execute on function public.set_current_term(uuid) to authenticated, service_role;

commit;
