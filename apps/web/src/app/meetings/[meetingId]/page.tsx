import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { AgendaItemsPanel } from "./agenda-items-panel";

type Meeting = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
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
  const { data: isAdmin } = await supabase.rpc("is_admin");

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
  const typedDeadline = deadline as DeadlineInfo | null;

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
        </div>

        {/* Agenda items section */}
        <div>
          <h2 className="mb-4 text-lg font-medium">Agenda Items</h2>
          <AgendaItemsPanel
            meetingId={meetingId}
            initialItems={typedItems}
            initialDeadline={typedDeadline}
            isAdmin={!!isAdmin}
            userId={user.id}
          />
        </div>
      </div>
    </PageShell>
  );
}
