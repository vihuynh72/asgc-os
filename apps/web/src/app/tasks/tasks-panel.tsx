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

type TaskCommentRow = {
  id: string;
  task_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

type TaskAttachmentRow = {
  id: string;
  task_id: string;
  url: string;
  label: string | null;
  created_by: string;
  created_at: string;
};

type AssigneeRow = {
  id: string;
  display_name: string | null;
  role_key: string;
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
  const trimmed = iso.trim();
  if (trimmed.length >= 10) return trimmed.slice(0, 10);
  return "";
}

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // Use noon UTC to avoid timezone-related "previous day" rendering issues.
  const d = new Date(`${v}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function TasksPanel({
  initialTasks,
  initialCommittees,
  projectIdFilter,
  viewerUserId,
}: {
  initialTasks: TaskRow[];
  initialCommittees: CommitteeRow[];
  projectIdFilter: string;
  viewerUserId: string;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [committees, setCommittees] = useState<CommitteeRow[]>(initialCommittees);
  const [assigneesByCommitteeId, setAssigneesByCommitteeId] = useState<Record<string, AssigneeRow[]>>({});

  const [status, setStatus] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<TaskRow["status"] | "">("");
  const [filterCommitteeId, setFilterCommitteeId] = useState<string>("");
  const [sortKey, setSortKey] = useState<"updated" | "due" | "title">("updated");

  const [newCommitteeId, setNewCommitteeId] = useState<string>(initialCommittees[0]?.id ?? "");
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newPriority, setNewPriority] = useState<TaskRow["priority"]>("medium");
  const [newDue, setNewDue] = useState<string>("");
  const [newAssigneeId, setNewAssigneeId] = useState<string>(viewerUserId);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, TaskCommentRow[]>>({});
  const [attachmentsByTaskId, setAttachmentsByTaskId] = useState<Record<string, TaskAttachmentRow[]>>({});
  const [newCommentByTaskId, setNewCommentByTaskId] = useState<Record<string, string>>({});
  const [newAttachmentUrlByTaskId, setNewAttachmentUrlByTaskId] = useState<Record<string, string>>({});
  const [newAttachmentLabelByTaskId, setNewAttachmentLabelByTaskId] = useState<Record<string, string>>({});

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const filteredTasks = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    let next = tasks;

    if (filterStatus) {
      next = next.filter((t) => t.status === filterStatus);
    }
    if (filterCommitteeId) {
      next = next.filter((t) => t.committee_id === filterCommitteeId);
    }
    if (query) {
      next = next.filter((t) => {
        const committeeName = committeesById.get(t.committee_id)?.name ?? "";
        const haystack = `${t.title} ${t.description ?? ""} ${committeeName}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...next];
    if (sortKey === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      return sorted;
    }
    if (sortKey === "due") {
      sorted.sort((a, b) => {
        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return a.title.localeCompare(b.title);
      });
      return sorted;
    }

    sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return sorted;
  }, [committeesById, filterCommitteeId, filterQuery, filterStatus, sortKey, tasks]);

  async function loadAssignees(committeeId: string) {
    if (!committeeId) return;
    if (assigneesByCommitteeId[committeeId]) return;

    const qs = new URLSearchParams({ committeeId });
    const { assignees } = await fetchJson<{ assignees: AssigneeRow[] }>(`/api/tasks/assignees?${qs.toString()}`);
    setAssigneesByCommitteeId((prev) => ({ ...prev, [committeeId]: assignees ?? [] }));
  }

  async function reload() {
    const qs = projectIdFilter ? `?projectId=${encodeURIComponent(projectIdFilter)}` : "";
    const { tasks: t, committees: c } = await fetchJson<{ tasks: TaskRow[]; committees: CommitteeRow[] }>(`/api/tasks${qs}`);
    setTasks(t);
    setCommittees(c);
    if (!newCommitteeId && c[0]?.id) setNewCommitteeId(c[0].id);
  }

  async function loadTaskExtras(taskId: string) {
    const [commentsRes, attachmentsRes] = await Promise.all([
      fetchJson<{ comments: TaskCommentRow[] }>(`/api/tasks/${encodeURIComponent(taskId)}/comments`),
      fetchJson<{ attachments: TaskAttachmentRow[] }>(`/api/tasks/${encodeURIComponent(taskId)}/attachments`),
    ]);

    setCommentsByTaskId((prev) => ({ ...prev, [taskId]: commentsRes.comments }));
    setAttachmentsByTaskId((prev) => ({ ...prev, [taskId]: attachmentsRes.attachments }));
  }

  async function toggleExpanded(taskId: string, committeeId: string) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(taskId);
    if (committeeId) {
      try {
        await loadAssignees(committeeId);
      } catch {
        // Ignore (assignment UI will remain limited).
      }
    }
    if (!commentsByTaskId[taskId] || !attachmentsByTaskId[taskId]) {
      setStatus("Loading...");
      try {
        await loadTaskExtras(taskId);
        setStatus("");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load");
      }
    }
  }

  async function createComment(taskId: string) {
    const body = (newCommentByTaskId[taskId] ?? "").trim();
    if (!body) return;

    setStatus("Posting comment...");
    try {
      const { comment } = await fetchJson<{ comment: TaskCommentRow }>(
        `/api/tasks/${encodeURIComponent(taskId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );

      setCommentsByTaskId((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), comment] }));
      setNewCommentByTaskId((prev) => ({ ...prev, [taskId]: "" }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to post comment");
    }
  }

  async function deleteComment(taskId: string, commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    setStatus("Removing comment...");
    try {
      await fetchJson<{ ok: true }>(
        `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      setCommentsByTaskId((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).filter((c) => c.id !== commentId),
      }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to remove comment");
    }
  }

  async function createAttachment(taskId: string) {
    const url = (newAttachmentUrlByTaskId[taskId] ?? "").trim();
    const label = (newAttachmentLabelByTaskId[taskId] ?? "").trim();
    if (!url) return;

    setStatus("Adding link...");
    try {
      const { attachment } = await fetchJson<{ attachment: TaskAttachmentRow }>(
        `/api/tasks/${encodeURIComponent(taskId)}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, label: label || undefined }),
        },
      );

      setAttachmentsByTaskId((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), attachment] }));
      setNewAttachmentUrlByTaskId((prev) => ({ ...prev, [taskId]: "" }));
      setNewAttachmentLabelByTaskId((prev) => ({ ...prev, [taskId]: "" }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add link");
    }
  }

  async function deleteAttachment(taskId: string, attachmentId: string) {
    if (!window.confirm("Remove this attachment?")) return;
    setStatus("Removing link...");
    try {
      await fetchJson<{ ok: true }>(
        `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      );
      setAttachmentsByTaskId((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).filter((a) => a.id !== attachmentId),
      }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to remove link");
    }
  }

  function assigneeLabel(a: AssigneeRow): string {
    const name = (a.display_name ?? "").trim();
    if (name) return name;
    return a.id;
  }

  function taskAssigneeLabel(task: TaskRow): string {
    if (!task.assigned_to) return "Unassigned";
    if (task.assigned_to === viewerUserId) return "Me";
    const options = assigneesByCommitteeId[task.committee_id] ?? [];
    const match = options.find((a) => a.id === task.assigned_to);
    if (match) return assigneeLabel(match);
    return task.assigned_to;
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
          projectId: projectIdFilter ? projectIdFilter : null,
          title: newTitle,
          description: newDescription.trim() ? newDescription.trim() : undefined,
          priority: newPriority,
          dueAt: toIsoFromDateInput(newDue),
          assignedTo: newAssigneeId ? newAssigneeId : null,
        }),
      });

      setNewTitle("");
      setNewDescription("");
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
    const task = tasks.find((t) => t.id === taskId);
    const label = task?.title ? `"${task.title}"` : "this task";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
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
      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

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
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const next = e.target.value;
                  setNewCommitteeId(next);
                  setNewAssigneeId(viewerUserId);
                  void loadAssignees(next);
                }}
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

            <label className="space-y-1 text-sm md:col-span-5">
              <div className="text-foreground/70">Description</div>
              <textarea
                className="min-h-20 w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                value={newDescription}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)}
                placeholder="Optional context, links, or acceptance criteria…"
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Assignee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newAssigneeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewAssigneeId(e.target.value)}
                onFocus={() => void loadAssignees(newCommitteeId)}
              >
                <option value="">Unassigned</option>
                {(assigneesByCommitteeId[newCommitteeId] ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id === viewerUserId ? "Me" : assigneeLabel(a)} ({a.role_key})
                  </option>
                ))}
              </select>
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

        <div className="rounded-md border p-3">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Search</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterQuery(e.target.value)}
                placeholder="Title, description, committee…"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Status</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterStatus}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setFilterStatus(e.target.value as TaskRow["status"] | "")
                }
              >
                <option value="">All</option>
                <option value="todo">To do</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Committee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterCommitteeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterCommitteeId(e.target.value)}
              >
                <option value="">All</option>
                {committees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Sort by</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={sortKey}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortKey(e.target.value as typeof sortKey)}
              >
                <option value="updated">Recently updated</option>
                <option value="due">Due date</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
            <span>
              Showing {filteredTasks.length} of {tasks.length} tasks
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterQuery("");
                setFilterStatus("");
                setFilterCommitteeId("");
                setSortKey("updated");
              }}
              disabled={!filterQuery && !filterStatus && !filterCommitteeId && sortKey === "updated"}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="divide-y">
            {filteredTasks.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">
                {tasks.length === 0 ? "No tasks yet." : "No tasks match the current filters."}
              </div>
            ) : (
              filteredTasks.map((t) => {
                const committee = committeesById.get(t.committee_id);
                const isExpanded = expandedTaskId === t.id;
                const comments = commentsByTaskId[t.id] ?? [];
                const attachments = attachmentsByTaskId[t.id] ?? [];
                return (
                  <div key={t.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-foreground/70">
                          {committee ? committee.name : t.committee_id}
                          {t.due_at ? ` • Due ${formatDateInputValue(t.due_at)}` : ""}
                          {t.assigned_to ? ` • ${taskAssigneeLabel(t)}` : " • Unassigned"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" onClick={() => void toggleExpanded(t.id, t.committee_id)}>
                          {isExpanded ? "Hide" : "Details"}
                        </Button>

                        <select
                          className="h-9 rounded-md border bg-transparent px-2 text-sm"
                          value={t.status}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            void updateTask(t.id, { status: e.target.value })
                          }
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

                    {isExpanded ? (
                      <div className="mt-3 grid gap-3 rounded-md border bg-transparent p-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <div className="text-sm font-medium">Task details</div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="space-y-1 text-sm">
                              <div className="text-foreground/70">Assignee</div>
                              <select
                                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                                value={t.assigned_to ?? ""}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  void updateTask(t.id, { assignedTo: e.target.value || null })
                                }
                              >
                                <option value="">Unassigned</option>
                                {(assigneesByCommitteeId[t.committee_id] ?? []).map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.id === viewerUserId ? "Me" : assigneeLabel(a)} ({a.role_key})
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-1 text-sm">
                              <div className="text-foreground/70">Priority</div>
                              <select
                                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                                value={t.priority}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  void updateTask(t.id, { priority: e.target.value })
                                }
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
                                value={formatDateInputValue(t.due_at)}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  void updateTask(t.id, { dueAt: toIsoFromDateInput(e.target.value) })
                                }
                              />
                            </label>
                          </div>

                          <label className="block space-y-1 text-sm">
                            <div className="text-foreground/70">Description</div>
                            <textarea
                              className="min-h-20 w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                              value={t.description ?? ""}
                              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                setTasks((prev) =>
                                  prev.map((row) => (row.id === t.id ? { ...row, description: e.target.value } : row)),
                                )
                              }
                              onBlur={() => void updateTask(t.id, { description: (t.description ?? "").trim() || null })}
                              placeholder="Optional context…"
                            />
                          </label>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Comments</div>
                          {comments.length === 0 ? (
                            <div className="text-sm text-foreground/70">No comments yet.</div>
                          ) : (
                            <div className="space-y-2">
                              {comments.map((c) => (
                                <div key={c.id} className="rounded-md border px-2 py-1">
                                  <div className="text-sm">{c.body}</div>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <div className="text-xs text-foreground/60">
                                      {new Date(c.created_at).toLocaleString()}
                                    </div>
                                    <Button variant="ghost" onClick={() => void deleteComment(t.id, c.id)}>
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                              value={newCommentByTaskId[t.id] ?? ""}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setNewCommentByTaskId((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="Add a comment"
                            />
                            <Button
                              variant="ghost"
                              onClick={() => void createComment(t.id)}
                              disabled={!(newCommentByTaskId[t.id] ?? "").trim()}
                            >
                              Post
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Attachments (Links)</div>
                          {attachments.length === 0 ? (
                            <div className="text-sm text-foreground/70">No links yet.</div>
                          ) : (
                            <div className="space-y-2">
                              {attachments.map((a) => (
                                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                                  <a
                                    className="min-w-0 flex-1 truncate text-sm underline underline-offset-4 hover:text-foreground/80"
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={a.label ?? a.url}
                                  >
                                    {a.label ?? a.url}
                                  </a>
                                  <Button variant="ghost" onClick={() => void deleteAttachment(t.id, a.id)}>
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-2">
                            <input
                              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                              value={newAttachmentUrlByTaskId[t.id] ?? ""}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setNewAttachmentUrlByTaskId((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="https://..."
                            />
                            <div className="flex gap-2">
                              <input
                                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                                value={newAttachmentLabelByTaskId[t.id] ?? ""}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setNewAttachmentLabelByTaskId((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                placeholder="Optional label"
                              />
                              <Button
                                variant="ghost"
                                onClick={() => void createAttachment(t.id)}
                                disabled={!(newAttachmentUrlByTaskId[t.id] ?? "").trim()}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
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
