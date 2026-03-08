import { AdminHero } from "@/components/admin/admin-hero";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminViewer } from "@/lib/admin/server";

import { MeetingsMainPanel } from "./_components/meetings-main-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMeetingsPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/meetings", capability: "hub" });
  const admin = getSupabaseAdminClient();

  const [{ data: meetings }, { data: committees }] = await Promise.all([
    admin
      .from("meetings")
      .select(
        "id,committee_id,meeting_type,title,description,location,remote_url,livestream_url,public_comment_instructions,notice_posted_at,agenda_posted_at,minutes_posted_at,starts_at,ends_at,status,created_at,updated_at",
      )
      .order("starts_at", { ascending: false })
      .limit(200),
    admin.from("committees").select("id,name,committee_key").order("name", { ascending: true }),
  ]);

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Meetings"
        title="Meeting queue"
        description="Create a meeting quickly, keep publishing work visible, and push detailed editing out to the meeting pages where it belongs."
      />
      <MeetingsMainPanel
        initialMeetings={(meetings ?? []) as Parameters<typeof MeetingsMainPanel>[0]["initialMeetings"]}
        initialCommittees={(committees ?? []) as Parameters<typeof MeetingsMainPanel>[0]["initialCommittees"]}
        isReadOnly={viewer.isReadOnly}
      />
    </div>
  );
}
