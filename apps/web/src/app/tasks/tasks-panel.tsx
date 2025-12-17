"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function formatDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function TasksPanel({
  initialTasks,
  initialCommittees,
  projectIdFilter,
}: {
  initialTasks: TaskRow[];
  initialCommittees: CommitteeRow[];
  projectIdFilter: string;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [committees, setCommittees] = useState<CommitteeRow[]>(initialCommittees);

  const [status, setStatus] = useState<string>("");

  const [newCommitteeId, setNewCommitteeId] = useState<string>(initialCommittees[0]?.id ?? "");
  const [newTitle, setNewTitle] = useState<string>("");
  const [newPriority, setNewPriority] = useState<TaskRow["priority"]>("medium");
  const [newDue, setNewDue] = useState<string>("");
  const [assignToMe, setAssignToMe] = useState<boolean>(true);

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  async function reload() {
    const qs = projectIdFilter ? `?projectId=${encodeURIComponent(projectIdFilter)}` : "";
    const { tasks: t, committees: c } = await fetchJson<{ tasks: TaskRow[]; committees: CommitteeRow[] }>(`/api/tasks${qs}`);
    setTasks(t);
    setCommittees(c);
    if (!newCommitteeId && c[0]?.id) setNewCommitteeId(c[0].id);
  }

  async function onCreateTask(e: FormEvent) {
    e.preventDefault();
    if (!newCommitteeId) {
      setStatus("Pick a committee first.");
      return;
    }

    setStatus("Creating task...");
    try {
      await fetchJson<{ task: TaskRow }>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committeeId: newCommitteeId,
          title: newTitle,
          priority: newPriority,
          dueAt: toIsoFromDateInput(newDue),
          assignToMe,
        }),
      });

      setNewTitle("");
      setNewDue("");
      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    setStatus("Saving...");
    try {
      const { task } = await fetchJson<{ task: TaskRow }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function deleteTask(taskId: string) {
    setStatus("Deleting...");
    try {
      await fetchJson<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-8">
      {status ? <div className="rounded-md border px-3 py-2 text-sm text-foreground/80">{status}</div> : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create task</h2>
          <p className="text-sm text-foreground/70">Committee-scoped. Your access is enforced by RLS.</p>
        </div>

        {committees.length === 0 ? (
          <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">No committee memberships found.</div>
        ) : (
          <form className="grid gap-3 md:grid-cols-5" onSubmit={onCreateTask}>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Committee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newCommitteeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewCommitteeId(e.target.value)}
              >
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-3">
              <div className="text-foreground/70">Title</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                placeholder="e.g., Draft agenda for next meeting"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Priority</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newPriority}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewPriority(e.target.value as TaskRow["priority"])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Due date</div>
              <input
                type="date"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newDue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDue(e.target.value)}
              />
            </label>

            <label className="flex items-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAssignToMe(e.target.checked)}
              />
              <span className="text-foreground/70">Assign to me</span>
            </label>

            <div className="flex items-end md:col-span-5">
              <Button type="submit" disabled={!newTitle.trim() || !newCommitteeId}>
                Create
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Tasks</h2>
          <p className="text-sm text-foreground/70">
            Visible tasks are limited to your committees (or admin override)
            {projectIdFilter ? ", filtered by project." : "."}
          </p>
        </div>

        <div className="rounded-md border">
          <div className="divide-y">
            {tasks.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">No tasks yet.</div>
            ) : (
              tasks.map((t) => {
                const committee = committeesById.get(t.committee_id);
                return (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="text-xs text-foreground/70">
                        {committee ? committee.name : t.committee_id}
                        {t.due_at ? ` • Due ${formatDateInputValue(t.due_at)}` : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 rounded-md border bg-transparent px-2 text-sm"
                        value={t.status}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => void updateTask(t.id, { status: e.target.value })}
                      >
                        <option value="todo">To do</option>
                        <option value="doing">Doing</option>
                        <option value="done">Done</option>
                      </select>

                      <Button variant="ghost" onClick={() => void deleteTask(t.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
