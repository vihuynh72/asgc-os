-- PATCH — Office Hours kiosk selfies: quarantine + restore metadata
--
-- Supports an admin workflow where "delete" means quarantine:
-- - Move file to a quarantine path (recoverable for 30 days)
-- - Mark the original session selfie as deleted (hidden from normal viewers)
-- - Allow restore by moving back to the original path

begin;

alter table public.office_hour_sessions
  add column if not exists kiosk_checkin_photo_quarantine_bucket text null,
  add column if not exists kiosk_checkin_photo_quarantine_path text null,
  add column if not exists kiosk_checkin_photo_quarantined_at timestamptz null,
  add column if not exists kiosk_checkin_photo_quarantined_by uuid null,
  add column if not exists kiosk_checkin_photo_quarantine_reason text null,
  add column if not exists kiosk_checkin_photo_restored_at timestamptz null,
  add column if not exists kiosk_checkin_photo_restored_by uuid null;

create index if not exists office_hour_sessions_kiosk_photo_quarantine_idx
  on public.office_hour_sessions (checkin_at)
  where kiosk_checkin_photo_quarantine_path is not null;

commit;

