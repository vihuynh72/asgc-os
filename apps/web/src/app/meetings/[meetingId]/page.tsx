import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { MeetingHubClient } from "./meeting-hub-client";

type Meeting = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
  remote_url: string | null;
  livestream_url: string | null;
  public_comment_instructions: string | null;
  notice_posted_at: string | null;
  agenda_posted_at: string | null;
  minutes_posted_at: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

type AgendaItem = {
  id: string;
  meeting_id: string;
  submitted_by: string;
  title: string;
  category: string;
  background: string | null;
  recommended_motion: string | null;
  fiscal_impact: string | null;
  attachments_json: unknown;
  state: string;
  is_late: boolean;
  created_at: string;
  updated_at: string;
};

type DeadlineInfo = {
  meeting_id: string;
  starts_at: string;
  submission_deadline: string;
  posting_deadline: string;
  is_submission_open: boolean;
  is_past_deadline: boolean;
  is_special: boolean;
};

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

type Params = Promise<{ meetingId: string }>;

export default async function MeetingDetailPage({ params }: { params: Params }) {
  const { meetingId } = await params;
  const supabase = await getSupabaseServerComponentClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return notFound();
  }

  // Check admin status
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  const isAdminUser = !adminErr && !!isAdmin;

  // Get meeting
  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingErr || !meeting) {
    return notFound();
  }

  // Get agenda items
  const { data: agendaItems } = await supabase.rpc("meeting_agenda_items", {
    _meeting_id: meetingId,
  });

  // Get deadline info
  const { data: deadline } = await supabase.rpc("meeting_deadline_info", {
    _meeting_id: meetingId,
  });

  const typedMeeting = meeting as Meeting;
  let canManageDocs = isAdminUser;

  if (!canManageDocs && typedMeeting.committee_id) {
    const { data: chairMembership } = await supabase
      .from("committee_memberships")
      .select("role")
      .eq("committee_id", typedMeeting.committee_id)
      .eq("user_id", user.id)
      .maybeSingle();

    canManageDocs = chairMembership?.role === "chair";
  }
  const typedItems = (agendaItems ?? []) as AgendaItem[];
  const typedDeadline = (Array.isArray(deadline) ? deadline[0] : deadline) as DeadlineInfo | null;

  const { data: officeTzData } = await supabase.rpc("office_timezone");
  const officeTz = typeof officeTzData === "string" && officeTzData.length > 0 ? officeTzData : null;

  const { data: meetingDocs } = await supabase.rpc("list_docs", {
    _doc_type: null,
    _committee_id: null,
    _meeting_id: meetingId,
    _visibility: null,
    _limit: 100,
    _offset: 0,
  });
  const typedDocs = (meetingDocs ?? []) as DocRow[];
  const meetingTypeLabel = (() => {
    switch (typedMeeting.meeting_type) {
      case "board":
        return "Board";
      case "committee":
        return "Committee";
      case "icc":
        return "ICC";
      case "special":
        return "Special";
      default:
        return typedMeeting.meeting_type;
    }
  })();

  return (
    <PageShell title={typedMeeting.title} description={`${meetingTypeLabel} meeting`}>
      <MeetingHubClient
        meeting={typedMeeting}
        initialItems={typedItems}
        initialDeadline={typedDeadline}
        initialDocs={typedDocs}
        officeTz={officeTz}
        isAdmin={isAdminUser}
        canManageDocs={canManageDocs}
        userId={user.id}
      />
    </PageShell>
  );
}
