"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyTextWithFallback } from "@/lib/clipboard";

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
  sort_order?: number | null;
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

function formatMeetingDate(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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

function formatAgendaError(message: string): string {
  const key = message.trim().toLowerCase();
  if (key.includes("meeting_not_scheduled") || key.includes("meeting_not_schedueld")) {
    return "This meeting is not scheduled. Agenda submissions are disabled.";
  }
  if (key.includes("meeting_not_found")) {
    return "Meeting not found.";
  }
  if (key.includes("submission_closed")) {
    return "Submission deadline has passed.";
  }
  if (key.includes("cannot_edit_finalized_item")) {
    return "This agenda item has already been finalized.";
  }
  if (key.includes("forbidden")) {
    return "You are not authorized to update this agenda item.";
  }
  if (key.includes("title_required")) {
    return "Title is required.";
  }
  if (key.includes("unauthorized")) {
    return "You are not authorized to submit agenda items.";
  }
  return message;
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
  meetingTitle,
  meetingCommitteeId,
  meetingStartsAt,
  meetingType,
  officeTz,
  meetingStatus,
  onItemsChange,
}: {
  meetingId: string;
  initialItems: AgendaItem[];
  initialDeadline: DeadlineInfo | null;
  isAdmin: boolean;
  userId: string;
  meetingTitle?: string | null;
  meetingCommitteeId?: string | null;
  meetingStartsAt?: string | null;
  meetingType?: string | null;
  officeTz?: string | null;
  meetingStatus: string;
  onItemsChange?: (items: AgendaItem[]) => void;
}) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [deadline, setDeadline] = useState<DeadlineInfo | null>(initialDeadline);
  const [status, setStatus] = useState<string>("");
  const [agendaSearch, setAgendaSearch] = useState<string>("");
  const [agendaStateFilter, setAgendaStateFilter] = useState<string>("all");
  const [agendaCategoryFilter, setAgendaCategoryFilter] = useState<string>("all");
  const [agendaLateOnly, setAgendaLateOnly] = useState<boolean>(false);
  const [agendaSort, setAgendaSort] = useState<"agenda" | "recent" | "title">(() =>
    isAdmin ? "agenda" : "recent",
  );

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
  const [selectedAdminItems, setSelectedAdminItems] = useState<Record<string, boolean>>({});

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editBackground, setEditBackground] = useState<string>("");
  const [editMotion, setEditMotion] = useState<string>("");
  const [editFiscal, setEditFiscal] = useState<string>("");
  const [editAttachments, setEditAttachments] = useState<string>("");

  useEffect(() => {
    onItemsChange?.(items);
    setSelectedAdminItems({});
  }, [items, onItemsChange]);

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

  const meetingActive = meetingStatus === "scheduled";
  const meetingIsCancelled = meetingStatus === "cancelled";
  const submissionOpen = meetingActive && (effectiveDeadline ? effectiveDeadline.is_submission_open : true);
  const submissionClosed = !submissionOpen;
  const hoursUntilDeadline =
    typeof effectiveDeadline?.hours_until_deadline === "number" ? effectiveDeadline.hours_until_deadline : null;
  const submissionDeadlineLabel = effectiveDeadline && isValidIso(effectiveDeadline.submission_deadline)
    ? formatDeadline(effectiveDeadline.submission_deadline, officeTz)
    : null;
  const lateSubmissionsAllowed =
    meetingActive && !!effectiveDeadline?.is_past_deadline && !!effectiveDeadline?.is_submission_open;
  const canCreateNewItem = submissionOpen && newTitle.trim().length > 0 && !createBusy && !actionBusy;

  const showNewFormResolved = showNewForm && submissionOpen;

  const meetingStatusNotice =
    meetingStatus === "cancelled"
      ? "This meeting was cancelled. Agenda submissions are disabled."
      : meetingStatus === "completed"
        ? "This meeting is completed. Agenda submissions are closed."
        : "";
  const meetingCancelledGuidance = meetingIsCancelled
    ? "This meeting was cancelled. To reschedule, ask an admin to duplicate the meeting and set a new date."
    : "";
  const meetingDateLabel = formatMeetingDate(meetingStartsAt, officeTz);
  const meetingHubPath = `/meetings/${meetingId}`;

  function buildTaskDescription(item: AgendaItem) {
    const parts: string[] = [];
    if (meetingTitle) parts.push(`Meeting: ${meetingTitle}`);
    if (meetingDateLabel) parts.push(`Meeting date: ${meetingDateLabel}`);
    parts.push(`Agenda item: ${item.title}`);
    if (item.fiscal_impact) parts.push(`Fiscal impact: ${item.fiscal_impact}`);
    if (item.recommended_motion) parts.push(`Motion: ${item.recommended_motion}`);
    if (item.background) parts.push(`Background: ${item.background}`);
    const attachments = normalizeAttachments(item.attachments_json);
    if (attachments.length > 0) {
      parts.push("Supporting links:");
      parts.push(...attachments.map((link) => `- ${link}`));
    }
    parts.push(`Meeting hub: ${meetingHubPath}`);
    return parts.join("\n");
  }

  function buildTaskPrefillUrl(item: AgendaItem) {
    const params = new URLSearchParams();
    params.set("prefillTitle", item.title);
    const description = buildTaskDescription(item);
    if (description) params.set("prefillDescription", description);
    if (meetingCommitteeId) params.set("committeeId", meetingCommitteeId);
    if (item.fiscal_impact) params.set("prefillPriority", "high");
    if (meetingStartsAt && isValidIso(meetingStartsAt)) {
      params.set("prefillDue", meetingStartsAt.slice(0, 10));
    }
    params.set("source", "agenda-item");
    params.set("meetingId", meetingId);
    params.set("agendaItemId", item.id);
    return `/tasks?${params.toString()}`;
  }

  function handleCreateTask(item: AgendaItem) {
    window.location.href = buildTaskPrefillUrl(item);
  }

  async function createItem(submitImmediately: boolean) {
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Submissions are disabled for this meeting.");
      return;
    }
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
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to create");
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

    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Updates are disabled for this meeting.");
      return;
    }
    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) {
      setStatus("Agenda item not found.");
      return;
    }
    if (submissionClosed && currentItem.state === "draft") {
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
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to update");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSubmit(itemId: string) {
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Submissions are disabled for this meeting.");
      return;
    }
    if (submissionClosed) {
      setStatus("Submission deadline has passed.");
      return;
    }

    if (!confirm("Submit this item for review? You can still make edits before it is accepted.")) {
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
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to submit");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleWithdraw(itemId: string) {
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Submissions are disabled for this meeting.");
      return;
    }
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
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to withdraw");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReview(itemId: string, newState: "accepted" | "rejected" | "tabled") {
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Review actions are disabled for this meeting.");
      return;
    }
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
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to review");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  function toggleAdminSelection(itemId: string) {
    setSelectedAdminItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  function toggleSelectAllAdminItems(checked: boolean) {
    if (!checked) {
      setSelectedAdminItems({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const item of selectableAdminItems) {
      next[item.id] = true;
    }
    setSelectedAdminItems(next);
  }

  async function handleBulkReview(newState: "accepted" | "rejected" | "tabled") {
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Review actions are disabled for this meeting.");
      return;
    }
    if (selectedAdminIds.length === 0) return;
    const stateLabel = newState === "accepted" ? "accept" : newState === "rejected" ? "reject" : "table";
    if (!confirm(`Review ${selectedAdminIds.length} item(s) and ${stateLabel} them?`)) return;

    if (actionBusy) return;
    setActionBusy(`bulk:${newState}`);
    setStatus(`Reviewing ${selectedAdminIds.length} item(s)...`);
    try {
      for (const itemId of selectedAdminIds) {
        await fetchJson(
          `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: newState }),
          },
        );
      }
      setStatus("");
      toast.success(`Agenda items ${stateLabel}ed`);
      await reload();
    } catch (err) {
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to review items");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleLateOverride(itemId: string, nextValue: boolean) {
    if (!isAdmin) return;
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Updates are disabled for this meeting.");
      return;
    }
    if (actionBusy) return;
    setActionBusy(`late:${itemId}`);
    setStatus(nextValue ? "Marking item late..." : "Clearing late flag...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_late: nextValue }),
        },
      );
      setStatus("");
      toast.success(nextValue ? "Agenda item marked late" : "Late flag cleared");
      await reload();
    } catch (err) {
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to update late flag");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleMoveAgendaItem(itemId: string, direction: -1 | 1) {
    if (!isAdmin) return;
    if (!meetingActive) {
      setStatus(meetingStatusNotice || "Updates are disabled for this meeting.");
      return;
    }
    if (actionBusy) return;
    const orderedIds = orderedAgendaItems.map((item) => item.id);
    const currentIndex = orderedIds.indexOf(itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= orderedIds.length) return;
    const currentItem = orderedAgendaItems[currentIndex];
    const swapItem = orderedAgendaItems[nextIndex];
    const currentOrder =
      typeof currentItem.sort_order === "number" ? currentItem.sort_order : currentIndex + 1;
    const swapOrder =
      typeof swapItem.sort_order === "number" ? swapItem.sort_order : nextIndex + 1;

    setActionBusy(`reorder:${itemId}`);
    setStatus("Updating agenda order...");
    try {
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(currentItem.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: swapOrder }),
        },
      );
      await fetchJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/agenda-items/${encodeURIComponent(swapItem.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: currentOrder }),
        },
      );
      setStatus("");
      toast.success("Agenda order updated");
      await reload();
    } catch (err) {
      const msg = formatAgendaError(err instanceof Error ? err.message : "Failed to reorder agenda items");
      setStatus(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  const myItems = items.filter((i) => i.submitted_by === userId);
  const allItems = items;
  const agendaSortDefault = isAdmin ? "agenda" : "recent";
  const agendaFiltersActive =
    agendaSearch.trim().length > 0 ||
    agendaStateFilter !== "all" ||
    agendaCategoryFilter !== "all" ||
    agendaLateOnly ||
    agendaSort !== agendaSortDefault;

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
    setAgendaSort(isAdmin ? "agenda" : "recent");
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
        if (agendaSort === "agenda") {
          const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
          const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        }
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
  const selectableAdminItems = useMemo(
    () => filteredAllItems.filter((item) => item.state === "submitted"),
    [filteredAllItems],
  );
  const selectedAdminIds = useMemo(
    () => Object.keys(selectedAdminItems).filter((id) => selectedAdminItems[id]),
    [selectedAdminItems],
  );
  const allSelectableSelected =
    selectableAdminItems.length > 0 && selectableAdminItems.every((item) => selectedAdminItems[item.id]);

  const orderedAgendaItems = useMemo(() => {
    return [...items]
      .filter((item) => item.state === "accepted" || item.state === "tabled")
      .sort((a, b) => {
        const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
  }, [items]);

  const acceptedItems = orderedAgendaItems;

  const exportItems = isAdmin ? filteredAllItems : filteredMyItems;

  const filteredSummary = useMemo(() => {
    const list = exportItems;
    const counts = {
      total: list.length,
      draft: 0,
      submitted: 0,
      accepted: 0,
      rejected: 0,
      tabled: 0,
      withdrawn: 0,
      late: 0,
    };
    for (const item of list) {
      if (item.state === "draft") counts.draft += 1;
      else if (item.state === "submitted") counts.submitted += 1;
      else if (item.state === "accepted") counts.accepted += 1;
      else if (item.state === "rejected") counts.rejected += 1;
      else if (item.state === "tabled") counts.tabled += 1;
      else if (item.state === "withdrawn") counts.withdrawn += 1;
      if (item.is_late) counts.late += 1;
    }
    return counts;
  }, [exportItems]);

  async function handleCopyAccepted() {
    const ok = await copyTextWithFallback(buildAgendaText(acceptedItems), {
      promptLabel: "Copy accepted agenda",
    });
    if (ok) {
      setStatus("Accepted agenda copied.");
      toast.success("Accepted agenda copied");
    } else {
      const msg = "Clipboard blocked. Use the prompt to copy.";
      setStatus(msg);
      toast.info(msg);
    }
  }

  async function handleCopyFiltered() {
    if (exportItems.length === 0) {
      setStatus("No agenda items to copy.");
      toast.error("No agenda items to copy");
      return;
    }
    const ok = await copyTextWithFallback(buildAgendaText(exportItems), {
      promptLabel: "Copy filtered agenda items",
    });
    if (ok) {
      setStatus("Agenda items copied.");
      toast.success("Agenda items copied");
    } else {
      const msg = "Clipboard blocked. Use the prompt to copy.";
      setStatus(msg);
      toast.info(msg);
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

  function handleDownloadAcceptedCsv() {
    if (acceptedItems.length === 0) {
      setStatus("No accepted agenda items to export.");
      toast.error("No accepted agenda items to export");
      return;
    }
    const csv = buildAgendaCsv(acceptedItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `accepted_agenda_${meetingId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Accepted agenda CSV downloaded.");
    toast.success("Accepted agenda CSV downloaded");
  }

  return (
    <div className="space-y-6">
      {meetingStatusNotice ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <div>{meetingStatusNotice}</div>
          {meetingCancelledGuidance ? (
            <div className="mt-1 text-xs text-red-700/80">{meetingCancelledGuidance}</div>
          ) : null}
        </div>
      ) : null}
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
          <div className="text-xs text-foreground/60">
            States: Draft = saved by you. Submitted = pending admin review. Accepted = on agenda. Rejected/Withdrawn = not
            on agenda.
          </div>
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
            <Button variant="outline" size="sm" onClick={handleCopyFiltered} disabled={exportItems.length === 0}>
              Copy filtered list
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadAcceptedCsv} disabled={acceptedItems.length === 0}>
              Download accepted CSV
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
              onChange={(e) => setAgendaSort(e.target.value as "agenda" | "recent" | "title")}
            >
              {isAdmin ? <option value="agenda">Agenda order</option> : null}
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground/50">Quick filters</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAgendaStateFilter("submitted");
                setAgendaLateOnly(false);
              }}
            >
              Submitted
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAgendaStateFilter("accepted");
                setAgendaLateOnly(false);
              }}
            >
              Accepted
            </Button>
            <Button
              variant={agendaLateOnly ? "default" : "ghost"}
              size="sm"
              onClick={() => setAgendaLateOnly((prev) => !prev)}
            >
              Late
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={resetAgendaFilters} disabled={!agendaFiltersActive}>
            Reset filters
          </Button>
        </div>
        <div className="mt-2 text-xs text-foreground/60">
          Filtered {filteredSummary.total} • Draft {filteredSummary.draft} • Submitted {filteredSummary.submitted} •
          Accepted {filteredSummary.accepted} • Late {filteredSummary.late}
        </div>
      </details>

      {meetingActive ? (
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

              <details className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2" open>
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

              <div className="sticky bottom-0 -mx-4 border-t border-foreground/10 bg-background/95 px-4 py-2 backdrop-blur">
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
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-foreground/10 p-4 text-sm text-foreground/70">
          Agenda submissions are closed for this meeting.
        </div>
      )}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          !editTitle.trim() ||
                          !!actionBusy ||
                          (!submissionOpen && item.state === "draft") ||
                          !meetingActive
                        }
                      >
                        Save
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <span className="text-xs text-foreground/60">Edits are tracked for review.</span>
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
                    {item.state === "draft" || item.state === "submitted" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => startEdit(item)}
                          disabled={!!actionBusy || !meetingActive || (!submissionOpen && item.state === "draft")}
                          title={
                            !meetingActive
                              ? "Updates are disabled"
                              : submissionOpen || item.state === "submitted"
                                ? "Edit item"
                                : "Submission deadline has passed"
                          }
                        >
                          Edit
                        </Button>
                        {item.state === "draft" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSubmit(item.id)}
                            disabled={!submissionOpen || !!actionBusy}
                            title={submissionOpen ? "Submit for review" : "Submission deadline has passed"}
                          >
                            Submit
                          </Button>
                        ) : null}
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => handleCreateTask(item)}>
                        {item.fiscal_impact ? "Create finance task" : "Create task"}
                      </Button>
                    </div>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-foreground/60">You have chair privileges for this meeting.</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/70">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={(e) => toggleSelectAllAdminItems(e.target.checked)}
                  disabled={selectableAdminItems.length === 0}
                />
                <span>Select all submitted ({selectableAdminItems.length})</span>
              </label>
              <span>{selectedAdminIds.length} selected</span>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleBulkReview("accepted")}
                disabled={selectedAdminIds.length === 0 || !!actionBusy}
              >
                Accept selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleBulkReview("rejected")}
                disabled={selectedAdminIds.length === 0 || !!actionBusy}
              >
                Reject selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleBulkReview("tabled")}
                disabled={selectedAdminIds.length === 0 || !!actionBusy}
              >
                Table selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedAdminItems({})}
                disabled={selectedAdminIds.length === 0 || !!actionBusy}
              >
                Clear selection
              </Button>
            </div>
          </div>
          {filteredAllItems.length === 0 ? (
            <div className="text-sm text-foreground/70">
              {agendaFiltersActive ? "No submissions match the current filters." : "No submissions for this meeting."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAllItems.map((item) => {
                const agendaIndex = orderedAgendaItems.findIndex((agendaItem) => agendaItem.id === item.id);
                const isAgendaItem = item.state === "accepted" || item.state === "tabled";
                const canMoveUp = agendaIndex > 0;
                const canMoveDown = agendaIndex >= 0 && agendaIndex < orderedAgendaItems.length - 1;
                return (
                <div key={item.id} className="rounded-lg border border-foreground/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!selectedAdminItems[item.id]}
                        onChange={() => toggleAdminSelection(item.id)}
                        disabled={item.state !== "submitted" || !!actionBusy}
                        title={
                          item.state === "submitted"
                            ? "Select for bulk review"
                            : "Only submitted items can be selected"
                        }
                      />
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.state === "submitted" ? (
                      <>
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
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleLateOverride(item.id, !item.is_late)}
                      disabled={!!actionBusy}
                    >
                      {item.is_late ? "Clear late" : "Mark late"}
                    </Button>
                    {agendaSort === "agenda" && isAgendaItem ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleMoveAgendaItem(item.id, -1)}
                          disabled={!canMoveUp || !!actionBusy}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleMoveAgendaItem(item.id, 1)}
                          disabled={!canMoveDown || !!actionBusy}
                        >
                          Move down
                        </Button>
                      </>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => handleCreateTask(item)}>
                      {item.fiscal_impact ? "Create finance task" : "Create task"}
                    </Button>
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
