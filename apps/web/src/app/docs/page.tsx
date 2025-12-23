import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { DocsPanel } from "./docs-panel";

type DocRow = {
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

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type MeetingRow = {
  id: string;
  title: string;
  starts_at: string;
  committee_id: string | null;
};

export default async function DocsPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Fetch docs using RPC (visibility-aware)
  const { data: docsData, error: docsError } = await supabase.rpc("list_docs", {
    _doc_type: null,
    _committee_id: null,
    _meeting_id: null,
    _visibility: null,
    _limit: 50,
    _offset: 0,
  });

  // Fetch committees for filters
  const { data: committeesData } = await supabase
    .from("committees")
    .select("id, committee_key, name")
    .order("name");

  const { data: meetingsData } = await supabase
    .from("meetings")
    .select("id,title,starts_at,committee_id")
    .order("starts_at", { ascending: false })
    .limit(50);

  let canUseRestricted = false;
  if (userId) {
    const [{ data: isAdmin }, { data: isExecutive }] = await Promise.all([
      supabase.rpc("is_admin", { _uid: userId }),
      supabase.rpc("is_executive", { _uid: userId }),
    ]);
    canUseRestricted = !!isAdmin || !!isExecutive;
  }

  const docs = (docsData ?? []) as DocRow[];
  const committees = (committeesData ?? []) as CommitteeRow[];
  const meetings = (meetingsData ?? []) as MeetingRow[];

  return (
    <PageShell
      title="Docs"
      description="Browse and upload documents, minutes, and reports."
    >
      {docsError ? (
        <div className="text-sm text-red-600">Error: {docsError.message}</div>
      ) : (
        <DocsPanel initialDocs={docs} committees={committees} meetings={meetings} canUseRestricted={canUseRestricted} />
      )}
    </PageShell>
  );
}
