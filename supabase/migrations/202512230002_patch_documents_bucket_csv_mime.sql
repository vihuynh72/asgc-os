-- Patch: Add text/csv MIME type to documents bucket for finance exports
-- Fixes: Finance Exports return unsupported MIME type error

begin;

-- Update the documents bucket to include text/csv in allowed_mime_types
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain',
  'text/csv'
]
where id = 'documents';

commit;
