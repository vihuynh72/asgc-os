-- Phase 10 RLS smoke checks (notification_log)
-- Run in Supabase SQL editor OR via psql with appropriate JWT claim simulation.
--
-- JWT simulation in SQL editor:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- Replace placeholders:
--   <MEMBER_UID>, <ADMIN_UID>

-- 1) As MEMBER: should NOT be able to read notification_log.
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: 0 rows (RLS) or error depending on environment; should not expose rows.
select * from public.notification_log order by created_at desc limit 5;

-- 2) As ADMIN: should be able to read notification_log.
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: returns rows after you use the admin UI "Send test email".
select created_at, actor_user_id, to_email, type, channel, provider, status, provider_message_id, error_message
from public.notification_log
order by created_at desc
limit 20;
