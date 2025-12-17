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

  async function toggleExpanded(taskId: string) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(taskId);
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
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" onClick={() => void toggleExpanded(t.id)}>
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
