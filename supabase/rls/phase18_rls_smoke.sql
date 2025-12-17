-- Phase 18 RLS smoke checks (office-hours reminders)
-- Run in Supabase SQL editor OR via psql with JWT claim simulation.
--
-- JWT simulation in SQL editor:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- Replace placeholders:
--   <MEMBER_UID>

-- 1) As MEMBER: should NOT be able to execute service-only reminder worker functions.
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: permission denied (execute revoked).
select * from public.enqueue_shift_reminders(now());
select public.mark_missed_shifts(now());
select * from public.claim_notification_log(10, 'test', 'office_hours.shift_');

-- 2) As MEMBER: should be able to read office_config and call office_timezone/is_quiet_hours (non-sensitive).
select * from public.office_config;
select public.office_timezone();
select public.is_quiet_hours(now());
