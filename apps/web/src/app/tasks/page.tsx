import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { TasksPanel } from "./tasks-panel";

export const dynamic = "force-dynamic";

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type TaskRow = {
  id: string;
  committee_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  due_at: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const projectIdFilterRaw = sp.projectId;
  const projectIdFilter = typeof projectIdFilterRaw === "string" ? projectIdFilterRaw : "";

  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PageShell title="Tasks" description="Please sign in." />;
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

  let tasksQuery = supabase
    .from("tasks")
    .select("id,committee_id,project_id,title,description,status,priority,due_at,assigned_to,created_by,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (projectIdFilter) {
    tasksQuery = tasksQuery.eq("project_id", projectIdFilter);
  }

  const { data: tasks } = await tasksQuery;

  return (
    <PageShell title="Tasks" description="Create and track committee-scoped tasks.">
      <TasksPanel
        initialTasks={(tasks ?? []) as TaskRow[]}
        initialCommittees={((committees ?? []) as CommitteeRow[])}
        projectIdFilter={projectIdFilter}
        viewerUserId={user.id}
      />
    </PageShell>
  );
}
