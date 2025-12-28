-- Phase 13 RLS smoke checks (presence tokens)
-- Run in Supabase SQL editor OR via psql with appropriate JWT claim simulation.
--
-- JWT simulation in SQL editor:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- Replace placeholders:
--   <MEMBER_UID>, <ADMIN_UID>

-- 1) As MEMBER: should NOT be able to read token secrets or tokens.
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: permission denied / RLS denial (no SELECT policy).
select * from public.presence_token_secrets;
select * from public.presence_tokens;

-- Expect: permission denied (execute revoked).
select * from public.issue_presence_pin('00000000-0000-0000-0000-000000000000');

-- 2) As ADMIN (JWT): still no direct access via authenticated; access is via server route (service role).
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: permission denied / RLS denial.
select * from public.presence_token_secrets;
select * from public.presence_tokens;

-- Expect: permission denied (execute revoked).
select * from public.issue_presence_pin('00000000-0000-0000-0000-000000000000');
