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
  const acceptedAgendaCount = typedItems.filter((item) => item.state === "accepted" || item.state === "tabled").length;
  const agendaDocCount = typedDocs.filter((doc) => doc.doc_type === "agenda").length;
  const minutesDocCount = typedDocs.filter((doc) => doc.doc_type === "minutes").length;

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

  function formatDateTime(iso: string | null, fallback: string = "Not posted"): string {
    if (!iso) return fallback;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: officeTz ?? undefined,
      timeZoneName: "short",
    }).format(d);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: officeTz ?? undefined,
      timeZoneName: "short",
    }).format(d);
  }

  function statusBadge(status: string): { label: string; className: string } {
    switch (status) {
      case "scheduled":
        return { label: "Scheduled", className: "bg-green-100 text-green-700" };
      case "cancelled":
        return { label: "Cancelled", className: "bg-red-100 text-red-700" };
      case "completed":
        return { label: "Completed", className: "bg-gray-200 text-gray-700" };
      default:
        return { label: status, className: "bg-gray-100 text-gray-700" };
    }
  }

  const postingDeadline = typedDeadline?.posting_deadline ?? null;
  const agendaPostedAt = typedMeeting.agenda_posted_at;
  const noticePostedAt = typedMeeting.notice_posted_at;
  const meetingStatusBadge = statusBadge(typedMeeting.status);
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
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-foreground/60">{formatMeetingType(typedMeeting.meeting_type)}</div>
                  <div className="text-lg font-semibold">{typedMeeting.title}</div>
                </div>
                <span className={`inline-flex rounded px-2 py-0.5 text-xs ${meetingStatusBadge.className}`}>
                  {meetingStatusBadge.label}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-foreground/70">Date & Time</div>
                  <div className="text-sm">
                    {formatDateTime(typedMeeting.starts_at, "Not available")} — {formatTime(typedMeeting.ends_at)}
                  </div>
                  <div className="text-xs text-foreground/60">
                    Times shown in {officeTz ?? "your local time"}.
                  </div>
                </div>
                <div>
                  <div className="text-xs text-foreground/70">Location</div>
                  <div className="text-sm">{typedMeeting.location ?? "TBD"}</div>
                </div>
              </div>
              {typedMeeting.description ? (
                <div className="mt-3">
                  <div className="text-xs text-foreground/70">Description</div>
                  <div className="text-sm">{typedMeeting.description}</div>
                </div>
              ) : null}
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
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Quick actions</div>
              <div className="mt-3">
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

            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Compliance timeline</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <div className="text-xs text-foreground/70">Agenda posting deadline</div>
                  <div className="text-sm">
                    {formatDateTime(postingDeadline, "Not available")}
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

            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Publish checklist</div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Accepted agenda items</span>
                  <span className={`text-xs ${acceptedAgendaCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                    {acceptedAgendaCount} {acceptedAgendaCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agenda document</span>
                  <span className={`text-xs ${agendaDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                    {agendaDocCount > 0 ? "Uploaded" : "Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Minutes document</span>
                  <span className={`text-xs ${minutesDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                    {minutesDocCount > 0 ? "Uploaded" : "Missing"}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-foreground/60">
                Use Agenda Items and Meeting Documents below to complete each step.
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
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
              acceptedAgendaCount={acceptedAgendaCount}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
