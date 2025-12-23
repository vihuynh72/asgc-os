import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { IccDashboard } from "./icc-dashboard";

export const dynamic = "force-dynamic";

type QuorumSummary = {
  meeting_id: string;
  member_count: number;
  excused_count: number;
  eligible_count: number;
  present_count: number;
  quorum_required: number;
  advisor_present: boolean;
  quorum_met: boolean;
};

type IccMeeting = {
  id: string;
  term_id: string | null;
  starts_at: string;
  location: string | null;
  called_to_order_at: string | null;
  advisor_present: boolean;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
  created_at: string;
  updated_at: string;
  quorum: QuorumSummary | null;
};

type ClubRow = {
  id: string;
  name: string;
  status: "pending" | "chartered" | "suspended" | "revoked" | "inactive";
};

export default async function IccPage() {
  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PageShell title="ICC" description="Please sign in." />;
  }

  const [{ data: isAdmin }, meetingsRes, quorumRes, clubsRes] = await Promise.all([
    supabase.rpc("is_admin", { _uid: user.id }),
    supabase
      .from("icc_meetings")
      .select("id,term_id,starts_at,location,called_to_order_at,advisor_present,status,notes,created_at,updated_at")
      .order("starts_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_icc_quorum_summary")
      .select("meeting_id,member_count,excused_count,eligible_count,present_count,quorum_required,advisor_present,quorum_met"),
    supabase
      .from("clubs")
      .select("id,name,status")
      .order("name", { ascending: true }),
  ]);

  const quorumByMeetingId = new Map<string, QuorumSummary>();
  for (const row of (quorumRes.data ?? []) as QuorumSummary[]) {
    quorumByMeetingId.set(row.meeting_id, row);
  }

  const meetings = ((meetingsRes.data ?? []) as Omit<IccMeeting, "quorum">[]).map((meeting) => ({
    ...meeting,
    quorum: quorumByMeetingId.get(meeting.id) ?? null,
  }));

  const clubs = (clubsRes.data ?? []) as ClubRow[];

  return (
    <PageShell title="ICC" description="Manage ICC meetings and attendance.">
      <IccDashboard initialMeetings={meetings} initialClubs={clubs} isAdmin={!!isAdmin} />
    </PageShell>
  );
}
