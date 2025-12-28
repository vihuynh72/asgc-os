"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyTextWithFallback } from "@/lib/clipboard";

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
  docs?: { id: string; title: string }[] | null;
  committees?: { id: string; name: string }[] | null;
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

function toCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/\"/g, "\"\"")}"`;
  }
  return raw;
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
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterCommittee, setFilterCommittee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPendingOnly, setFilterPendingOnly] = useState<boolean>(false);

  const filteredTasks = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filterCommittee && task.committee_id !== filterCommittee) return false;
      if (filterStatus && task.status !== filterStatus) return false;
      if (filterPendingOnly && task.status !== "draft") return false;
      if (!query) return true;
      const haystack = [
        task.proposed_title,
        task.proposed_description ?? "",
        task.committees?.[0]?.name ?? "",
        task.docs?.[0]?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [tasks, filterCommittee, filterStatus, filterPendingOnly, filterQuery]);

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, approved: 0, rejected: 0 };
    for (const task of filteredTasks) {
      if (task.status === "draft") counts.draft += 1;
      else if (task.status === "approved") counts.approved += 1;
      else if (task.status === "rejected") counts.rejected += 1;
    }
    return counts;
  }, [filteredTasks]);

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

  function buildSuggestedTasksCsv(list: SuggestedTask[]) {
    const headers = ["Title", "Status", "Committee", "Doc", "Created At", "Reviewed At", "Published Task Id"];
    const rows = list.map((task) => [
      task.proposed_title,
      task.status,
      task.committees?.[0]?.name ?? task.committee_id,
      task.docs?.[0]?.title ?? "",
      task.created_at,
      task.reviewed_at ?? "",
      task.published_task_id ?? "",
    ]);
    return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
  }

  function buildSuggestedTasksCopyText(list: SuggestedTask[]) {
    return list
      .map((task) => {
        const committee = task.committees?.[0]?.name ?? task.committee_id;
        const doc = task.docs?.[0]?.title ?? "No doc";
        return `${task.proposed_title} • ${statusLabel(task.status)} • ${committee} • ${doc}`;
      })
      .join("\n");
  }

  async function handleCopySuggestedTasks() {
    if (filteredTasks.length === 0) {
      toast.error("No suggested tasks to copy");
      return;
    }
    const ok = await copyTextWithFallback(buildSuggestedTasksCopyText(filteredTasks), {
      promptLabel: "Copy suggested tasks",
    });
    if (ok) {
      toast.success("Suggested tasks copied");
    } else {
      toast.info("Clipboard blocked. Use the prompt to copy.");
    }
  }

  function handleDownloadSuggestedTasksCsv() {
    if (filteredTasks.length === 0) {
      toast.error("No suggested tasks to export");
      return;
    }
    const csv = buildSuggestedTasksCsv(filteredTasks);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `suggested_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Suggested tasks CSV downloaded");
  }

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
      toast.success(`Suggested task ${decision === "approved" ? "approved" : "rejected"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Review failed";
      setStatus(msg);
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-lg font-semibold">Suggested Tasks</div>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopySuggestedTasks()}>
          Copy list
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleDownloadSuggestedTasksCsv}>
          Export CSV
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
          Refresh
        </Button>
      </div>

      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
        <span>
          Showing {filteredTasks.length} of {tasks.length}
        </span>
        <span>Draft {statusCounts.draft}</span>
        <span>Approved {statusCounts.approved}</span>
        <span>Rejected {statusCounts.rejected}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="space-y-1 text-xs text-foreground/70">
          <span>Search</span>
          <div className="flex items-center gap-2">
            <input
              className="h-8 w-56 rounded border border-foreground/20 bg-background px-2 text-sm"
              value={filterQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterQuery(e.target.value)}
              placeholder="Title, committee, doc..."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilterQuery("")}
              disabled={!filterQuery.trim()}
            >
              Clear
            </Button>
          </div>
        </label>
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filterPendingOnly}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterPendingOnly(e.target.checked)}
          />
          <span className="text-foreground/70">Pending review</span>
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterQuery("");
            setFilterCommittee("");
            setFilterStatus("");
            setFilterPendingOnly(false);
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
                    {task.committees?.[0]?.name ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                        {task.committees[0].name}
                      </span>
                    ) : null}
                    {task.docs?.[0]?.title ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                        {task.docs[0].title}
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
