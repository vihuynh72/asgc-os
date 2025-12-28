export type DocRow = {
  id: string;
  doc_type: string;
  title: string;
  description: string | null;
  content_text: string | null;
  storage_path: string | null;
  storage_bucket: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: string;
  committee_id: string | null;
  meeting_id: string | null;
  version_of_doc_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};
