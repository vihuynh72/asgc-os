"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCopy,
  IconDownload,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@/components/ui/icons";
import { copyTextWithFallback } from "@/lib/clipboard";
import type { TaskPrefill } from "@/lib/task-types";

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

type TaskTemplate = {
  id: string;
  label: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueOffsetDays?: number;
};

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "event-planning",
    label: "Event planning",
    title: "Plan upcoming event",
    description: "Outline timeline, logistics, speakers, and promotional plan.",
    priority: "high",
    dueOffsetDays: 21,
  },
  {
    id: "budget-review",
    label: "Budget review",
    title: "Review budget request",
    description: "Validate amounts, attach quotes, and confirm compliance.",
    priority: "medium",
    dueOffsetDays: 7,
  },
  {
    id: "meeting-follow-up",
    label: "Meeting follow-up",
    title: "Send meeting follow-up",
    description: "Distribute notes, assign action items, and update docs.",
    priority: "medium",
    dueOffsetDays: 3,
  },
  {
    id: "doc-update",
    label: "Document update",
    title: "Update shared document",
    description: "Revise content, add references, and publish final copy.",
    priority: "low",
    dueOffsetDays: 10,
  },
];

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

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // Use noon UTC to avoid timezone-related "previous day" rendering issues.
  const d = new Date(`${v}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isDateInPast(value: string): boolean {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatTaskErrorMessage(message: string): string {
  const lower = message.trim().toLowerCase();
  if (lower.includes("unauthorized")) return "Please sign in to continue.";
  if (lower.includes("forbidden") || lower.includes("permission")) {
    return "You do not have permission to complete this action.";
  }
  if (lower.includes("task_not_found") || lower.includes("not found")) {
    return "Task not found.";
  }
  if (lower.includes("title_required")) return "Title is required.";
  if (lower.includes("committee_required")) return "Committee is required.";
  if (lower.includes("invalid_assignee")) return "That assignee is not available for this committee.";
  return message;
}
function isTaskOverdue(task: TaskRow): boolean {
  if (!task.due_at || task.status === "done") return false;
  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function isTaskDueSoon(task: TaskRow, days: number = 7): boolean {
  if (!task.due_at || task.status === "done") return false;
  const due = new Date(task.due_at).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return due >= now && due <= now + windowMs;
}

function formatTaskPriority(priority: TaskRow["priority"]): string {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function priorityBadgeClass(priority: TaskRow["priority"]): string {
  if (priority === "high") return "bg-red-100 text-red-700";
  if (priority === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function formatTaskStatus(status: TaskRow["status"]): string {
  if (status === "todo") return "To do";
  if (status === "doing") return "Doing";
  return "Done";
}

function statusBadgeClass(status: TaskRow["status"]): string {
  if (status === "todo") return "bg-gray-100 text-gray-700";
  if (status === "doing") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

function toCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/\"/g, "\"\"")}"`;
  }
  return raw;
}

