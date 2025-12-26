import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { AgendaItemsPanel } from "./agenda-items-panel";
import { MeetingActions } from "./meeting-actions";
import { MeetingDocsPanel } from "./meeting-docs-panel";

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
  const typedItems = (agendaItems ?? []) as AgendaItem[];
  const typedDeadline = (Array.isArray(deadline) ? deadline[0] : deadline) as DeadlineInfo | null;

  const { data: meetingDocs } = await supabase.rpc("list_docs", {
    _doc_type: null,
    _committee_id: null,
    _meeting_id: meetingId,
    _visibility: null,
    _limit: 100,
    _offset: 0,
  });
  const typedDocs = (meetingDocs ?? []) as DocRow[];

  function formatMeetingType(type: string): string {
    switch (type) {
      case "board":
        return "Board";
      case "committee":
        return "Committee";
      case "icc":
        return "ICC";
      case "special":
        return "Special";
      default:
        return type;
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return "Not posted";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Not posted";
    return d.toLocaleString();
  }

  const postingDeadline = typedDeadline?.posting_deadline ?? null;
  const agendaPostedAt = typedMeeting.agenda_posted_at;
  const noticePostedAt = typedMeeting.notice_posted_at;
  const agendaOnTime =
    agendaPostedAt && postingDeadline
      ? new Date(agendaPostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;
  const noticeOnTime =
    noticePostedAt && postingDeadline
      ? new Date(noticePostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;

  return (
    <PageShell
      title={typedMeeting.title}
      description={`${formatMeetingType(typedMeeting.meeting_type)} meeting`}
    >
      <div className="space-y-6">
        {/* Meeting info */}
        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-foreground/70">Date & Time</div>
              <div className="text-sm">
                {new Date(typedMeeting.starts_at).toLocaleString()} —{" "}
                {new Date(typedMeeting.ends_at).toLocaleTimeString()}
              </div>
            </div>
            {typedMeeting.location ? (
              <div>
                <div className="text-xs text-foreground/70">Location</div>
                <div className="text-sm">{typedMeeting.location}</div>
              </div>
            ) : null}
            <div>
              <div className="text-xs text-foreground/70">Status</div>
              <div className="text-sm">{typedMeeting.status}</div>
            </div>
          </div>
          {typedMeeting.description ? (
            <div className="mt-3">
              <div className="text-xs text-foreground/70">Description</div>
              <div className="text-sm">{typedMeeting.description}</div>
            </div>
          ) : null}
          <div className="mt-4">
            <MeetingActions
              meeting={{
                id: typedMeeting.id,
                title: typedMeeting.title,
                starts_at: typedMeeting.starts_at,
                ends_at: typedMeeting.ends_at,
                location: typedMeeting.location,
                description: typedMeeting.description,
                remote_url: typedMeeting.remote_url,
                livestream_url: typedMeeting.livestream_url,
              }}
            />
          </div>
        </div>

        {typedMeeting.remote_url || typedMeeting.livestream_url || typedMeeting.public_comment_instructions ? (
          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="text-sm font-medium">Public access</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {typedMeeting.remote_url ? (
                <div>
                  <div className="text-xs text-foreground/70">Remote access</div>
                  <a
                    className="text-sm text-primary underline underline-offset-2"
                    href={typedMeeting.remote_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join meeting
                  </a>
                </div>
              ) : null}
              {typedMeeting.livestream_url ? (
                <div>
                  <div className="text-xs text-foreground/70">Livestream</div>
                  <a
                    className="text-sm text-primary underline underline-offset-2"
                    href={typedMeeting.livestream_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch live
                  </a>
                </div>
              ) : null}
            </div>
            {typedMeeting.public_comment_instructions ? (
              <div className="mt-3">
                <div className="text-xs text-foreground/70">Public comment instructions</div>
                <div className="text-sm whitespace-pre-line">{typedMeeting.public_comment_instructions}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="text-sm font-medium">Compliance timeline</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-foreground/70">Agenda posting deadline</div>
              <div className="text-sm">
                {postingDeadline ? new Date(postingDeadline).toLocaleString() : "Not available"}
              </div>
              {typedDeadline?.is_special ? (
                <div className="text-xs text-foreground/60">Special meeting timeline applied</div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-foreground/70">Notice posted at</div>
              <div className="text-sm">{formatDateTime(noticePostedAt)}</div>
              {noticeOnTime !== null ? (
                <div className={`text-xs ${noticeOnTime ? "text-green-600" : "text-red-600"}`}>
                  {noticeOnTime ? "On time" : "Late"}
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-foreground/70">Agenda posted at</div>
              <div className="text-sm">{formatDateTime(agendaPostedAt)}</div>
              {agendaOnTime !== null ? (
                <div className={`text-xs ${agendaOnTime ? "text-green-600" : "text-red-600"}`}>
                  {agendaOnTime ? "On time" : "Late"}
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-foreground/70">Minutes posted at</div>
              <div className="text-sm">{formatDateTime(typedMeeting.minutes_posted_at)}</div>
            </div>
          </div>
        </div>

        {/* Agenda items section */}
        <div>
          <h2 className="mb-4 text-lg font-medium">Agenda Items</h2>
          <AgendaItemsPanel
            meetingId={meetingId}
            initialItems={typedItems}
            initialDeadline={typedDeadline}
            isAdmin={isAdminUser}
            userId={user.id}
          />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-medium">Meeting Documents</h2>
          <MeetingDocsPanel
            meetingId={meetingId}
            committeeId={typedMeeting.committee_id}
            isAdmin={isAdminUser}
            initialDocs={typedDocs}
          />
        </div>
      </div>
    </PageShell>
  );
}
