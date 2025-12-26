"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AgendaItem = {
  id: string;
  meeting_id: string;
  submitted_by: string;
  title: string;
  submitted_at?: string | null;
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
  is_past_deadline: boolean;
  is_special: boolean;
  hours_until_deadline?: number | null;
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

function toCsvValue(value: string | number | boolean | null | undefined): string {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildAgendaCsv(items: AgendaItem[]): string {
  const headers = [
    "Title",
    "Category",
    "State",
    "Late",
    "Submitted At",
    "Submitted By",
    "Recommended Motion",
    "Fiscal Impact",
    "Attachments",
  ];
  const rows = items.map((item) => [
    item.title,
    item.category,
    item.state,
    item.is_late ? "yes" : "no",
    item.submitted_at ?? item.created_at,
    item.submitted_by,
    item.recommended_motion ?? "",
    item.fiscal_impact ?? "",
    normalizeAttachments(item.attachments_json).join(" | "),
  ]);
  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
}

function buildAgendaText(items: AgendaItem[]): string {
  if (items.length === 0) return "No accepted agenda items.";
  return items
    .map((item, idx) => `${idx + 1}. ${item.title} (${formatCategory(item.category)})`)
    .join("\n");
}

function normalizeAttachments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const flat: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) flat.push(trimmed);
      continue;
    }
    if (entry && typeof entry === "object" && "url" in entry && typeof (entry as { url: unknown }).url === "string") {
      const trimmed = (entry as { url: string }).url.trim();
      if (trimmed) flat.push(trimmed);
    }
  }
  return flat;
}

function attachmentsToTextarea(value: unknown): string {
  return normalizeAttachments(value).join("\n");
}

function parseAttachmentsInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isProbablyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isValidIso(value: string | null | undefined): value is string {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function formatDeadline(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not available";
  if (!timeZone) return d.toLocaleString();
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function buildFallbackDeadline(meetingId: string, meetingStartsAt: string, meetingType?: string | null): DeadlineInfo | null {
  if (!isValidIso(meetingStartsAt)) return null;
  const start = new Date(meetingStartsAt);
  const submitMs = start.getTime() - 84 * 60 * 60 * 1000;
  const postHours = meetingType === "special" ? 24 : 72;
  const postMs = start.getTime() - postHours * 60 * 60 * 1000;
  const now = Date.now();

  return {
    meeting_id: meetingId,
    starts_at: meetingStartsAt,
    submission_deadline: new Date(submitMs).toISOString(),
    posting_deadline: new Date(postMs).toISOString(),
    is_submission_open: now <= submitMs,
    is_past_deadline: now > submitMs,
    hours_until_deadline: (submitMs - now) / 3600000,
    is_special: meetingType === "special",
  };
}

export function AgendaItemsPanel({
  meetingId,
  initialItems,
  initialDeadline,
  isAdmin,
  userId,
  meetingStartsAt,
  meetingType,
  officeTz,
}: {
  meetingId: string;
  initialItems: AgendaItem[];
  initialDeadline: DeadlineInfo | null;
  isAdmin: boolean;
  userId: string;
  meetingStartsAt?: string | null;
  meetingType?: string | null;
  officeTz?: string | null;
}) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [deadline, setDeadline] = useState<DeadlineInfo | null>(initialDeadline);
  const [status, setStatus] = useState<string>("");
  const [agendaSearch, setAgendaSearch] = useState<string>("");
  const [agendaStateFilter, setAgendaStateFilter] = useState<string>("all");
  const [agendaCategoryFilter, setAgendaCategoryFilter] = useState<string>("all");
  const [agendaLateOnly, setAgendaLateOnly] = useState<boolean>(false);
  const [agendaSort, setAgendaSort] = useState<"recent" | "title">("recent");

  // New item form
  const [showNewForm, setShowNewForm] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("discussion");
  const [newBackground, setNewBackground] = useState<string>("");
  const [newMotion, setNewMotion] = useState<string>("");
  const [newFiscal, setNewFiscal] = useState<string>("");
  const [newAttachments, setNewAttachments] = useState<string>("");
  const [createBusy, setCreateBusy] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editBackground, setEditBackground] = useState<string>("");
  const [editMotion, setEditMotion] = useState<string>("");
  const [editFiscal, setEditFiscal] = useState<string>("");
  const [editAttachments, setEditAttachments] = useState<string>("");

  const reload = useCallback(async () => {
    const { items: i, deadline: d } = await fetchJson<{
      items: AgendaItem[];
      deadline: DeadlineInfo | null;
    }>(`/api/meetings/${encodeURIComponent(meetingId)}/agenda-items`);
    setItems(i);
    setDeadline(d);
  }, [meetingId]);

  const fallbackDeadline = useMemo(
    () => (meetingStartsAt ? buildFallbackDeadline(meetingId, meetingStartsAt, meetingType) : null),
    [meetingId, meetingStartsAt, meetingType],
  );

  const effectiveDeadline = useMemo(() => {
    if (deadline && isValidIso(deadline.submission_deadline) && isValidIso(deadline.posting_deadline)) {
      return deadline;
    }
    return fallbackDeadline ?? deadline ?? null;
  }, [deadline, fallbackDeadline]);

  const submissionOpen = effectiveDeadline ? effectiveDeadline.is_submission_open : true;
  const submissionClosed = !submissionOpen;
  const hoursUntilDeadline =
    typeof effectiveDeadline?.hours_until_deadline === "number" ? effectiveDeadline.hours_until_deadline : null;
  const submissionDeadlineLabel = effectiveDeadline && isValidIso(effectiveDeadline.submission_deadline)
    ? formatDeadline(effectiveDeadline.submission_deadline, officeTz)
    : null;
  const lateSubmissionsAllowed =
    !!effectiveDeadline?.is_past_deadline && !!effectiveDeadline?.is_submission_open;
  const canCreateNewItem = submissionOpen && newTitle.trim().length > 0 && !createBusy && !actionBusy;

  const showNewFormResolved = showNewForm && submissionOpen;

  async function createItem(submitImmediately: boolean) {
    if (submissionClosed) {
      setStatus("Submission deadline has passed.");
      return;
    }

    if (!newTitle.trim()) {
      setStatus("Title required");
      return;
    }

    if (createBusy || actionBusy) return;

    setCreateBusy(true);
    setStatus(submitImmediately ? "Submitting..." : "Creating...");
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
          attachments_json: parseAttachmentsInput(newAttachments),
          submit_immediately: submitImmediately,
        }),
      });

      setStatus(submitImmediately ? "Submitted for review." : "Draft saved.");
      toast.success(submitImmediately ? "Agenda item submitted" : "Agenda item drafted");
      setNewTitle("");
      setNewCategory("discussion");
      setNewBackground("");
      setNewMotion("");
      setNewFiscal("");
      setNewAttachments("");
      setShowNewForm(false);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await createItem(false);
  }

  function startEdit(item: AgendaItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditBackground(item.background ?? "");
    setEditMotion(item.recommended_motion ?? "");
    setEditFiscal(item.fiscal_impact ?? "");
    setEditAttachments(attachmentsToTextarea(item.attachments_json));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAttachments("");
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();

    if (submissionClosed) {
      setStatus("Submission deadline has passed.");
      return;
    }

    if (!editTitle.trim()) {
      setStatus("Title required");
      return;
    }

    if (actionBusy) return;
    setActionBusy(`update:${itemId}`);
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
            attachments_json: parseAttachmentsInput(editAttachments),
          }),
        },
      );

      setStatus("Draft updated.");
      toast.success("Agenda item updated");
      setEditingId(null);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSubmit(itemId: string) {
    if (submissionClosed) {
      setStatus("Submission deadline has passed.");
      return;
    }

    if (!confirm("Submit this item for review? You won't be able to edit it after submission.")) {
      return;
    }

    if (actionBusy) return;
    setActionBusy(`submit:${itemId}`);
    setStatus("Submitting...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}/submit`,
        { method: "POST" },
      );

      setStatus("");
      toast.success("Agenda item submitted");
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleWithdraw(itemId: string) {
    if (!confirm("Withdraw this item?")) return;

    if (actionBusy) return;
    setActionBusy(`withdraw:${itemId}`);
    setStatus("Withdrawing...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
      );

      setStatus("");
      toast.success("Agenda item withdrawn");
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to withdraw";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReview(itemId: string, newState: "accepted" | "rejected" | "tabled") {
    const stateLabel = newState === "accepted" ? "accept" : newState === "rejected" ? "reject" : "table";
    if (!confirm(`Are you sure you want to ${stateLabel} this item?`)) return;

    if (actionBusy) return;
    setActionBusy(`review:${itemId}`);
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
      toast.success(`Agenda item ${stateLabel}ed`);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to review";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  const myItems = items.filter((i) => i.submitted_by === userId);
  const allItems = items;
  const agendaFiltersActive =
    agendaSearch.trim().length > 0 ||
    agendaStateFilter !== "all" ||
    agendaCategoryFilter !== "all" ||
    agendaLateOnly ||
    agendaSort !== "recent";

  const agendaSummary = useMemo(() => {
    const total = items.length;
    const submitted = items.filter((i) => i.state === "submitted").length;
    const accepted = items.filter((i) => i.state === "accepted").length;
    const late = items.filter((i) => i.is_late).length;
    return { total, submitted, accepted, late };
  }, [items]);

  function resetAgendaFilters() {
    setAgendaSearch("");
    setAgendaStateFilter("all");
    setAgendaCategoryFilter("all");
    setAgendaLateOnly(false);
    setAgendaSort("recent");
  }

  const applyAgendaFilters = useCallback(
    (list: AgendaItem[]) => {
      const query = agendaSearch.trim().toLowerCase();
      let filtered = list.filter((item) => {
        if (agendaStateFilter !== "all" && item.state !== agendaStateFilter) return false;
        if (agendaCategoryFilter !== "all" && item.category !== agendaCategoryFilter) return false;
        if (agendaLateOnly && !item.is_late) return false;
        if (!query) return true;
        const haystack = `${item.title} ${item.background ?? ""} ${item.recommended_motion ?? ""}`.toLowerCase();
        return haystack.includes(query);
      });

      filtered = [...filtered].sort((a, b) => {
        if (agendaSort === "title") return a.title.localeCompare(b.title);
        const aTime = new Date(a.submitted_at ?? a.created_at).getTime();
        const bTime = new Date(b.submitted_at ?? b.created_at).getTime();
        return bTime - aTime;
      });
      return filtered;
    },
    [agendaSearch, agendaStateFilter, agendaCategoryFilter, agendaLateOnly, agendaSort],
  );

  const filteredMyItems = useMemo(() => applyAgendaFilters(myItems), [applyAgendaFilters, myItems]);

  const filteredAllItems = useMemo(() => applyAgendaFilters(allItems), [applyAgendaFilters, allItems]);

  const acceptedItems = useMemo(
    () => items.filter((item) => item.state === "accepted" || item.state === "tabled"),
    [items],
  );

  const exportItems = isAdmin ? filteredAllItems : filteredMyItems;

  async function handleCopyAccepted() {
    try {
      await navigator.clipboard.writeText(buildAgendaText(acceptedItems));
      setStatus("Accepted agenda copied.");
      toast.success("Accepted agenda copied");
    } catch {
      setStatus("Copy failed. Your browser may block clipboard access.");
      toast.error("Copy failed");
    }
  }

  function handleDownloadCsv() {
    if (exportItems.length === 0) {
      setStatus("No agenda items to export.");
      toast.error("No agenda items to export");
      return;
    }
    const csv = buildAgendaCsv(exportItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agenda_items_${meetingId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV downloaded.");
    toast.success("CSV downloaded");
  }

  return (
    <div className="space-y-6">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Submission status</div>
              <div className="text-xs text-foreground/60">
                Deadlines are based on the meeting start time.
              </div>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                lateSubmissionsAllowed
                  ? "bg-orange-100 text-orange-700"
                  : submissionOpen
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {lateSubmissionsAllowed ? "Late submissions" : submissionOpen ? "Open" : "Closed"}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <div className="text-xs text-foreground/70">Submission deadline</div>
              <div className="text-sm">
                {formatDeadline(effectiveDeadline?.submission_deadline, officeTz)}
                {effectiveDeadline?.is_special ? " (Special Meeting)" : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-foreground/70">Agenda posting deadline</div>
              <div className="text-sm">{formatDeadline(effectiveDeadline?.posting_deadline, officeTz)}</div>
            </div>
            {typeof hoursUntilDeadline === "number" ? (
              <div className="text-xs text-foreground/70">
                {hoursUntilDeadline >= 0
                  ? `${hoursUntilDeadline.toFixed(1)} hours left to submit`
                  : `${Math.abs(hoursUntilDeadline).toFixed(1)} hours past the deadline`}
              </div>
            ) : null}
            {lateSubmissionsAllowed ? (
              <div className="text-xs text-foreground/70">
                Late submissions are allowed. Items will be marked late.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="text-sm font-medium">Quick actions</div>
          <div className="mt-2 text-xs text-foreground/60">
            Total {agendaSummary.total} • Submitted {agendaSummary.submitted} • Accepted {agendaSummary.accepted} • Late{" "}
            {agendaSummary.late}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyAccepted} disabled={acceptedItems.length === 0}>
              Copy accepted agenda
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadCsv} disabled={exportItems.length === 0}>
              Download CSV
            </Button>
          </div>
          {!submissionOpen ? (
            <div className="mt-3 text-xs text-foreground/60">
              Submissions closed{submissionDeadlineLabel ? ` on ${submissionDeadlineLabel}` : "."}
            </div>
          ) : null}
        </div>
      </div>

      <details className="rounded-lg border border-foreground/10 p-4">
        <summary className="cursor-pointer text-sm font-medium">Filters & export</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-foreground/70 sm:col-span-2">
            <span>Search</span>
            <input
              type="search"
              className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm"
              value={agendaSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAgendaSearch(e.target.value)}
              placeholder="Title, background, motion..."
            />
          </label>
          <label className="space-y-1 text-xs text-foreground/70">
            <span>State</span>
            <select
              className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm"
              value={agendaStateFilter}
              onChange={(e) => setAgendaStateFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="tabled">Tabled</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-foreground/70">
            <span>Category</span>
            <select
              className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm"
              value={agendaCategoryFilter}
              onChange={(e) => setAgendaCategoryFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="action">Action</option>
              <option value="discussion">Discussion</option>
              <option value="information">Information</option>
              <option value="consent">Consent</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-foreground/70">
            <span>Sort</span>
            <select
              className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm"
              value={agendaSort}
              onChange={(e) => setAgendaSort(e.target.value as "recent" | "title")}
            >
              <option value="recent">Most recent</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-foreground/70">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agendaLateOnly}
              onChange={(e) => setAgendaLateOnly(e.target.checked)}
            />
            Late only
          </label>
          <Button variant="ghost" size="sm" onClick={resetAgendaFilters} disabled={!agendaFiltersActive}>
            Reset filters
          </Button>
        </div>
      </details>

      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">New agenda item</div>
          {submissionOpen ? (
            <Button type="button" size="sm" onClick={() => setShowNewForm(!showNewForm)}>
              {showNewFormResolved ? "Hide form" : "Start new item"}
            </Button>
          ) : (
            <span className="text-xs text-foreground/60">
              Submissions closed{submissionDeadlineLabel ? ` on ${submissionDeadlineLabel}` : ""}
            </span>
          )}
        </div>

        {showNewFormResolved ? (
          <form onSubmit={handleCreate} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-foreground/70">Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                  placeholder="Agenda item title"
                  className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-foreground/70">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                >
                  <option value="action">Action</option>
                  <option value="discussion">Discussion</option>
                  <option value="information">Information</option>
                  <option value="consent">Consent</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <details className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground/70">
                Add details (optional)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Background</label>
                  <textarea
                    value={newBackground}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewBackground(e.target.value)}
                    placeholder="Context and background information..."
                    rows={3}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Recommended Motion</label>
                  <textarea
                    value={newMotion}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewMotion(e.target.value)}
                    placeholder="Motion language if this is an action item..."
                    rows={2}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Fiscal Impact</label>
                  <input
                    type="text"
                    value={newFiscal}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFiscal(e.target.value)}
                    placeholder="e.g., $500 from ASGC Budget"
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Supporting documents (URLs)</label>
                  <textarea
                    value={newAttachments}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewAttachments(e.target.value)}
                    placeholder="One URL per line"
                    rows={2}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={!canCreateNewItem}>
                Save Draft
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void createItem(true)}
                disabled={!canCreateNewItem}
              >
                Submit for review
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      {/* My items section */}
      <div>
        <h3 className="mb-3 text-sm font-medium">
          My Submissions ({filteredMyItems.length} of {myItems.length})
        </h3>
        {filteredMyItems.length === 0 ? (
          <div className="text-sm text-foreground/70">
            {agendaFiltersActive ? "No submissions match the current filters." : "You have not submitted any items for this meeting."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredMyItems.map((item) => (
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
                    <textarea
                      value={editAttachments}
                      onChange={(e) => setEditAttachments(e.target.value)}
                      placeholder="Supporting documents (one URL per line)"
                      rows={2}
                      className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={!submissionOpen || !editTitle.trim() || !!actionBusy}>
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
                            <span
                              className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700"
                              title="Submitted after the deadline"
                            >
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
                    {normalizeAttachments(item.attachments_json).length > 0 ? (
                      <div className="mt-2 text-sm">
                        <div className="text-xs text-foreground/60">Supporting documents</div>
                        <ul className="mt-1 space-y-1 text-xs text-foreground/70">
                          {normalizeAttachments(item.attachments_json).map((attachment) => (
                            <li key={attachment}>
                              {isProbablyUrl(attachment) ? (
                                <a className="underline underline-offset-2" href={attachment} target="_blank" rel="noreferrer">
                                  {attachment}
                                </a>
                              ) : (
                                <span>{attachment}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Actions for own items */}
                    {item.state === "draft" ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => startEdit(item)}
                          disabled={!submissionOpen || !!actionBusy}
                          title={submissionOpen ? "Edit draft" : "Submission deadline has passed"}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSubmit(item.id)}
                          disabled={!submissionOpen || !!actionBusy}
                          title={submissionOpen ? "Submit for review" : "Submission deadline has passed"}
                        >
                          Submit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleWithdraw(item.id)}
                          disabled={!!actionBusy}
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
                          disabled={!!actionBusy}
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
          <h3 className="mb-3 text-sm font-medium">
            All Submissions ({filteredAllItems.length} of {allItems.length})
          </h3>
          {filteredAllItems.length === 0 ? (
            <div className="text-sm text-foreground/70">
              {agendaFiltersActive ? "No submissions match the current filters." : "No submissions for this meeting."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAllItems.map((item) => (
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
                          <span
                            className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700"
                            title="Submitted after the deadline"
                          >
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
                  {normalizeAttachments(item.attachments_json).length > 0 ? (
                    <div className="mt-2 text-sm">
                      <div className="text-xs text-foreground/60">Supporting documents</div>
                      <ul className="mt-1 space-y-1 text-xs text-foreground/70">
                        {normalizeAttachments(item.attachments_json).map((attachment) => (
                          <li key={attachment}>
                            {isProbablyUrl(attachment) ? (
                              <a className="underline underline-offset-2" href={attachment} target="_blank" rel="noreferrer">
                                {attachment}
                              </a>
                            ) : (
                              <span>{attachment}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Admin review buttons */}
                  {item.state === "submitted" ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleReview(item.id, "accepted")}
                        disabled={!!actionBusy}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(item.id, "rejected")}
                        disabled={!!actionBusy}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(item.id, "tabled")}
                        disabled={!!actionBusy}
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
