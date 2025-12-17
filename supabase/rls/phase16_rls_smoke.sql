-- Phase 16 RLS smoke checks (timesheet + admin weekly export)
-- Replace placeholders:
--   <MEMBER_UID>, <ADMIN_UID>

-- As MEMBER
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: can view own timesheet RPCs
select * from public.my_timesheet_sessions(null);
select * from public.my_timesheet_exceptions(null);

-- Expect: forbidden
select * from public.admin_weekly_hours(null);

-- As ADMIN (must have advisor or current-term president)
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: returns rows
select * from public.admin_weekly_hours(null);
