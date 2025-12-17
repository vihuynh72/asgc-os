import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { ProjectsPanel } from "./projects-panel";

export const dynamic = "force-dynamic";

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type ProjectRow = {
  id: string;
  committee_id: string;
  name: string;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export default async function ProjectsPage() {
  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PageShell title="Projects" description="Please sign in." />;
  }

  const { data: memberships } = await supabase
    .from("committee_memberships")
    .select("committee_id")
    .order("created_at", { ascending: true });

  const committeeIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((m) => (m as { committee_id: string | null }).committee_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  const { data: committees } = await supabase
    .from("committees")
    .select("id,committee_key,name")
    .in("id", committeeIds.length > 0 ? committeeIds : ["00000000-0000-0000-0000-000000000000"])
    .order("name", { ascending: true });

  const { data: projects } = await supabase
    .from("projects")
    .select("id,committee_id,name,status,created_by,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <PageShell title="Projects" description="Create and track committee-scoped projects.">
      <ProjectsPanel initialProjects={(projects ?? []) as ProjectRow[]} committees={(committees ?? []) as CommitteeRow[]} />
    </PageShell>
  );
}
