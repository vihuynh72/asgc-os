import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { ClubsDashboard } from "./clubs-dashboard";

export const dynamic = "force-dynamic";

type ClubRow = {
  id: string;
  name: string;
  status: "pending" | "chartered" | "suspended" | "revoked" | "inactive";
  advisor_name: string | null;
  advisor_email: string | null;
  constitution_doc_id: string | null;
  members_count: number;
  benefit_card_count: number;
  last_charter_at: string | null;
  charter_term_id: string | null;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ChecklistItemRow = {
  item_key: string;
  label: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  source_reference: string | null;
};

type ChecklistStatusRow = {
  club_id: string;
  item_key: string;
  status: "pending" | "submitted" | "complete" | "waived";
  checked_at: string | null;
  checked_by: string | null;
  notes: string | null;
};

type ClubEligibilityRow = {
  club_id: string;
  term_id: string | null;
  members_count: number;
  benefit_card_count: number;
  required_benefit_cards: number;
  meets_min_members: boolean;
  meets_benefit_cards: boolean;
  charter_complete: boolean;
  charter_status_ok: boolean;
  constitution_on_file: boolean;
  eligible_for_funding: boolean;
  reasons: unknown;
  updated_at: string;
};

type AbsenceSummaryRow = {
  club_id: string;
  term_id: string | null;
  unexcused_absences: number;
  excused_absences: number;
  present_count: number;
  absence_flag: "ok" | "warning" | "suspended" | "revoked";
  not_counted_for_quorum: boolean;
};

export default async function ClubsPage() {
  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PageShell title="Clubs" description="Please sign in." />;
  }

  const [{ data: isAdmin }, termRes] = await Promise.all([
    supabase.rpc("is_admin", { _uid: user.id }),
    supabase.rpc("current_term_id"),
  ]);

  const termId = termRes.error ? null : typeof termRes.data === "string" ? termRes.data : null;

  const [clubsRes, eligibilityRes, itemsRes, checklistRes, absenceRes] = await Promise.all([
    supabase
      .from("clubs")
      .select(
        "id,name,status,advisor_name,advisor_email,constitution_doc_id,members_count,benefit_card_count,last_charter_at,charter_term_id,status_reason,created_at,updated_at",
      )
      .order("name", { ascending: true }),
    supabase
      .from("club_eligibility")
      .select(
        "club_id,term_id,members_count,benefit_card_count,required_benefit_cards,meets_min_members,meets_benefit_cards,charter_complete,charter_status_ok,constitution_on_file,eligible_for_funding,reasons,updated_at",
      ),
    supabase
      .from("club_charter_checklist_items")
      .select("item_key,label,description,is_required,sort_order,source_reference")
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_charter_checklist")
      .select("club_id,item_key,status,checked_at,checked_by,notes"),
    termId ? supabase.rpc("icc_absence_summary", { _term_id: termId }) : Promise.resolve({ data: [] }),
  ]);

  const clubs = (clubsRes.data ?? []) as ClubRow[];
  const eligibility = (eligibilityRes.data ?? []) as ClubEligibilityRow[];
  const checklistItems = (itemsRes.data ?? []) as ChecklistItemRow[];
  const checklist = (checklistRes.data ?? []) as ChecklistStatusRow[];
  const absenceSummary = (absenceRes.data ?? []) as AbsenceSummaryRow[];

  return (
    <PageShell title="Clubs" description="Club registry, charter checklist, and eligibility.">
      <ClubsDashboard
        initialClubs={clubs}
        initialChecklistItems={checklistItems}
        initialChecklist={checklist}
        initialEligibility={eligibility}
        initialAbsenceSummary={absenceSummary}
        isAdmin={!!isAdmin}
      />
    </PageShell>
  );
}
