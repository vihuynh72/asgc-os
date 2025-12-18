-- Seed president email and allowlist (idempotent)
begin;

insert into public.invites_allowlist (email, is_active, notes)
values
  ('asgc.president@gcccd.edu', true, 'Ensure president can sign up (seed)')
on conflict (email_normalized)
do update set
  is_active = true,
  revoked_at = null;

insert into public.bootstrap_role_grants (email, role_key, term_id, notes)
values
  ('asgc.president@gcccd.edu', 'president', (select id from public.terms where is_current limit 1), 'Seed: president bootstrap role')
on conflict (email_normalized, role_key, term_id)
where is_active and consumed_at is null
do update set
  is_active = true;

commit;
