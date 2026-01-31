-- PATCH — Office Hours kiosk check-in photos
--
-- Adds:
-- - Storage bucket for kiosk check-in photos
-- - office_hour_sessions columns to reference uploaded photo

begin;

-- 1) DB columns.
alter table public.office_hour_sessions
  add column if not exists kiosk_checkin_photo_bucket text null,
  add column if not exists kiosk_checkin_photo_path text null,
  add column if not exists kiosk_checkin_photo_mime text null,
  add column if not exists kiosk_checkin_photo_uploaded_at timestamptz null,
  add column if not exists kiosk_checkin_photo_deleted_at timestamptz null;

create index if not exists office_hour_sessions_kiosk_photo_idx
  on public.office_hour_sessions (checkin_at)
  where kiosk_checkin_photo_path is not null;

-- 2) Storage bucket (Supabase Storage).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'office-hours-kiosk',
      'office-hours-kiosk',
      false,
      5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

commit;

