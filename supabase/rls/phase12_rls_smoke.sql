-- Phase 12 RLS smoke checks (office_hour_requirements)
-- Run in Supabase SQL editor OR via psql with appropriate JWT claim simulation.
--
-- JWT simulation in SQL editor:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- Replace placeholders:
--   <MEMBER_UID>, <ADMIN_UID>

-- 1) As MEMBER: should be able to read requirements, but not write.
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from public.office_hour_requirements;

-- Expect: permission denied or RLS denial.
update public.office_hour_requirements set weekly_total_hours = weekly_total_hours where true;

-- 2) As ADMIN (JWT): should also be able to read, but still not write via authenticated.
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from public.office_hour_requirements;

-- Expect: permission denied (writes happen via service role / admin API route)
update public.office_hour_requirements set weekly_total_hours = weekly_total_hours where true;
