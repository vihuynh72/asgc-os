"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type SuggestedTask = {
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function SuggestedTasksPanel({
  initialSuggestedTasks,
  committees,
  canReviewCommitteeIds,
  canReviewAll,
}: {
  initialSuggestedTasks: SuggestedTask[];
  committees: CommitteeRow[];
  canReviewCommitteeIds: string[];
  canReviewAll: boolean;
}) {
  const [tasks, setTasks] = useState<SuggestedTask[]>(initialSuggestedTasks);
  const [status, setStatus] = useState<string>("");
  const [filterCommittee, setFilterCommittee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterCommittee && task.committee_id !== filterCommittee) return false;
      if (filterStatus && task.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, filterCommittee, filterStatus]);

  const reload = useCallback(async () => {
    const { suggestedTasks } = await fetchJson<{ suggestedTasks: SuggestedTask[] }>(
      "/api/tasks/suggested",
    );
    setTasks(suggestedTasks ?? []);
  }, []);

  const canReview = useCallback(
    (committeeId: string) => canReviewAll || canReviewCommitteeIds.includes(committeeId),
    [canReviewAll, canReviewCommitteeIds],
  );

  async function handleReview(taskId: string, decision: "approved" | "rejected") {
    const label = decision === "approved" ? "approve" : "reject";
    if (!confirm(`Are you sure you want to ${label} this suggested task?`)) return;

    setStatus(`${label[0].toUpperCase()}${label.slice(1)}ing...`);
    try {
      const { suggestedTask } = await fetchJson<{ suggestedTask: SuggestedTask }>(
        `/api/tasks/suggested/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );

      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...suggestedTask } : task)),
      );
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Review failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-lg font-semibold">Suggested Tasks</div>
        <div className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
          Refresh
        </Button>
      </div>

      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterCommittee}
          onChange={(e) => setFilterCommittee(e.target.value)}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Committees</option>
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterCommittee("");
            setFilterStatus("");
          }}
        >
          Clear Filters
        </Button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-sm text-foreground/70">No suggested tasks yet.</div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div key={task.id} className="rounded-lg border border-foreground/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium">{task.proposed_title}</div>
                  {task.proposed_description ? (
                    <div className="mt-1 text-sm text-foreground/70">
                      {task.proposed_description}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                    {task.committees?.name ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                        {task.committees.name}
                      </span>
                    ) : null}
                    {task.docs?.title ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                        {task.docs.title}
                      </span>
                    ) : null}
                    <span className={`rounded px-1.5 py-0.5 ${statusClass(task.status)}`}>
                      {statusLabel(task.status)}
                    </span>
                  </div>
                </div>

                {task.status === "draft" && canReview(task.committee_id) ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleReview(task.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleReview(task.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
              {task.published_task_id ? (
                <div className="mt-2 text-xs text-foreground/60">Published to tasks.</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
