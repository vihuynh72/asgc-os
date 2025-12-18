-- Phase 15 RLS smoke checks (office hours check-out RPC)
-- Replace placeholders:
--   <MEMBER_UID>
-- Notes:
-- - Direct UPDATE on office_hour_sessions should remain blocked.

-- As MEMBER
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: direct update denied (no policy)
update public.office_hour_sessions set status = 'closed' where user_id = auth.uid();

-- Expect: check-out RPC callable (requires an open session)
-- select * from public.check_out_office_hours(32.0, -117.0);
