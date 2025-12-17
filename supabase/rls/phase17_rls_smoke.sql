-- Phase 17 RLS smoke checks (office hour shifts)
-- Replace placeholders:
--   <MEMBER_UID>, <ADMIN_UID>

-- As MEMBER
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: direct insert denied (no policy)
insert into public.office_hour_shifts (user_id, office_location_id, starts_at, ends_at)
values (auth.uid(), '00000000-0000-0000-0000-000000000000', now(), now() + interval '1 hour');

-- Expect: can call my shifts function
select * from public.my_office_hour_shifts_week(null);

-- As ADMIN
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: can create shift (requires valid office_location_id)
-- select * from public.admin_create_office_hour_shift('<MEMBER_UID>', now(), now() + interval '1 hour', null);
