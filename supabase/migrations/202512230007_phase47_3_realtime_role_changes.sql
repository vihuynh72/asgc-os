-- PHASE 47.3 — Enable Realtime for role_assignments table
-- This allows clients to receive real-time notifications when their roles change

-- Enable realtime for role_assignments table
alter publication supabase_realtime add table public.role_assignments;

-- Set REPLICA IDENTITY FULL so that UPDATE events include the old record values.
-- This is required to detect when ends_at changes from NULL to a value (role revocation).
alter table public.role_assignments replica identity full;

-- Note: Supabase RLS is automatically applied to realtime subscriptions,
-- so users can only receive updates for their own role_assignments.
