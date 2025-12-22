-- Phase 31-40 RLS smoke checks (finance + grants)
-- Replace placeholders:
--   <MEMBER_UID>, <EXEC_UID>, <BOARD_UID>, <ADMIN_UID>

-- As MEMBER (requestor)
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: cannot read budget_lines
select * from public.budget_lines limit 1;

-- Expect: can create draft funding request via RPC (requires valid committee_id + breakdown_json)
-- select * from public.create_funding_request('<COMMITTEE_ID>', 'Test', 'Purpose', 10.00, '[{"description":"Item","amount":10}]'::jsonb);

-- Expect: cannot read config_finance
select * from public.config_finance;

-- As EXEC (VP Finance, etc.)
select set_config('request.jwt.claim.sub', '<EXEC_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: can read budget_lines and config_finance
select * from public.budget_lines limit 5;
select * from public.config_finance;

-- Expect: can read funding_requests
select * from public.funding_requests limit 5;

-- As BOARD
select set_config('request.jwt.claim.sub', '<BOARD_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: can read submitted/scheduled funding requests (if any)
select * from public.funding_requests where state in ('submitted','scheduled_for_vote') limit 5;

-- As ADMIN
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: can insert/update budget lines
-- insert into public.budget_lines (fiscal_year, name, category, allocated_amount) values (2025, 'Test', 'Ops', 100.00);

-- Expect: can read expenses and grants
select * from public.expenses limit 5;
select * from public.grant_cycles limit 5;
select * from public.grant_applications limit 5;
