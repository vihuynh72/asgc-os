-- PHASE 47.4 — Fix Realtime REPLICA IDENTITY for role_assignments
-- Set REPLICA IDENTITY FULL so that UPDATE events include the old record values.
-- This is required to detect when ends_at changes from NULL to a value (role revocation).

alter table public.role_assignments replica identity full;
