import { PageShell } from "@/components/page-shell";
import { AdminPanel } from "./admin-panel";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssignmentRow = {
  id: string;
  user_id: string;
  role_key: "advisor" | "president" | "officer" | "volunteer";
  term_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_primary: boolean;
};

export default async function AdminPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: advisorAssignments } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_key", "advisor")
    .is("term_id", null)
    .is("ends_at", null)
    .limit(1);

  const isAdvisor = (advisorAssignments?.length ?? 0) > 0;

  let currentTermId = "";
  if (!isAdvisor) {
    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();
    currentTermId = currentTerm?.id ?? "";

    if (!currentTermId) {
      redirect("/dashboard");
    }

    const { data: presidentAssignments } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("role_key", "president")
      .eq("term_id", currentTermId)
      .is("ends_at", null)
      .limit(1);

    const isPresident = (presidentAssignments?.length ?? 0) > 0;
    if (!isPresident) redirect("/dashboard");
  }

  const admin = getSupabaseAdminClient();

  const [{ data: terms }, { data: usersRaw }] = await Promise.all([
    admin.from("terms").select("id,name,start_date,end_date,is_current").order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id,display_name,status,created_at,profile_private(email)")
      .order("created_at", { ascending: false }),
  ]);

  const safeTerms = terms ?? [];
  const safeUsers =
    usersRaw?.map((row) => {
      const maybePrivate = (row as unknown as { profile_private?: { email?: string | null } | null }).profile_private;
      return {
        id: (row as unknown as { id: string }).id,
        email: maybePrivate?.email ?? null,
        display_name: (row as unknown as { display_name: string | null }).display_name ?? null,
        status: (row as unknown as { status: string }).status,
        created_at: (row as unknown as { created_at: string }).created_at,
      };
    }) ?? [];
  const selectedTermId =
    safeTerms.find((t) => t.is_current)?.id ?? safeTerms[0]?.id ?? "";

  const [{ data: globalAdvisorAssignments }, { data: termAssignments }] = await Promise.all([
      admin
        .from("role_assignments")
        .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
        .eq("role_key", "advisor")
        .is("term_id", null)
        .is("ends_at", null)
        .order("starts_at", { ascending: false }),
      selectedTermId
        ? admin
            .from("role_assignments")
            .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
            .eq("term_id", selectedTermId)
            .is("ends_at", null)
            .order("starts_at", { ascending: false })
        : Promise.resolve({ data: [] as AssignmentRow[] }),
    ]);

  return (
    <PageShell title="Admin" description="Manage terms and role assignments (Phase 3).">
      <AdminPanel
        initialTerms={safeTerms}
        initialUsers={safeUsers}
        initialSelectedTermId={selectedTermId}
        initialGlobalAdvisorAssignments={(globalAdvisorAssignments ?? []) as AssignmentRow[]}
        initialTermAssignments={(termAssignments ?? []) as AssignmentRow[]}
      />
    </PageShell>
  );
}