export function TasksPanel({
  initialTasks,
  initialCommittees,
  projectIdFilter,
  viewerUserId,
  prefill,
}: {
  initialTasks: TaskRow[];
  initialCommittees: CommitteeRow[];
  projectIdFilter: string;
  viewerUserId: string;
  prefill?: TaskPrefill;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [committees, setCommittees] = useState<CommitteeRow[]>(initialCommittees);
  const [assigneesByCommitteeId, setAssigneesByCommitteeId] = useState<Record<string, AssigneeRow[]>>({});

  const [status, setStatus] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterStatuses, setFilterStatuses] = useState<TaskRow["status"][]>([]);
  const [filterCommitteeId, setFilterCommitteeId] = useState<string>("");
  const [filterPriorities, setFilterPriorities] = useState<TaskRow["priority"][]>([]);
  const [filterAssignee, setFilterAssignee] = useState<"" | "me" | "assigned" | "unassigned">("");
  const [filterOverdueOnly, setFilterOverdueOnly] = useState<boolean>(false);
  const [filterDueSoonOnly, setFilterDueSoonOnly] = useState<boolean>(false);
  const [filterDueStart, setFilterDueStart] = useState<string>("");
  const [filterDueEnd, setFilterDueEnd] = useState<string>("");
  const [sortKey, setSortKey] = useState<"updated" | "due" | "title" | "priority">("updated");
  const [taskPage, setTaskPage] = useState<number>(1);
  const [taskPageSize, setTaskPageSize] = useState<number>(10);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [copyPreview, setCopyPreview] = useState<{ label: string; text: string } | null>(null);

  const defaultCommitteeId = initialCommittees[0]?.id ?? "";
  const initialCommitteeId =
    prefill?.committeeId && initialCommittees.some((c) => c.id === prefill.committeeId)
      ? prefill.committeeId
      : defaultCommitteeId;
  const initialPriority: TaskRow["priority"] =
    prefill?.priority === "high" || prefill?.priority === "low" || prefill?.priority === "medium"
      ? prefill.priority
      : "medium";
  const [newCommitteeId, setNewCommitteeId] = useState<string>(initialCommitteeId);
  const [newTitle, setNewTitle] = useState<string>(prefill?.title ?? "");
  const [newDescription, setNewDescription] = useState<string>(prefill?.description ?? "");
  const [newPriority, setNewPriority] = useState<TaskRow["priority"]>(initialPriority);
  const [newDue, setNewDue] = useState<string>(() => {
    const prefillDue = prefill?.due?.trim();
    return prefillDue ? prefillDue : formatDateOnly(addDays(new Date(), 7));
  });
  const [newAssigneeId, setNewAssigneeId] = useState<string>(prefill?.assigneeId ?? viewerUserId);
  const [templateId, setTemplateId] = useState<string>("");
  const [templateNote, setTemplateNote] = useState<string>("");
  const [createErrors, setCreateErrors] = useState<{ committee?: string; title?: string }>({});
  const [createdTaskBanner, setCreatedTaskBanner] = useState<{ id: string; title: string } | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, TaskCommentRow[]>>({});
  const [attachmentsByTaskId, setAttachmentsByTaskId] = useState<Record<string, TaskAttachmentRow[]>>({});
  const [newCommentByTaskId, setNewCommentByTaskId] = useState<Record<string, string>>({});
  const [newAttachmentUrlByTaskId, setNewAttachmentUrlByTaskId] = useState<Record<string, string>>({});
  const [newAttachmentLabelByTaskId, setNewAttachmentLabelByTaskId] = useState<Record<string, string>>({});
  const [prefillDismissed, setPrefillDismissed] = useState<boolean>(false);

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const statusOptions = useMemo(() => ["todo", "doing", "done"] as const, []);
  const priorityOptions = useMemo(() => ["high", "medium", "low"] as const, []);

  const dueWarning = useMemo(() => {
    if (!newDue) return "";
    return isDateInPast(newDue) ? "Due date is in the past." : "";
  }, [newDue]);

  const prefillActive = Boolean(
    prefill?.title ||
      prefill?.description ||
      prefill?.committeeId ||
      prefill?.priority ||
      prefill?.due ||
      prefill?.assigneeId ||
      prefill?.source ||
      prefill?.meetingId ||
      prefill?.agendaItemId,
  );
  const prefillSourceLabel =
    prefill?.source === "agenda-item" || prefill?.agendaItemId
      ? "agenda item"
      : prefill?.source === "meeting" || prefill?.meetingId
        ? "meeting"
        : "link";
  const prefillCommitteeMissing = Boolean(
    prefill?.committeeId && !committees.some((c) => c.id === prefill.committeeId),
  );
  const prefillMeetingUrl = prefill?.meetingId ? `/meetings/${prefill.meetingId}` : "";
  const prefillAgendaItemUrl =
    prefillMeetingUrl && prefill?.agendaItemId ? `${prefillMeetingUrl}#agenda-item-${prefill.agendaItemId}` : "";
  const prefillLinkClass =
    "inline-flex items-center rounded-md border border-foreground/10 bg-background px-2 py-1 text-xs text-foreground/70 hover:bg-foreground/5";

  const filteredTasks = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    let next = tasks;

    if (filterStatuses.length > 0) {
      next = next.filter((t) => filterStatuses.includes(t.status));
    }
    if (filterCommitteeId) {
      next = next.filter((t) => t.committee_id === filterCommitteeId);
    }
    if (filterPriorities.length > 0) {
      next = next.filter((t) => filterPriorities.includes(t.priority));
    }
    if (filterAssignee) {
      if (filterAssignee === "me") {
        next = next.filter((t) => t.assigned_to === viewerUserId);
      } else if (filterAssignee === "assigned") {
        next = next.filter((t) => !!t.assigned_to);
      } else if (filterAssignee === "unassigned") {
        next = next.filter((t) => !t.assigned_to);
      }
    }
    if (filterOverdueOnly) {
      next = next.filter((t) => isTaskOverdue(t));
    }
    if (filterDueSoonOnly) {
      next = next.filter((t) => isTaskDueSoon(t));
    }
    if (filterDueStart || filterDueEnd) {
      const startTs = filterDueStart ? new Date(`${filterDueStart}T00:00:00`).getTime() : null;
      const endTs = filterDueEnd ? new Date(`${filterDueEnd}T23:59:59`).getTime() : null;
      const invalidRange =
        filterDueStart && filterDueEnd && filterDueStart.trim() && filterDueEnd.trim()
          ? filterDueStart > filterDueEnd
          : false;
      if (!invalidRange) {
        next = next.filter((t) => {
          if (!t.due_at) return false;
          const due = new Date(t.due_at).getTime();
          if (Number.isNaN(due)) return false;
          if (startTs && !Number.isNaN(startTs) && due < startTs) return false;
          if (endTs && !Number.isNaN(endTs) && due > endTs) return false;
          return true;
        });
      }
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
    if (sortKey === "priority") {
      const order: Record<TaskRow["priority"], number> = { high: 0, medium: 1, low: 2 };
      sorted.sort((a, b) => {
        const aRank = order[a.priority];
        const bRank = order[b.priority];
        if (aRank !== bRank) return aRank - bRank;
        return a.title.localeCompare(b.title);
      });
      return sorted;
    }

    sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return sorted;
  }, [
    committeesById,
    filterAssignee,
    filterCommitteeId,
    filterDueEnd,
    filterDueSoonOnly,
    filterDueStart,
    filterOverdueOnly,
    filterPriorities,
    filterQuery,
    filterStatuses,
    sortKey,
    tasks,
    viewerUserId,
  ]);

  const overdueCount = useMemo(() => filteredTasks.filter(isTaskOverdue).length, [filteredTasks]);
  const dueSoonCount = useMemo(() => filteredTasks.filter((t) => isTaskDueSoon(t)).length, [filteredTasks]);
  const assignedToMeCount = useMemo(
    () => filteredTasks.filter((t) => t.assigned_to === viewerUserId).length,
    [filteredTasks, viewerUserId],
  );
  const unassignedCount = useMemo(() => filteredTasks.filter((t) => !t.assigned_to).length, [filteredTasks]);
  const highPriorityCount = useMemo(
    () => filteredTasks.filter((t) => t.priority === "high").length,
    [filteredTasks],
  );
  const statusCounts = useMemo(() => {
    const counts = { todo: 0, doing: 0, done: 0 };
    for (const task of filteredTasks) {
      if (task.status === "todo") counts.todo += 1;
      else if (task.status === "doing") counts.doing += 1;
      else if (task.status === "done") counts.done += 1;
    }
    return counts;
  }, [filteredTasks]);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / taskPageSize));
  const resolvedTaskPage = Math.min(taskPage, pageCount);
  const paginatedTasks = useMemo(() => {
    const start = (resolvedTaskPage - 1) * taskPageSize;
    return filteredTasks.slice(start, start + taskPageSize);
  }, [filteredTasks, resolvedTaskPage, taskPageSize]);

  const dueRangeError =
    filterDueStart && filterDueEnd && filterDueStart.trim() && filterDueEnd.trim() && filterDueStart > filterDueEnd
      ? "Start date is after end date."
      : "";
  const advancedFiltersActive =
    filterDueStart.trim().length > 0 ||
    filterDueEnd.trim().length > 0 ||
    filterStatuses.length > 1 ||
    filterPriorities.length > 1;
  const showAdvanced = showAdvancedFilters || advancedFiltersActive;

  const taskFiltersActive =
    filterQuery.trim().length > 0 ||
    filterStatuses.length > 0 ||
    filterCommitteeId.length > 0 ||
    filterPriorities.length > 0 ||
    filterAssignee.length > 0 ||
    filterOverdueOnly ||
    filterDueSoonOnly ||
    filterDueStart.trim().length > 0 ||
    filterDueEnd.trim().length > 0 ||
    sortKey !== "updated";

  const donePercent = filteredTasks.length
    ? Math.round((statusCounts.done / filteredTasks.length) * 100)
    : 0;

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    const query = filterQuery.trim();
    if (query)
      chips.push({
        key: "query",
        label: `Search: "${query}"`,
        onClear: () => {
          setFilterQuery("");
          setTaskPage(1);
        },
      });
    if (filterStatuses.length > 0) {
      chips.push({
        key: "status",
        label: `Status: ${filterStatuses.map(formatTaskStatus).join(", ")}`,
        onClear: () => {
          setFilterStatuses([]);
          setTaskPage(1);
        },
      });
    }
    if (filterCommitteeId) {
      const label = committeesById.get(filterCommitteeId)?.name ?? filterCommitteeId;
      chips.push({
        key: "committee",
        label: `Committee: ${label}`,
        onClear: () => {
          setFilterCommitteeId("");
          setTaskPage(1);
        },
      });
    }
    if (filterPriorities.length > 0) {
      chips.push({
        key: "priority",
        label: `Priority: ${filterPriorities.map(formatTaskPriority).join(", ")}`,
        onClear: () => {
          setFilterPriorities([]);
          setTaskPage(1);
        },
      });
    }
    if (filterAssignee) {
      const label =
        filterAssignee === "me"
          ? "Assigned to me"
          : filterAssignee === "assigned"
            ? "Assigned"
            : "Unassigned";
      chips.push({
        key: "assignee",
        label,
        onClear: () => {
          setFilterAssignee("");
          setTaskPage(1);
        },
      });
    }
    if (filterOverdueOnly) {
      chips.push({
        key: "overdue",
        label: "Overdue only",
        onClear: () => {
          setFilterOverdueOnly(false);
          setTaskPage(1);
        },
      });
    }
    if (filterDueSoonOnly) {
      chips.push({
        key: "dueSoon",
        label: "Due soon only",
        onClear: () => {
          setFilterDueSoonOnly(false);
          setTaskPage(1);
        },
      });
    }
    if (filterDueStart || filterDueEnd) {
      chips.push({
        key: "dueRange",
        label: `Due: ${filterDueStart || "any"} to ${filterDueEnd || "any"}`,
        onClear: () => {
          setFilterDueStart("");
          setFilterDueEnd("");
          setTaskPage(1);
        },
      });
    }
    if (sortKey !== "updated") {
      chips.push({
        key: "sort",
        label: `Sort: ${sortKey}`,
        onClear: () => {
          setSortKey("updated");
          setTaskPage(1);
        },
      });
    }
    return chips;
  }, [
    committeesById,
    filterAssignee,
    filterCommitteeId,
    filterDueEnd,
    filterDueSoonOnly,
    filterDueStart,
    filterOverdueOnly,
    filterPriorities,
    filterQuery,
    filterStatuses,
    sortKey,
  ]);

  const createdHiddenByFilters = useMemo(() => {
    if (!createdTaskBanner) return false;
    const exists = tasks.some((task) => task.id === createdTaskBanner.id);
    if (!exists) return false;
    return !filteredTasks.some((task) => task.id === createdTaskBanner.id);
  }, [createdTaskBanner, filteredTasks, tasks]);

  function jumpToTask(taskId: string) {
    const index = filteredTasks.findIndex((task) => task.id === taskId);
    if (index < 0) {
      toast.error("That task is hidden by the current filters.");
      return;
    }
    const targetPage = Math.floor(index / taskPageSize) + 1;
    if (taskPage !== targetPage) {
      setTaskPage(targetPage);
    }

    let attempts = 0;
    const scrollAttempt = () => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el instanceof HTMLElement) {
          el.focus({ preventScroll: true });
        }
        return;
      }
      if (attempts < 6) {
        attempts += 1;
        window.requestAnimationFrame(scrollAttempt);
      }
    };

    window.requestAnimationFrame(scrollAttempt);
    setHighlightedTaskId(taskId);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedTaskId(null), 2000);
  }

  async function loadAssignees(committeeId: string) {
    if (!committeeId) return;
    if (assigneesByCommitteeId[committeeId]) return;

    const qs = new URLSearchParams({ committeeId });
    try {
      const { assignees } = await fetchJson<{ assignees: AssigneeRow[] }>(`/api/tasks/assignees?${qs.toString()}`);
      setAssigneesByCommitteeId((prev) => ({ ...prev, [committeeId]: assignees ?? [] }));
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to load assignees");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function reload() {
    const qs = projectIdFilter ? `?projectId=${encodeURIComponent(projectIdFilter)}` : "";
    try {
      const { tasks: t, committees: c } = await fetchJson<{ tasks: TaskRow[]; committees: CommitteeRow[] }>(
        `/api/tasks${qs}`,
      );
      setTasks(t);
      setCommittees(c);
      if (!newCommitteeId && c[0]?.id) setNewCommitteeId(c[0].id);
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to refresh tasks");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function loadTaskExtras(taskId: string) {
    const [commentsRes, attachmentsRes] = await Promise.all([
      fetchJson<{ comments: TaskCommentRow[] }>(`/api/tasks/${encodeURIComponent(taskId)}/comments`),
      fetchJson<{ attachments: TaskAttachmentRow[] }>(`/api/tasks/${encodeURIComponent(taskId)}/attachments`),
    ]);

    setCommentsByTaskId((prev) => ({ ...prev, [taskId]: commentsRes.comments }));
    setAttachmentsByTaskId((prev) => ({ ...prev, [taskId]: attachmentsRes.attachments }));
  }

  function applyTemplate(template: TaskTemplate) {
    const hasValues = newTitle.trim() || newDescription.trim();
    if (hasValues && !window.confirm("Replace the current title and description with the template?")) {
      return;
    }
    setNewTitle(template.title);
    setNewDescription(template.description);
    setNewPriority(template.priority);
    if (typeof template.dueOffsetDays === "number") {
      setNewDue(formatDateOnly(addDays(new Date(), template.dueOffsetDays)));
    }
    setCreateErrors((prev) => ({ ...prev, title: undefined }));
    setTemplateNote(`Template "${template.label}" applied.`);
  }

  function toggleStatusFilter(value: TaskRow["status"]) {
    setFilterStatuses((prev) => {
      const next = prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value];
      return next;
    });
    setTaskPage(1);
  }

  function togglePriorityFilter(value: TaskRow["priority"]) {
    setFilterPriorities((prev) => {
      const next = prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value];
      return next;
    });
    setTaskPage(1);
  }

  function resetFilters() {
    setFilterQuery("");
    setFilterStatuses([]);
    setFilterCommitteeId("");
    setFilterPriorities([]);
    setFilterAssignee("");
    setFilterOverdueOnly(false);
    setFilterDueSoonOnly(false);
    setFilterDueStart("");
    setFilterDueEnd("");
    setSortKey("updated");
    setTaskPage(1);
    setShowAdvancedFilters(false);
    setCopyPreview(null);
  }

  async function toggleExpanded(taskId: string, committeeId: string) {
    // Toggle off: if clicking the same task's Hide button, collapse it
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }

    // Toggle on: expand this task and collapse any other
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
        setStatus(formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to load"));
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
      toast.success("Comment posted");
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to post comment");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function deleteComment(taskId: string, commentId: string) {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
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
      toast.success("Comment deleted");
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to remove comment");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function createAttachment(taskId: string) {
    const url = (newAttachmentUrlByTaskId[taskId] ?? "").trim();
    const label = (newAttachmentLabelByTaskId[taskId] ?? "").trim();
    if (!url) return;
    if (!isValidHttpUrl(url)) {
      const msg = "Enter a valid http(s) URL.";
      setStatus(msg);
      toast.error(msg);
      return;
    }

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
      toast.success("Attachment added");
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to add link");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function deleteAttachment(taskId: string, attachmentId: string) {
    if (!window.confirm("Remove this attachment? This cannot be undone.")) return;
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
      toast.success("Attachment removed");
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to remove link");
      setStatus(msg);
      toast.error(msg);
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
    const nextErrors: { committee?: string; title?: string } = {};
    if (!newCommitteeId) nextErrors.committee = "Committee is required.";
    if (!newTitle.trim()) nextErrors.title = "Title is required.";
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus("Fix the highlighted fields to continue.");
      return;
    }
    if (newDue && isDateInPast(newDue)) {
      const proceed = window.confirm("The due date is in the past. Create the task anyway?");
      if (!proceed) return;
    }

    setStatus("Creating task...");
    try {
      const { task } = await fetchJson<{ task: TaskRow }>("/api/tasks", {
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
      setNewDue(formatDateOnly(addDays(new Date(), 7)));
      setTemplateId("");
      setTemplateNote("");
      setCreateErrors({});
      setCreatedTaskBanner({ id: task.id, title: task.title });
      setTaskPage(1);
      setStatus("");
      toast.success("Task created");
      await reload();
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to create task");
      setStatus(msg);
      toast.error(msg);
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
      const label =
        "status" in patch
          ? "Status updated"
          : "assignedTo" in patch
            ? "Assignee updated"
            : "priority" in patch
              ? "Priority updated"
              : "dueAt" in patch
                ? "Due date updated"
                : "description" in patch
                  ? "Description updated"
                  : "Task updated";
      toast.success(label);
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to save");
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function deleteTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const label = task?.title ? `"${task.title}"` : "this task";
    if (!window.confirm(`Delete ${label}? Comments and links will be removed and this cannot be undone.`)) return;
    setStatus("Deleting...");
    try {
      await fetchJson<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setStatus("");
      toast.success("Task deleted");
    } catch (err) {
      const msg = formatTaskErrorMessage(err instanceof Error ? err.message : "Failed to delete");
      setStatus(msg);
      toast.error(msg);
    }
  }

  function buildTasksCsv(list: TaskRow[]) {
    const headers = ["Title", "Status", "Priority", "Committee", "Due Date", "Assignee", "Description", "Updated At"];
    const rows = list.map((task) => [
      task.title,
      task.status,
      task.priority,
      committeesById.get(task.committee_id)?.name ?? task.committee_id,
      task.due_at ?? "",
      task.assigned_to ?? "",
      task.description ?? "",
      task.updated_at,
    ]);
    return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
  }

  function buildTaskCopyText(list: TaskRow[]) {
    return list
      .map((task) => {
        const due = task.due_at ? `Due ${formatDateInputValue(task.due_at)}` : "No due date";
        const committee = committeesById.get(task.committee_id)?.name ?? task.committee_id;
        return `${task.title} • ${formatTaskStatus(task.status)} • ${formatTaskPriority(task.priority)} • ${committee} • ${due}`;
      })
      .join("\n");
  }

  function buildTaskSummary(task: TaskRow) {
    const due = task.due_at ? `Due ${formatDateInputValue(task.due_at)}` : "No due date";
    const committee = committeesById.get(task.committee_id)?.name ?? task.committee_id;
    const assignee = task.assigned_to ? taskAssigneeLabel(task) : "Unassigned";
    const details = [
      task.title,
      `${committee} • ${formatTaskStatus(task.status)} • ${formatTaskPriority(task.priority)}`,
      `${assignee} • ${due}`,
    ];
    if (task.description) details.push(task.description);
    return details.join("\n");
  }

  async function handleCopyTaskList() {
    if (filteredTasks.length === 0) {
      toast.error("No tasks to copy");
      return;
    }
    const copyText = buildTaskCopyText(filteredTasks);
    const ok = await copyTextWithFallback(copyText, { promptLabel: "Copy task list" });
    if (ok) {
      setCopyPreview({ label: "Task list", text: copyText });
      toast.success("Task list copied");
    } else {
      toast.info("Clipboard blocked. Use the prompt to copy.");
    }
  }

  async function handleCopyTask(task: TaskRow) {
    const copyText = buildTaskSummary(task);
    const ok = await copyTextWithFallback(copyText, { promptLabel: "Copy task summary" });
    if (ok) {
      setCopyPreview({ label: `Task summary: ${task.title}`, text: copyText });
      toast.success("Task summary copied");
    } else {
      toast.info("Clipboard blocked. Use the prompt to copy.");
    }
  }

  async function handleCopyPreview() {
    if (!copyPreview) return;
    const ok = await copyTextWithFallback(copyPreview.text, { promptLabel: `Copy ${copyPreview.label}` });
    if (ok) {
      toast.success(`${copyPreview.label} copied`);
    } else {
      toast.info("Clipboard blocked. Use the prompt to copy.");
    }
  }

  function handleDownloadTasksCsv() {
    if (filteredTasks.length === 0) {
      toast.error("No tasks to export");
      return;
    }
    const csv = buildTasksCsv(filteredTasks);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Tasks CSV downloaded");
  }

  function clearPrefill() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewDue(formatDateOnly(addDays(new Date(), 7)));
    setNewAssigneeId(viewerUserId);
    if (committees[0]?.id) setNewCommitteeId(committees[0].id);
    setTemplateId("");
    setTemplateNote("");
    setPrefillDismissed(true);
  }

  return (
    <div className="space-y-8">
      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      {createdTaskBanner ? (
        <div className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">Task created</div>
              <div className="text-xs text-foreground/70">{createdTaskBanner.title}</div>
              {createdHiddenByFilters ? (
                <div className="mt-1 text-xs text-red-600">
                  This task is hidden by your current filters.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => jumpToTask(createdTaskBanner.id)}
              >
                <IconChevronDown className="h-3.5 w-3.5" />
                Jump to task
              </Button>
              {createdHiddenByFilters ? (
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  <IconFilter className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setCreatedTaskBanner(null)}>
                <IconX className="h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create task</h2>
          <p className="text-sm text-foreground/70">Committee-scoped. Your access is enforced by RLS.</p>
        </div>

        {prefillActive && !prefillDismissed ? (
          <div className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm">
            <div className="font-medium">Prefilled from {prefillSourceLabel}</div>
            <div className="mt-1 text-xs text-foreground/70">
              Review the fields below before creating the task.
            </div>
            {prefillMeetingUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={prefillMeetingUrl} className={prefillLinkClass}>
                  View meeting
                </Link>
                {prefillAgendaItemUrl ? (
                  <Link href={prefillAgendaItemUrl} className={prefillLinkClass}>
                    View agenda item
                  </Link>
                ) : null}
              </div>
            ) : null}
            {prefillCommitteeMissing ? (
              <div className="mt-1 text-xs text-red-600">
                Committee access missing for this prefill. Choose a committee you belong to.
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={clearPrefill}>
                <IconX className="h-3.5 w-3.5" />
                Clear prefill
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => document.getElementById("task-create-form")?.scrollIntoView({ behavior: "smooth" })}
              >
                <IconChevronDown className="h-3.5 w-3.5" />
                Jump to form
              </Button>
            </div>
          </div>
        ) : null}

        {committees.length === 0 ? (
          <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">No committee memberships found.</div>
        ) : (
          <form id="task-create-form" className="grid gap-3 md:grid-cols-5" onSubmit={onCreateTask}>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="flex items-center gap-1 text-foreground/70">
                Committee <span className="text-red-500">*</span>
              </div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newCommitteeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const next = e.target.value;
                  setNewCommitteeId(next);
                  setNewAssigneeId(viewerUserId);
                  setCreateErrors((prev) => ({ ...prev, committee: undefined }));
                  void loadAssignees(next);
                }}
                aria-invalid={!!createErrors.committee}
              >
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {createErrors.committee ? (
                <div className="text-xs text-red-600">{createErrors.committee}</div>
              ) : null}
            </label>

            <label className="space-y-1 text-sm md:col-span-3">
              <div className="text-foreground/70">Template (optional)</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={templateId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const nextId = e.target.value;
                  setTemplateId(nextId);
                  setTemplateNote("");
                  const template = TASK_TEMPLATES.find((item) => item.id === nextId);
                  if (template) applyTemplate(template);
                }}
              >
                <option value="">Choose a template</option>
                {TASK_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
              {templateNote ? <div className="text-xs text-foreground/60">{templateNote}</div> : null}
            </label>

            <label className="space-y-1 text-sm md:col-span-5">
              <div className="flex items-center gap-1 text-foreground/70">
                Title <span className="text-red-500">*</span>
              </div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setNewTitle(e.target.value);
                  setCreateErrors((prev) => ({ ...prev, title: undefined }));
                  setTemplateNote("");
                }}
                placeholder="e.g., Draft agenda for next meeting"
                aria-invalid={!!createErrors.title}
              />
              {createErrors.title ? (
                <div className="text-xs text-red-600">{createErrors.title}</div>
              ) : null}
            </label>

            <label className="space-y-1 text-sm md:col-span-5">
              <div className="text-foreground/70">Description</div>
              <textarea
                className="min-h-20 w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                value={newDescription}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setNewDescription(e.target.value);
                  setTemplateNote("");
                }}
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

            <label className="space-y-1 text-sm md:col-span-1">
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

            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Due date</div>
              <input
                type="date"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={newDue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDue(e.target.value)}
              />
              {dueWarning ? <div className="text-xs text-amber-600">{dueWarning}</div> : null}
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span className="text-foreground/50">Quick set</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNewDue(formatDateOnly(new Date()))}>
                  Today
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewDue(formatDateOnly(addDays(new Date(), 1)))}
                >
                  Tomorrow
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewDue(formatDateOnly(addDays(new Date(), 7)))}
                >
                  +7 days
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewDue(formatDateOnly(addDays(new Date(), 14)))}
                >
                  +14 days
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewDue(formatDateOnly(addDays(new Date(), 30)))}
                >
                  +30 days
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNewDue("")} disabled={!newDue}>
                  Clear
                </Button>
              </div>
            </label>

            <div className="flex items-end md:col-span-5">
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs text-foreground/60">* Required fields</span>
                <Button type="submit" disabled={!newTitle.trim() || !newCommitteeId}>
                  <IconPlus className="h-3.5 w-3.5" />
                  Create task
                </Button>
              </div>
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
          <div className="grid gap-3 md:grid-cols-7">
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Search</div>
              <div className="flex items-center gap-2">
                <div className="relative w-full">
                  <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                  <input
                    type="search"
                    className="h-9 w-full rounded-md border bg-transparent px-8 text-sm"
                    value={filterQuery}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setFilterQuery(e.target.value);
                      setTaskPage(1);
                    }}
                    placeholder="Title, description, committee…"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterQuery("");
                    setTaskPage(1);
                  }}
                  disabled={!filterQuery.trim()}
                >
                  <IconX className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Status</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={
                  filterStatuses.length === 1
                    ? filterStatuses[0]
                    : filterStatuses.length > 1
                      ? "multiple"
                      : ""
                }
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const next = e.target.value as TaskRow["status"] | "";
                  setFilterStatuses(next ? [next] : []);
                  setTaskPage(1);
                }}
              >
                <option value="">All</option>
                <option value="multiple" disabled>
                  Multiple selected
                </option>
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
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setFilterCommitteeId(e.target.value);
                  setTaskPage(1);
                }}
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
              <div className="text-foreground/70">Priority</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={
                  filterPriorities.length === 1
                    ? filterPriorities[0]
                    : filterPriorities.length > 1
                      ? "multiple"
                      : ""
                }
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const next = e.target.value as TaskRow["priority"] | "";
                  setFilterPriorities(next ? [next] : []);
                  setTaskPage(1);
                }}
              >
                <option value="">All</option>
                <option value="multiple" disabled>
                  Multiple selected
                </option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Assignee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterAssignee}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setFilterAssignee(e.target.value as typeof filterAssignee);
                  setTaskPage(1);
                }}
              >
                <option value="">All</option>
                <option value="me">Assigned to me</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Sort by</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={sortKey}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setSortKey(e.target.value as typeof sortKey);
                  setTaskPage(1);
                }}
              >
                <option value="updated">Recently updated</option>
                <option value="due">Due date</option>
                <option value="title">Title</option>
                <option value="priority">Priority</option>
              </select>
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <Button variant="ghost" size="sm" onClick={() => setShowAdvancedFilters((prev) => !prev)}>
              {showAdvanced ? "Hide advanced filters" : "Advanced filters"}
            </Button>
            {advancedFiltersActive && !showAdvancedFilters ? (
              <span className="text-foreground/50">Advanced filters are active.</span>
            ) : null}
          </div>

          {showAdvanced ? (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Due start</div>
                  <input
                    type="date"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={filterDueStart}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setFilterDueStart(e.target.value);
                      setTaskPage(1);
                    }}
                    aria-invalid={!!dueRangeError}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Due end</div>
                  <input
                    type="date"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={filterDueEnd}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setFilterDueEnd(e.target.value);
                      setTaskPage(1);
                    }}
                    aria-invalid={!!dueRangeError}
                  />
                </label>
                <div className="flex items-end text-xs text-foreground/60">
                  Filter tasks due within a date range (optional).
                </div>
              </div>
              {dueRangeError ? <div className="mt-1 text-xs text-red-600">{dueRangeError}</div> : null}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span className="text-foreground/50">Status</span>
                {statusOptions.map((statusOption) => (
                  <Button
                    key={statusOption}
                    variant={filterStatuses.includes(statusOption) ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={filterStatuses.includes(statusOption)}
                    onClick={() => toggleStatusFilter(statusOption)}
                  >
                    {formatTaskStatus(statusOption)}
                  </Button>
                ))}
                <span className="text-foreground/50">Priority</span>
                {priorityOptions.map((priorityOption) => (
                  <Button
                    key={priorityOption}
                    variant={filterPriorities.includes(priorityOption) ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={filterPriorities.includes(priorityOption)}
                    onClick={() => togglePriorityFilter(priorityOption)}
                  >
                    {formatTaskPriority(priorityOption)}
                  </Button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing {paginatedTasks.length} of {filteredTasks.length} filtered ({tasks.length} total)
              </span>
              <span>{overdueCount > 0 ? `${overdueCount} overdue` : "No overdue tasks"}</span>
              <span>{dueSoonCount > 0 ? `${dueSoonCount} due soon` : "No due soon tasks"}</span>
              <span>
                To do {statusCounts.todo} • Doing {statusCounts.doing} • Done {statusCounts.done}
              </span>
              <span className="flex items-center gap-2">
                <span>{donePercent}% done</span>
                <span
                  className="h-1 w-20 rounded bg-foreground/10"
                  role="progressbar"
                  aria-label="Task completion"
                  aria-valuenow={donePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span
                    className="block h-1 rounded bg-primary"
                    style={{ width: `${donePercent}%` }}
                  />
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-foreground/50">Quick filters</span>
                <Button
                  variant={filterOverdueOnly ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={filterOverdueOnly}
                  onClick={() => {
                    setFilterOverdueOnly((prev) => {
                      const next = !prev;
                      if (next) setFilterDueSoonOnly(false);
                      return next;
                    });
                    setTaskPage(1);
                  }}
                >
                  <IconAlert className="h-3.5 w-3.5" />
                  Overdue ({overdueCount})
                </Button>
                <Button
                  variant={filterDueSoonOnly ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={filterDueSoonOnly}
                  onClick={() => {
                    setFilterDueSoonOnly((prev) => {
                      const next = !prev;
                      if (next) setFilterOverdueOnly(false);
                      return next;
                    });
                    setTaskPage(1);
                  }}
                >
                  <IconClock className="h-3.5 w-3.5" />
                  Due soon ({dueSoonCount})
                </Button>
                <Button
                  variant={filterAssignee === "me" ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={filterAssignee === "me"}
                  onClick={() => {
                    setFilterAssignee((prev) => (prev === "me" ? "" : "me"));
                    setTaskPage(1);
                  }}
                >
                  Assigned to me ({assignedToMeCount})
                </Button>
                <Button
                  variant={filterPriorities.includes("high") ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={filterPriorities.includes("high")}
                  onClick={() => {
                    setFilterPriorities((prev) =>
                      prev.includes("high") ? prev.filter((value) => value !== "high") : [...prev, "high"],
                    );
                    setTaskPage(1);
                  }}
                >
                  High priority ({highPriorityCount})
                </Button>
                <Button
                  variant={filterAssignee === "unassigned" ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={filterAssignee === "unassigned"}
                  onClick={() => {
                    setFilterAssignee((prev) => (prev === "unassigned" ? "" : "unassigned"));
                    setTaskPage(1);
                  }}
                >
                  Unassigned ({unassignedCount})
                </Button>
              </div>
              <label className="flex items-center gap-2">
                <span>Rows</span>
                <select
                  className="h-8 rounded-md border bg-transparent px-2 text-xs"
                  value={taskPageSize}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setTaskPageSize(Number(e.target.value));
                    setTaskPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <span>
                Page {resolvedTaskPage} of {pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTaskPage(Math.max(1, resolvedTaskPage - 1))}
                disabled={resolvedTaskPage <= 1}
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTaskPage(Math.min(pageCount, resolvedTaskPage + 1))}
                disabled={resolvedTaskPage >= pageCount}
              >
                Next
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void reload()}>
                <IconRefresh className="h-3.5 w-3.5" />
                Refresh list
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleCopyTaskList()}>
                <IconCopy className="h-3.5 w-3.5" />
                Copy list
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownloadTasksCsv}>
                <IconDownload className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              {expandedTaskId ? (
                <Button variant="ghost" size="sm" onClick={() => setExpandedTaskId(null)}>
                  <IconChevronUp className="h-3.5 w-3.5" />
                  Collapse details
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={!taskFiltersActive}
              >
                <IconFilter className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            </div>
          </div>
          {copyPreview ? (
            <details className="mt-3 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground/70">
                Preview: {copyPreview.label}
              </summary>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
                <span>Need to copy again?</span>
                <Button variant="ghost" size="sm" onClick={handleCopyPreview}>
                  <IconCopy className="h-3.5 w-3.5" />
                  Copy to clipboard
                </Button>
              </div>
              <pre className="mt-2 max-h-48 whitespace-pre-wrap text-xs text-foreground/70">
                {copyPreview.text}
              </pre>
            </details>
          ) : null}
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <span className="text-foreground/50">Active filters</span>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onClear}
                className="inline-flex items-center gap-1 rounded bg-foreground/5 px-2 py-0.5 text-foreground/70 hover:bg-foreground/10"
              >
                <span>{chip.label}</span>
                <IconX className="h-3 w-3" />
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Clear all
            </Button>
          </div>
        ) : null}

        <div className="rounded-md border">
          <div className="divide-y">
            {filteredTasks.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">
                {tasks.length === 0 ? "No tasks yet." : "No tasks match the current filters."}
                {tasks.length > 0 ? (
                  <div className="mt-2">
                    <Button size="sm" variant="ghost" onClick={resetFilters}>
                      <IconFilter className="h-3.5 w-3.5" />
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => document.getElementById("task-create-form")?.scrollIntoView({ behavior: "smooth" })}
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                      Create your first task
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              paginatedTasks.map((t) => {
                const committee = committeesById.get(t.committee_id);
                const isExpanded = expandedTaskId === t.id;
                const comments = commentsByTaskId[t.id] ?? [];
                const attachments = attachmentsByTaskId[t.id] ?? [];
                const overdue = isTaskOverdue(t);
                const dueSoon = !overdue && isTaskDueSoon(t);
                const attachmentUrl = newAttachmentUrlByTaskId[t.id] ?? "";
                const attachmentUrlValid = !attachmentUrl.trim() || isValidHttpUrl(attachmentUrl);
                return (
                  <div
                    key={t.id}
                    id={`task-${t.id}`}
                    tabIndex={-1}
                    className={`px-3 py-2 outline-none ${
                      highlightedTaskId === t.id ? "rounded bg-foreground/5 ring-1 ring-primary/30" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm font-medium ${
                            t.status === "done" ? "text-foreground/60 line-through" : ""
                          }`}
                        >
                          {t.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                          <span>{committee ? committee.name : t.committee_id}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${statusBadgeClass(t.status)}`}>
                            {formatTaskStatus(t.status)}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${priorityBadgeClass(t.priority)}`}>
                            {formatTaskPriority(t.priority)}
                          </span>
                          {t.due_at ? <span>Due {formatDateInputValue(t.due_at)}</span> : null}
                          <span>{t.assigned_to ? taskAssigneeLabel(t) : "Unassigned"}</span>
                          {t.assigned_to === viewerUserId ? (
                            <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[11px]">Mine</span>
                          ) : null}
                          <span>Updated {formatDateInputValue(t.updated_at)}</span>
                          {overdue ? (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-600"
                              title={`Overdue since ${formatDateInputValue(t.due_at)}`}
                            >
                              <IconAlert className="h-3 w-3" />
                              Overdue
                            </span>
                          ) : null}
                          {dueSoon ? (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] text-yellow-700"
                              title={`Due soon: ${formatDateInputValue(t.due_at)}`}
                            >
                              <IconClock className="h-3 w-3" />
                              Due soon
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleExpanded(t.id, t.committee_id);
                          }}
                          aria-expanded={isExpanded}
                          aria-controls={`task-details-${t.id}`}
                          title={isExpanded ? "Hide task details" : "Show task details"}
                        >
                          {isExpanded ? (
                            <>
                              <IconChevronUp className="h-3.5 w-3.5" />
                              Hide
                            </>
                          ) : (
                            <>
                              <IconChevronDown className="h-3.5 w-3.5" />
                              Details
                            </>
                          )}
                        </Button>

                        <select
                          className="h-9 rounded-md border bg-transparent px-2 text-sm"
                          value={t.status}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            void updateTask(t.id, { status: e.target.value })
                          }
                          aria-label="Update status"
                        >
                          <option value="todo">To do</option>
                          <option value="doing">Doing</option>
                          <option value="done">Done</option>
                        </select>

                        {t.status !== "done" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void updateTask(t.id, { status: "done" })}
                            title="Mark this task as done."
                          >
                            <IconCheck className="h-3.5 w-3.5" />
                            Mark done
                          </Button>
                        ) : null}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteTask(t.id)}
                          title="Delete this task and remove comments and links."
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div
                        id={`task-details-${t.id}`}
                        className="mt-3 grid gap-3 rounded-md border bg-transparent p-3 md:grid-cols-2"
                      >
                        <div className="space-y-2 md:col-span-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">Task details</div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleCopyTask(t)}
                              title="Copy the task summary to your clipboard."
                            >
                              <IconCopy className="h-3.5 w-3.5" />
                              Copy summary
                            </Button>
                          </div>
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
                              {t.assigned_to !== viewerUserId ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void updateTask(t.id, { assignedTo: viewerUserId })}
                                >
                                  <IconCheck className="h-3.5 w-3.5" />
                                  Assign to me
                                </Button>
                              ) : null}
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
                                      <IconTrash className="h-3.5 w-3.5" />
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
                              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if ((newCommentByTaskId[t.id] ?? "").trim()) {
                                    void createComment(t.id);
                                  }
                                }
                              }}
                              placeholder="Add a comment"
                            />
                            <Button
                              variant="ghost"
                              onClick={() => void createComment(t.id)}
                              disabled={!(newCommentByTaskId[t.id] ?? "").trim()}
                            >
                              <IconPlus className="h-3.5 w-3.5" />
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
                                    <IconTrash className="h-3.5 w-3.5" />
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-2">
                            <input
                              type="url"
                              inputMode="url"
                              autoCapitalize="none"
                              autoCorrect="off"
                              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                              value={attachmentUrl}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setNewAttachmentUrlByTaskId((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (attachmentUrlValid && attachmentUrl.trim()) {
                                    void createAttachment(t.id);
                                  }
                                }
                              }}
                              placeholder="https://..."
                              aria-invalid={!attachmentUrlValid}
                            />
                            {!attachmentUrlValid ? (
                              <div className="text-xs text-red-600">Enter a valid http(s) URL.</div>
                            ) : null}
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
                                disabled={!attachmentUrl.trim() || !attachmentUrlValid}
                              >
                                <IconPlus className="h-3.5 w-3.5" />
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
