"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { IconAlert, IconCalendar, IconCheck, IconChevronRight, IconLink } from "@/components/ui/icons";
import { copyTextWithFallback } from "@/lib/clipboard";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Meeting = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
  remote_url?: string | null;
  livestream_url?: string | null;
  public_comment_instructions?: string | null;
  notice_posted_at?: string | null;
  agenda_posted_at?: string | null;
  minutes_posted_at?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function formatMeetingType(type: string): string {
  switch (type) {
    case "board":
      return "Board";
    case "committee":
      return "Committee";
    case "icc":
      return "ICC";
    case "special":
      return "Special";
    default:
      return type;
  }
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "scheduled":
      return { label: "Scheduled", className: "bg-green-100 text-green-700" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-red-100 text-red-700" };
    case "completed":
      return { label: "Completed", className: "bg-gray-200 text-gray-700" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-700" };
  }
}

function formatDuration(startIso: string, endIso: string): string | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const totalMinutes = Math.round((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatRelativeTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round(ms / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
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

function isStartingSoon(iso: string, windowMinutes = 120): boolean {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return false;
  const diffMinutes = Math.round((start - Date.now()) / 60000);
  return diffMinutes >= 0 && diffMinutes <= windowMinutes;
}

function complianceBadgeClass(posted: boolean): string {
  return posted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
}

function ComplianceBadge({ label, posted }: { label: string; posted: boolean }) {
  const statusLabel = posted ? "posted" : "missing";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${complianceBadgeClass(posted)}`}
      title={`${label} ${statusLabel}`}
      aria-label={`${label} ${statusLabel}`}
    >
      {posted ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
      <span>{label}</span>
      <span className="text-[10px] uppercase tracking-wide">{statusLabel}</span>
    </span>
  );
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatIcsDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function buildIcs(meeting: Meeting): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ASGC//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${meeting.id}@asgc.app`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(meeting.starts_at)}`,
    `DTEND:${formatIcsDate(meeting.ends_at)}`,
    `SUMMARY:${escapeIcsText(meeting.title)}`,
  ];

  if (meeting.location) {
    lines.push(`LOCATION:${escapeIcsText(meeting.location)}`);
  }

  const descriptionParts: string[] = [];
  if (meeting.description) descriptionParts.push(meeting.description);
  if (meeting.remote_url) descriptionParts.push(`Remote: ${meeting.remote_url}`);
  if (meeting.livestream_url) descriptionParts.push(`Livestream: ${meeting.livestream_url}`);

  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export default function MeetingsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officeTz, setOfficeTz] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [meetingTypeFilter, setMeetingTypeFilter] = useState("all");
  const [meetingStatusFilter, setMeetingStatusFilter] = useState("all");
  const [meetingScopeFilter, setMeetingScopeFilter] = useState<"all" | "committee" | "general">("all");
  const [meetingSort, setMeetingSort] = useState<"upcoming" | "recent" | "title">("upcoming");
  const [meetingStartDateFilter, setMeetingStartDateFilter] = useState("");
  const [meetingEndDateFilter, setMeetingEndDateFilter] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterRemoteOnly, setFilterRemoteOnly] = useState(false);
  const [filterLivestreamOnly, setFilterLivestreamOnly] = useState(false);
  const [filterCommentOnly, setFilterCommentOnly] = useState(false);
  const [filterNoticePosted, setFilterNoticePosted] = useState(false);
  const [filterAgendaPosted, setFilterAgendaPosted] = useState(false);
  const [filterMinutesPosted, setFilterMinutesPosted] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [actionStatus, setActionStatus] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  const formatInOfficeTz = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (!officeTz) return d.toLocaleString();

      return new Intl.DateTimeFormat(undefined, {
        timeZone: officeTz,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(d);
    },
    [officeTz],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data: tzData, error: tzErr } = await supabase.rpc("office_timezone");
      if (!cancelled && !tzErr && typeof tzData === "string" && tzData.length > 0) {
        setOfficeTz(tzData);
      }

      const res = await fetch(showPast ? "/api/meetings?includePast=1" : "/api/meetings");
      if (cancelled) return;

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Failed to load meetings");
        setLoading(false);
        return;
      }

      const json = (await res.json().catch(() => null)) as { meetings?: Meeting[] } | null;
      setMeetings((json?.meetings ?? []) as Meeting[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [showPast, supabase, reloadKey]);

  const filteredMeetings = useMemo(() => {
    const query = meetingSearch.trim().toLowerCase();
    const startFilterTs = meetingStartDateFilter
      ? new Date(`${meetingStartDateFilter}T00:00:00`).getTime()
      : null;
    const endFilterTs = meetingEndDateFilter
      ? new Date(`${meetingEndDateFilter}T23:59:59`).getTime()
      : null;
    const filtered = meetings.filter((meeting) => {
      if (meetingTypeFilter !== "all" && meeting.meeting_type !== meetingTypeFilter) return false;
      if (meetingStatusFilter !== "all" && meeting.status !== meetingStatusFilter) return false;
      if (meetingScopeFilter === "committee" && !meeting.committee_id) return false;
      if (meetingScopeFilter === "general" && meeting.committee_id) return false;
      if (startFilterTs || endFilterTs) {
        const meetingStart = new Date(meeting.starts_at).getTime();
        if (Number.isNaN(meetingStart)) return false;
        if (startFilterTs && !Number.isNaN(startFilterTs) && meetingStart < startFilterTs) return false;
        if (endFilterTs && !Number.isNaN(endFilterTs) && meetingStart > endFilterTs) return false;
      }
      if (filterRemoteOnly && !meeting.remote_url) return false;
      if (filterLivestreamOnly && !meeting.livestream_url) return false;
      if (filterCommentOnly && !meeting.public_comment_instructions) return false;
      if (filterNoticePosted && !meeting.notice_posted_at) return false;
      if (filterAgendaPosted && !meeting.agenda_posted_at) return false;
      if (filterMinutesPosted && !meeting.minutes_posted_at) return false;
      if (!query) return true;
      const haystack = [
        meeting.title,
        meeting.description ?? "",
        meeting.location ?? "",
        meeting.meeting_type,
        meeting.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    const sorted = [...filtered].sort((a, b) => {
      const aTime = new Date(a.starts_at).getTime();
      const bTime = new Date(b.starts_at).getTime();
      if (meetingSort === "title") return a.title.localeCompare(b.title);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return meetingSort === "upcoming" ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [
    filterAgendaPosted,
    filterCommentOnly,
    filterLivestreamOnly,
    filterMinutesPosted,
    filterNoticePosted,
    filterRemoteOnly,
    meetingScopeFilter,
    meetingSearch,
    meetingSort,
    meetingStartDateFilter,
    meetingStatusFilter,
    meetingEndDateFilter,
    meetingTypeFilter,
    meetings,
  ]);

  const statusCounts = useMemo(() => {
    const counts = { scheduled: 0, cancelled: 0, completed: 0 };
    for (const meeting of meetings) {
      if (meeting.status === "scheduled") counts.scheduled += 1;
      else if (meeting.status === "cancelled") counts.cancelled += 1;
      else if (meeting.status === "completed") counts.completed += 1;
    }
    return counts;
  }, [meetings]);

  const filteredStatusCounts = useMemo(() => {
    const counts = { scheduled: 0, cancelled: 0, completed: 0 };
    for (const meeting of filteredMeetings) {
      if (meeting.status === "scheduled") counts.scheduled += 1;
      else if (meeting.status === "cancelled") counts.cancelled += 1;
      else if (meeting.status === "completed") counts.completed += 1;
    }
    return counts;
  }, [filteredMeetings]);

  const pageCount = Math.max(1, Math.ceil(filteredMeetings.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const paginatedMeetings = useMemo(() => {
    const start = (resolvedPage - 1) * pageSize;
    return filteredMeetings.slice(start, start + pageSize);
  }, [filteredMeetings, pageSize, resolvedPage]);

  const meetingFiltersActive =
    meetingSearch.trim().length > 0 ||
    meetingTypeFilter !== "all" ||
    meetingStatusFilter !== "all" ||
    meetingScopeFilter !== "all" ||
    meetingSort !== "upcoming" ||
    meetingStartDateFilter.trim().length > 0 ||
    meetingEndDateFilter.trim().length > 0 ||
    filterRemoteOnly ||
    filterLivestreamOnly ||
    filterCommentOnly ||
    filterNoticePosted ||
    filterAgendaPosted ||
    filterMinutesPosted;

  const meetingDateRangeError =
    meetingStartDateFilter && meetingEndDateFilter && meetingStartDateFilter > meetingEndDateFilter
      ? "Start date is after end date."
      : "";

  const meetingActiveFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const query = meetingSearch.trim();
    if (query) labels.push(`Search: "${query}"`);
    if (meetingTypeFilter !== "all") labels.push(`Type: ${meetingTypeFilter}`);
    if (meetingStatusFilter !== "all") labels.push(`Status: ${meetingStatusFilter}`);
    if (meetingScopeFilter !== "all") labels.push(`Scope: ${meetingScopeFilter}`);
    if (meetingSort !== "upcoming") labels.push(`Sort: ${meetingSort}`);
    if (meetingStartDateFilter || meetingEndDateFilter) {
      labels.push(`Date: ${meetingStartDateFilter || "any"} → ${meetingEndDateFilter || "any"}`);
    }
    if (filterRemoteOnly) labels.push("Remote only");
    if (filterLivestreamOnly) labels.push("Livestream only");
    if (filterCommentOnly) labels.push("Public comments");
    if (filterNoticePosted) labels.push("Notice posted");
    if (filterAgendaPosted) labels.push("Agenda posted");
    if (filterMinutesPosted) labels.push("Minutes posted");
    return labels;
  }, [
    filterAgendaPosted,
    filterCommentOnly,
    filterLivestreamOnly,
    filterMinutesPosted,
    filterNoticePosted,
    filterRemoteOnly,
    meetingEndDateFilter,
    meetingScopeFilter,
    meetingSearch,
    meetingSort,
    meetingStartDateFilter,
    meetingStatusFilter,
    meetingTypeFilter,
  ]);

  function applyMeetingDatePreset(preset: "today" | "next7" | "next30" | "past30") {
    const today = new Date();
    if (preset === "today") {
      const value = formatDateOnly(today);
      setMeetingStartDateFilter(value);
      setMeetingEndDateFilter(value);
      setPage(1);
      return;
    }
    if (preset === "next7") {
      const start = formatDateOnly(today);
      const end = formatDateOnly(addDays(today, 7));
      setMeetingStartDateFilter(start);
      setMeetingEndDateFilter(end);
      setPage(1);
      return;
    }
    if (preset === "next30") {
      const start = formatDateOnly(today);
      const end = formatDateOnly(addDays(today, 30));
      setMeetingStartDateFilter(start);
      setMeetingEndDateFilter(end);
      setPage(1);
      return;
    }
    const start = formatDateOnly(addDays(today, -30));
    const end = formatDateOnly(today);
    setMeetingStartDateFilter(start);
    setMeetingEndDateFilter(end);
    setPage(1);
  }

  function resetMeetingFilters() {
    setMeetingSearch("");
    setMeetingTypeFilter("all");
    setMeetingStatusFilter("all");
    setMeetingScopeFilter("all");
    setMeetingSort("upcoming");
    setMeetingStartDateFilter("");
    setMeetingEndDateFilter("");
    setFilterRemoteOnly(false);
    setFilterLivestreamOnly(false);
    setFilterCommentOnly(false);
    setFilterNoticePosted(false);
    setFilterAgendaPosted(false);
    setFilterMinutesPosted(false);
    setPage(1);
  }

  async function handleCopyMeetingLink(meeting: Meeting) {
    const url = new URL(`/meetings/${meeting.id}`, window.location.origin).toString();
    const ok = await copyTextWithFallback(url, { promptLabel: "Copy meeting link" });
    setActionStatus(ok ? "Meeting link copied." : "Clipboard blocked. Use the prompt to copy the link.");
  }

  function handleDownloadCalendar(meeting: Meeting) {
    const ics = buildIcs(meeting);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "meeting"}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setActionStatus("Calendar file downloaded.");
  }

  function handleSubscribeCalendar() {
    const url = new URL("/api/meetings/calendar", window.location.origin).toString();
    const webcalUrl = url.replace(/^https?:/, "webcal:");
    window.open(webcalUrl, "_blank", "noopener");
    setActionStatus("Calendar feed opened.");
  }

  return (
    <PageShell title="Meetings" description="Browse upcoming and past meetings.">
      <div className="space-y-6">
        {error ? (
          <div className="text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : null}
        {actionStatus ? (
          <div className="text-sm text-foreground/70" role="status" aria-live="polite">
            {actionStatus}
          </div>
        ) : null}

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Browse meetings</div>
              <div className="text-xs text-foreground/60">
                Times shown in {officeTz ?? "your local time"}.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-foreground/10 p-1">
                <Button
                  variant={!showPast ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setShowPast(false);
                    setPage(1);
                  }}
                >
                  Upcoming
                </Button>
                <Button
                  variant={showPast ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setShowPast(true);
                    setPage(1);
                  }}
                >
                  Past
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={handleSubscribeCalendar}>
                <IconCalendar className="h-3.5 w-3.5" />
                Subscribe to calendar feed
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <label className="space-y-1 text-xs text-foreground/70 xl:col-span-2">
              <span>Search</span>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                  value={meetingSearch}
                  onChange={(event) => {
                    setMeetingSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Title, location, type..."
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMeetingSearch("")}
                  disabled={!meetingSearch.trim()}
                >
                  Clear
                </Button>
              </div>
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>Type</span>
              <select
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingTypeFilter}
                onChange={(event) => {
                  setMeetingTypeFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All types</option>
                <option value="board">Board</option>
                <option value="committee">Committee</option>
                <option value="icc">ICC</option>
                <option value="special">Special</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>Status</span>
              <select
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingStatusFilter}
                onChange={(event) => {
                  setMeetingStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>Scope</span>
              <select
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingScopeFilter}
                onChange={(event) => {
                  setMeetingScopeFilter(event.target.value as "all" | "committee" | "general");
                  setPage(1);
                }}
              >
                <option value="all">All meetings</option>
                <option value="committee">Committee only</option>
                <option value="general">General only</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>Sort</span>
              <select
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingSort}
                onChange={(event) => {
                  setMeetingSort(event.target.value as "upcoming" | "recent" | "title");
                  setPage(1);
                }}
              >
                <option value="upcoming">Upcoming</option>
                <option value="recent">Most recent</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>Start date</span>
              <input
                type="date"
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingStartDateFilter}
                onChange={(event) => {
                  setMeetingStartDateFilter(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="space-y-1 text-xs text-foreground/70">
              <span>End date</span>
              <input
                type="date"
                className="h-9 w-full rounded border border-foreground/20 bg-background px-2 text-sm text-foreground"
                value={meetingEndDateFilter}
                onChange={(event) => {
                  setMeetingEndDateFilter(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/60">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing {paginatedMeetings.length} of {filteredMeetings.length} filtered ({meetings.length} total)
              </span>
              <span>Scheduled {filteredStatusCounts.scheduled}</span>
              <span>Completed {filteredStatusCounts.completed}</span>
              <span>Cancelled {filteredStatusCounts.cancelled}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-foreground/50">Quick range</span>
                <Button variant="ghost" size="sm" onClick={() => applyMeetingDatePreset("today")}>
                  Today
                </Button>
                <Button variant="ghost" size="sm" onClick={() => applyMeetingDatePreset("next7")}>
                  Next 7 days
                </Button>
                <Button variant="ghost" size="sm" onClick={() => applyMeetingDatePreset("next30")}>
                  Next 30 days
                </Button>
                <Button variant="ghost" size="sm" onClick={() => applyMeetingDatePreset("past30")}>
                  Past 30 days
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters((prev) => !prev)}
              >
                {showAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReloadKey((prev) => prev + 1)}
                disabled={loading}
              >
                Refresh list
              </Button>
              <Button variant="ghost" size="sm" onClick={resetMeetingFilters} disabled={!meetingFiltersActive}>
                Reset filters
              </Button>
            </div>
          </div>
          {meetingDateRangeError ? (
            <div className="mt-2 text-xs text-red-600">{meetingDateRangeError}</div>
          ) : null}
          {meetingActiveFilterLabels.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span>Active filters</span>
              {meetingActiveFilterLabels.map((label) => (
                <span key={label} className="rounded bg-foreground/5 px-2 py-0.5 text-foreground/70">
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {showAdvancedFilters ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6 text-xs text-foreground/70">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterRemoteOnly}
                  onChange={(event) => {
                    setFilterRemoteOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Remote only</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterLivestreamOnly}
                  onChange={(event) => {
                    setFilterLivestreamOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Livestream only</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterCommentOnly}
                  onChange={(event) => {
                    setFilterCommentOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Public comments</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterNoticePosted}
                  onChange={(event) => {
                    setFilterNoticePosted(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Notice posted</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterAgendaPosted}
                  onChange={(event) => {
                    setFilterAgendaPosted(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Agenda posted</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filterMinutesPosted}
                  onChange={(event) => {
                    setFilterMinutesPosted(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Minutes posted</span>
              </label>
            </div>
          ) : null}

          {meetingStatusFilter !== "all" && meetingStatusFilter !== "scheduled" && !showPast ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span>Showing upcoming meetings only. Switch to the Past tab for completed or cancelled meetings.</span>
              <Button variant="outline" size="sm" onClick={() => setShowPast(true)}>
                Past meetings
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/60">
          <div className="flex flex-wrap items-center gap-3">
            <span>Total scheduled {statusCounts.scheduled}</span>
            <span>Total completed {statusCounts.completed}</span>
            <span>Total cancelled {statusCounts.cancelled}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-foreground/10 p-1">
              <Button
                variant={layout === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLayout("grid")}
              >
                Grid
              </Button>
              <Button
                variant={layout === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLayout("list")}
              >
                List
              </Button>
            </div>
            <label className="flex items-center gap-2">
              <span>Rows</span>
              <select
                className="h-8 rounded border border-foreground/20 bg-background px-2 text-xs"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={6}>6</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
              </select>
            </label>
            <span>
              Page {resolvedPage} of {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.max(1, resolvedPage - 1))}
              disabled={resolvedPage <= 1}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.min(pageCount, resolvedPage + 1))}
              disabled={resolvedPage >= pageCount}
            >
              Next
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-foreground/70">Loading…</div>
        ) : meetings.length === 0 ? (
          <div className="text-sm text-foreground/70">
            {showPast ? "No meetings found." : "No upcoming meetings."}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-sm text-foreground/70">
            No meetings match the current filters.
          </div>
        ) : (
          <div className={layout === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
            {paginatedMeetings.map((m) => {
              const badge = statusBadge(m.status);
              const duration = formatDuration(m.starts_at, m.ends_at);
              const relative = formatRelativeTime(m.starts_at);
              const isCommittee = Boolean(m.committee_id);
              const startingSoon = !showPast && m.status === "scheduled" && isStartingSoon(m.starts_at);
              const noticePosted = !!m.notice_posted_at;
              const agendaPosted = !!m.agenda_posted_at;
              const minutesPosted = !!m.minutes_posted_at;
              const complianceSegments = [
                { label: "Notice", posted: noticePosted },
                { label: "Agenda", posted: agendaPosted },
                { label: "Minutes", posted: minutesPosted },
              ];
              return (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="group rounded-xl border border-foreground/10 bg-background p-4 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                  aria-label={`Open meeting details for ${m.title}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                      <span className="rounded bg-foreground/5 px-2 py-0.5">{formatMeetingType(m.meeting_type)}</span>
                      <span className="rounded bg-foreground/5 px-2 py-0.5">
                        {isCommittee ? "Committee" : "General"}
                      </span>
                      {startingSoon ? (
                        <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-700">Starting soon</span>
                      ) : null}
                      {m.remote_url ? (
                        <span className="rounded bg-foreground/5 px-2 py-0.5">Remote</span>
                      ) : null}
                      {m.livestream_url ? (
                        <span className="rounded bg-foreground/5 px-2 py-0.5">Livestream</span>
                      ) : null}
                      {m.public_comment_instructions ? (
                        <span className="rounded bg-foreground/5 px-2 py-0.5">Public comment</span>
                      ) : null}
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
                  </div>
                  <div className="mt-2 text-base font-semibold">{m.title}</div>
                  <div className="mt-1 text-sm text-foreground/70">
                    {m.location ? m.location : "Location TBD"}
                  </div>
                  <div className="mt-3 text-sm text-foreground/80">
                    {formatInOfficeTz(m.starts_at)} → {formatInOfficeTz(m.ends_at)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {duration ? <span className="text-foreground/60">{duration}</span> : null}
                    {relative ? <span className="text-foreground/60">{relative}</span> : null}
                    <ComplianceBadge label="Notice" posted={noticePosted} />
                    <ComplianceBadge label="Agenda" posted={agendaPosted} />
                    <ComplianceBadge label="Minutes" posted={minutesPosted} />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-foreground/50">
                      <span>Compliance progress</span>
                      <span>
                        {complianceSegments.filter((segment) => segment.posted).length}/{complianceSegments.length} posted
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      {complianceSegments.map((segment) => (
                        <div
                          key={segment.label}
                          title={`${segment.label} ${segment.posted ? "posted" : "missing"}`}
                          className={`h-1 rounded ${segment.posted ? "bg-green-500" : "bg-red-300"}`}
                        />
                      ))}
                    </div>
                  </div>
                  {m.description ? (
                    <div className="mt-3 text-sm text-foreground/70">{m.description}</div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-xs font-medium text-primary">
                      <span>View details</span>
                      <IconChevronRight className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleCopyMeetingLink(m);
                        }}
                      >
                        <IconLink className="h-3.5 w-3.5" />
                        Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDownloadCalendar(m);
                        }}
                      >
                        <IconCalendar className="h-3.5 w-3.5" />
                        Add to calendar
                      </Button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
