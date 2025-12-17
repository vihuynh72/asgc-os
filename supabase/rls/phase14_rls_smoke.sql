-- Phase 14 RLS smoke checks (office hours check-in RPC)
-- Replace placeholders:
--   <MEMBER_UID>
-- Notes:
-- - Check-in/out uses authenticated RPCs that run as SECURITY DEFINER.
-- - Direct INSERT/UPDATE on office_hour_sessions should remain blocked.

-- As MEMBER
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: direct insert denied (no policy)
insert into public.office_hour_sessions (user_id, checkin_at, status) values (auth.uid(), now(), 'open');

-- Expect: check-in RPC callable (requires configured office + valid PIN)
-- select * from public.check_in_office_hours(32.0, -117.0, '123456');
