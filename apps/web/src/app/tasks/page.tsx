import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { SuggestedTasksPanel } from "./suggested-tasks-panel";
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

type SuggestedTaskRow = {
  id: string;
  committee_id: string;
  source_doc_id: string;
  source_summary_id: string | null;
  proposed_title: string;
  proposed_description: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  published_task_id: string | null;
  docs?: { id: string; title: string } | null;
  committees?: { id: string; name: string } | null;
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

  const [{ data: memberships }, { data: isAdminData }] = await Promise.all([
    supabase.from("committee_memberships").select("committee_id,role").order("created_at", {
      ascending: true,
    }),
    supabase.rpc("is_admin", { _uid: user.id }),
  ]);

  const committeeIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((m) => (m as { committee_id: string | null }).committee_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  const chairCommitteeIds = Array.from(
    new Set(
      (memberships ?? [])
        .filter((m) => (m as { role?: string }).role === "chair")
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

  const isAdminUser = !!isAdminData;
  let suggestedTasksQuery = supabase
    .from("suggested_tasks")
    .select(
      "id,committee_id,source_doc_id,source_summary_id,proposed_title,proposed_description,status,created_at,reviewed_at,published_task_id,docs(id,title),committees(id,name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isAdminUser) {
    suggestedTasksQuery = suggestedTasksQuery.in(
      "committee_id",
      committeeIds.length > 0 ? committeeIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  const { data: suggestedTasks } = await suggestedTasksQuery;

  return (
    <PageShell title="Tasks" description="Create and track committee-scoped tasks.">
      <div className="space-y-8">
        <SuggestedTasksPanel
          initialSuggestedTasks={(suggestedTasks ?? []) as SuggestedTaskRow[]}
          committees={((committees ?? []) as CommitteeRow[])}
          canReviewCommitteeIds={chairCommitteeIds}
          canReviewAll={isAdminUser}
        />
        <TasksPanel
          initialTasks={(tasks ?? []) as TaskRow[]}
          initialCommittees={((committees ?? []) as CommitteeRow[])}
          projectIdFilter={projectIdFilter}
          viewerUserId={user.id}
        />
      </div>
    </PageShell>
  );
}
