-- Phase 09 RLS smoke checks (task_comments + task_attachments)
-- Run in Supabase SQL editor AFTER applying migrations:
-- - 202512160009_phase09_comments_attachments_v1.sql
-- (Optional but recommended): 202512160008_1_phase08_projects_fix.sql
--
-- These are manual assertions (read outputs / row counts / expected errors).
--
-- JWT simulation in SQL editor:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- You need:
-- - A "member" user: belongs to at least one committee with at least one task.
-- - An "admin" user: advisor (global) or president (current term).
--
-- Replace placeholders below:
--   <MEMBER_UID>, <ADMIN_UID>, <TASK_IN_MY_COMMITTEE>, <TASK_NOT_IN_MY_COMMITTEE>

-- 0) As MEMBER
select set_config('request.jwt.claim.sub', '<MEMBER_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 0.1) Sanity: you can see your committee-scoped tasks.
-- Expect: returns >= 1 row for tasks in your committees.
select id, committee_id, title from public.tasks limit 10;

-- 1) Insert a comment on a task in your committee.
-- Expect: 1 row inserted.
insert into public.task_comments (task_id, committee_id, body, created_by)
values ('<TASK_IN_MY_COMMITTEE>', '00000000-0000-0000-0000-000000000000', 'RLS smoke: hello', auth.uid())
returning id, task_id, committee_id, created_by, created_at;

-- 2) Read comments for that task (non-deleted only).
-- Expect: shows the inserted comment.
select id, task_id, body, created_by, created_at
from public.task_comments
where task_id = '<TASK_IN_MY_COMMITTEE>'
  and deleted_at is null
order by created_at asc;

-- 3) Attempt to edit comment body.
-- Expect: ERROR (either permission denied for column "body" or "comment body is immutable").
update public.task_comments
set body = 'attempted edit'
where task_id = '<TASK_IN_MY_COMMITTEE>'
  and created_by = auth.uid();

-- 4) Soft-delete a comment (only deleted_at/deleted_by are updatable for authenticated).
-- Expect: succeeds for a comment row you can see.
update public.task_comments
set deleted_at = now(),
    deleted_by = auth.uid()
where task_id = '<TASK_IN_MY_COMMITTEE>'
  and created_by = auth.uid()
  and deleted_at is null
returning id, deleted_at, deleted_by;

-- 5) Insert an attachment link (URL-only).
-- Expect: 1 row inserted.
insert into public.task_attachments (task_id, committee_id, url, label, created_by)
values ('<TASK_IN_MY_COMMITTEE>', '00000000-0000-0000-0000-000000000000', 'https://example.com', 'Example', auth.uid())
returning id, task_id, committee_id, url, label, created_by, created_at;

-- 6) Try to attach to a task NOT in your committee.
-- Expect: ERROR (RLS violation).
insert into public.task_comments (task_id, committee_id, body, created_by)
values ('<TASK_NOT_IN_MY_COMMITTEE>', '00000000-0000-0000-0000-000000000000', 'should fail', auth.uid());

-- 7) Non-admin cannot read audit_log.
-- Expect: 0 rows or ERROR (depending on RLS/plans); should not be able to see audit entries.
select * from public.audit_log order by occurred_at desc limit 5;

-- 8) As ADMIN: verify audit rows exist.
select set_config('request.jwt.claim.sub', '<ADMIN_UID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Expect: shows recent comment/attachment audit events.
select occurred_at, action_key, target_type, target_id, metadata
from public.audit_log
where action_key in (
  'task_comment.created',
  'task_comment.deleted',
  'task_attachment.created',
  'task_attachment.deleted'
)
order by occurred_at desc
limit 50;
