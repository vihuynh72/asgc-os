"use client";

import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type AgendaItem = {
  id: string;
  meeting_id: string;
  submitted_by: string;
  title: string;
  category: string;
  background: string | null;
  recommended_motion: string | null;
  fiscal_impact: string | null;
  attachments_json: unknown;
  state: string;
  is_late: boolean;
  created_at: string;
  updated_at: string;
};

type DeadlineInfo = {
  meeting_id: string;
  starts_at: string;
  submission_deadline: string;
  posting_deadline: string;
  is_submission_open: boolean;
  is_special: boolean;
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

function formatCategory(cat: string): string {
  switch (cat) {
    case "action":
      return "Action";
    case "discussion":
      return "Discussion";
    case "information":
      return "Information";
    case "consent":
      return "Consent";
    case "other":
      return "Other";
    default:
      return cat;
  }
}

function formatState(state: string): string {
  switch (state) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "tabled":
      return "Tabled";
    case "withdrawn":
      return "Withdrawn";
    default:
      return state;
  }
}

function stateColor(state: string): string {
  switch (state) {
    case "draft":
      return "bg-gray-100 text-gray-700";
    case "submitted":
      return "bg-blue-100 text-blue-700";
    case "accepted":
      return "bg-green-100 text-green-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "tabled":
      return "bg-yellow-100 text-yellow-700";
    case "withdrawn":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function AgendaItemsPanel({
  meetingId,
  initialItems,
  initialDeadline,
  isAdmin,
  userId,
}: {
  meetingId: string;
  initialItems: AgendaItem[];
  initialDeadline: DeadlineInfo | null;
  isAdmin: boolean;
  userId: string;
}) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [deadline, setDeadline] = useState<DeadlineInfo | null>(initialDeadline);
  const [status, setStatus] = useState<string>("");

  // New item form
  const [showNewForm, setShowNewForm] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("discussion");
  const [newBackground, setNewBackground] = useState<string>("");
  const [newMotion, setNewMotion] = useState<string>("");
  const [newFiscal, setNewFiscal] = useState<string>("");

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editBackground, setEditBackground] = useState<string>("");
  const [editMotion, setEditMotion] = useState<string>("");
  const [editFiscal, setEditFiscal] = useState<string>("");

  const reload = useCallback(async () => {
    const { items: i, deadline: d } = await fetchJson<{
      items: AgendaItem[];
      deadline: DeadlineInfo | null;
    }>(`/api/meetings/${encodeURIComponent(meetingId)}/agenda-items`);
    setItems(i);
    setDeadline(d);
  }, [meetingId]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!newTitle.trim()) {
      setStatus("Title required");
      return;
    }

    setStatus("Creating...");
    try {
      await fetchJson(`/api/meetings/${encodeURIComponent(meetingId)}/agenda-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          background: newBackground.trim() || null,
          recommended_motion: newMotion.trim() || null,
          fiscal_impact: newFiscal.trim() || null,
        }),
      });

      setStatus("");
      setNewTitle("");
      setNewCategory("discussion");
      setNewBackground("");
      setNewMotion("");
      setNewFiscal("");
      setShowNewForm(false);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create");
    }
  }

  function startEdit(item: AgendaItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditBackground(item.background ?? "");
    setEditMotion(item.recommended_motion ?? "");
    setEditFiscal(item.fiscal_impact ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();

    if (!editTitle.trim()) {
      setStatus("Title required");
      return;
    }

    setStatus("Updating...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            category: editCategory,
            background: editBackground.trim() || null,
            recommended_motion: editMotion.trim() || null,
            fiscal_impact: editFiscal.trim() || null,
          }),
        },
      );

      setStatus("");
      setEditingId(null);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleSubmit(itemId: string) {
    if (!confirm("Submit this item for review? You won't be able to edit it after submission.")) {
      return;
    }

    setStatus("Submitting...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}/submit`,
        { method: "POST" },
      );

      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  async function handleWithdraw(itemId: string) {
    if (!confirm("Withdraw this item?")) return;

    setStatus("Withdrawing...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
      );

      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to withdraw");
    }
  }

  async function handleReview(itemId: string, newState: "accepted" | "rejected" | "tabled") {
    const stateLabel = newState === "accepted" ? "accept" : newState === "rejected" ? "reject" : "table";
    if (!confirm(`Are you sure you want to ${stateLabel} this item?`)) return;

    setStatus("Reviewing...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: newState }),
        },
      );

      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to review");
    }
  }

  const myItems = items.filter((i) => i.submitted_by === userId);
  const allItems = items;

  return (
    <div className="space-y-6">
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      {/* Deadline info */}
      {deadline ? (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm font-medium">Submission Deadline</div>
          <div className="mt-1 text-sm text-foreground/80">
            {new Date(deadline.submission_deadline).toLocaleString()}
            {deadline.is_special ? " (Special Meeting)" : ""}
          </div>
          <div className="mt-1 text-xs text-foreground/70">
            {deadline.is_submission_open ? (
              <span className="text-green-600">Submissions are open</span>
            ) : (
              <span className="text-red-600">Submissions are closed</span>
            )}
          </div>
        </div>
      ) : null}

      {/* New item form toggle */}
      {deadline?.is_submission_open !== false ? (
        <Button type="button" size="sm" onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? "Cancel" : "New Agenda Item"}
        </Button>
      ) : null}

      {/* New item form */}
      {showNewForm ? (
        <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-foreground/10 p-4">
          <div className="text-sm font-medium">New Agenda Item</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Title *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                placeholder="Agenda item title"
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="action">Action</option>
                <option value="discussion">Discussion</option>
                <option value="information">Information</option>
                <option value="consent">Consent</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Background</label>
              <textarea
                value={newBackground}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewBackground(e.target.value)}
                placeholder="Context and background information..."
                rows={3}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Recommended Motion</label>
              <textarea
                value={newMotion}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewMotion(e.target.value)}
                placeholder="Motion language if this is an action item..."
                rows={2}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Fiscal Impact</label>
              <input
                type="text"
                value={newFiscal}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFiscal(e.target.value)}
                placeholder="e.g., $500 from ASGC Budget"
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Save Draft
            </Button>
          </div>
        </form>
      ) : null}

      {/* My items section */}
      <div>
        <h3 className="mb-3 text-sm font-medium">My Submissions ({myItems.length})</h3>
        {myItems.length === 0 ? (
          <div className="text-sm text-foreground/70">You have not submitted any items for this meeting.</div>
        ) : (
          <div className="space-y-3">
            {myItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-foreground/10 p-4">
                {editingId === item.id ? (
                  <form onSubmit={(e) => handleUpdate(e, item.id)} className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm font-medium"
                    />
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                    >
                      <option value="action">Action</option>
                      <option value="discussion">Discussion</option>
                      <option value="information">Information</option>
                      <option value="consent">Consent</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea
                      value={editBackground}
                      onChange={(e) => setEditBackground(e.target.value)}
                      placeholder="Background"
                      rows={2}
                      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                    />
                    <textarea
                      value={editMotion}
                      onChange={(e) => setEditMotion(e.target.value)}
                      placeholder="Recommended Motion"
                      rows={2}
                      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      value={editFiscal}
                      onChange={(e) => setEditFiscal(e.target.value)}
                      placeholder="Fiscal Impact"
                      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">
                        Save
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                            {formatCategory(item.category)}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 ${stateColor(item.state)}`}>
                            {formatState(item.state)}
                          </span>
                          {item.is_late ? (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">
                              Late
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {item.background ? (
                      <div className="mt-2 text-sm text-foreground/80">{item.background}</div>
                    ) : null}

                    {item.recommended_motion ? (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">Motion: </span>
                        {item.recommended_motion}
                      </div>
                    ) : null}

                    {item.fiscal_impact ? (
                      <div className="mt-1 text-sm">
                        <span className="font-medium">Fiscal: </span>
                        {item.fiscal_impact}
                      </div>
                    ) : null}

                    {/* Actions for own items */}
                    {item.state === "draft" ? (
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" onClick={() => handleSubmit(item.id)}>
                          Submit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleWithdraw(item.id)}
                        >
                          Withdraw
                        </Button>
                      </div>
                    ) : item.state === "submitted" ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleWithdraw(item.id)}
                        >
                          Withdraw
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin review section */}
      {isAdmin ? (
        <div>
          <h3 className="mb-3 text-sm font-medium">All Submissions ({allItems.length})</h3>
          {allItems.length === 0 ? (
            <div className="text-sm text-foreground/70">No submissions for this meeting.</div>
          ) : (
            <div className="space-y-3">
              {allItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-foreground/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                          {formatCategory(item.category)}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 ${stateColor(item.state)}`}>
                          {formatState(item.state)}
                        </span>
                        {item.is_late ? (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">
                            Late
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {item.background ? (
                    <div className="mt-2 text-sm text-foreground/80">{item.background}</div>
                  ) : null}

                  {item.recommended_motion ? (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Motion: </span>
                      {item.recommended_motion}
                    </div>
                  ) : null}

                  {item.fiscal_impact ? (
                    <div className="mt-1 text-sm">
                      <span className="font-medium">Fiscal: </span>
                      {item.fiscal_impact}
                    </div>
                  ) : null}

                  {/* Admin review buttons */}
                  {item.state === "submitted" ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleReview(item.id, "accepted")}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(item.id, "rejected")}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(item.id, "tabled")}
                      >
                        Table
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
