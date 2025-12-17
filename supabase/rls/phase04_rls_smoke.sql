-- Phase 04 RLS smoke checks
-- Run in Supabase SQL editor after applying migrations.
-- These are manual assertions (read outputs / row counts).

-- 0) Setup: create two test users in auth.users (optional), or use real accounts.
-- In Supabase SQL editor, you can simulate JWT claims like this:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1) Non-admin user should be able to read directory-safe profile fields.
-- Expect: returns multiple rows (active users), but profile.email is NULL.
select id, display_name, status, email
from public.profiles
limit 20;

-- 2) Non-admin user should NOT be able to read other users' private email.
-- Expect: 0 rows (unless you set sub to that exact user id).
select id, email
from public.profile_private
where id <> auth.uid()
limit 5;

-- 3) Non-admin user can read own private email.
-- Expect: 1 row with your email.
select id, email
from public.profile_private
where id = auth.uid();

-- 4) Role assignments directory visibility.
-- Expect: shows active role assignments for current term + global (advisor).
select user_id, role_key, term_id, ends_at
from public.role_assignments
where ends_at is null
limit 50;

-- 5) Sensitive tables remain server-only.
-- Expect: permission denied / 0 rows depending on policy. (Currently: no policies => should error.)
select * from public.invites_allowlist limit 1;
select * from public.bootstrap_role_grants limit 1;
