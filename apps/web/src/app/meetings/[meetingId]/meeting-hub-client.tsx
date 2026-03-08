"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconAlert, IconCheck, IconChevronUp, IconClock, IconPlus } from "@/components/ui/icons";
import type { DocRow } from "@/lib/doc-types";

import { AgendaItemsPanel } from "./agenda-items-panel";
import { MeetingActions } from "./meeting-actions";
import { MeetingDocsPanel } from "./meeting-docs-panel";

type Meeting = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
  remote_url: string | null;
  livestream_url: string | null;
  public_comment_instructions: string | null;
  notice_posted_at: string | null;
  agenda_posted_at: string | null;
  minutes_posted_at: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

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

function formatDateTime(iso: string | null, fallback: string = "Not posted", timeZone?: string | null): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
    timeZoneName: "short",
  }).format(d);
}

function formatTime(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
    timeZoneName: "short",
  }).format(d);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

type TimelineStatus = "on-time" | "late" | "pending" | "overdue" | "info";

function timelineStatusMeta(status: TimelineStatus) {
  switch (status) {
    case "on-time":
      return {
        label: "On time",
        pillClass: "bg-green-100 text-green-700",
        icon: <IconCheck className="h-3.5 w-3.5 text-green-700" />,
      };
    case "late":
      return {
        label: "Late",
        pillClass: "bg-red-100 text-red-700",
        icon: <IconAlert className="h-3.5 w-3.5 text-red-700" />,
      };
    case "overdue":
      return {
        label: "Overdue",
        pillClass: "bg-red-100 text-red-700",
        icon: <IconAlert className="h-3.5 w-3.5 text-red-700" />,
      };
    case "pending":
      return {
        label: "Pending",
        pillClass: "bg-yellow-100 text-yellow-700",
        icon: <IconClock className="h-3.5 w-3.5 text-yellow-700" />,
      };
    default:
      return {
        label: "Info",
        pillClass: "bg-gray-100 text-gray-700",
        icon: <IconClock className="h-3.5 w-3.5 text-gray-700" />,
      };
  }
}

function formatCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMs = ts - Date.now();
  const hours = Math.abs(diffMs) / 3600000;
  const label = `${hours.toFixed(1)} hours`;
  return diffMs >= 0 ? `${label} left` : `${label} past deadline`;
}

function TimelineRow({
  title,
  value,
  status,
  caption,
}: {
  title: string;
  value: string;
  status: TimelineStatus;
  caption?: string | null;
}) {
  const meta = timelineStatusMeta(status);
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${meta.pillClass}`}>
        {meta.icon}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/70">{title}</span>
          <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.pillClass}`}>
            {meta.label}
          </span>
        </div>
        <div className="text-sm">{value}</div>
        {caption ? <div className="text-xs text-foreground/60">{caption}</div> : null}
      </div>
    </div>
  );
}

export function MeetingHubClient({
  meeting,
  initialItems,
  initialDeadline,
  initialDocs,
  officeTz,
  isAdmin,
  canManageDocs,
  userId,
}: {
  meeting: Meeting;
  initialItems: AgendaItem[];
  initialDeadline: DeadlineInfo | null;
  initialDocs: DocRow[];
  officeTz: string | null;
  isAdmin: boolean;
  canManageDocs: boolean;
  userId: string;
}) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);

  const acceptedAgendaCount = useMemo(
    () => items.filter((item) => item.state === "accepted" || item.state === "tabled").length,
    [items],
  );
  const agendaDocCount = useMemo(() => docs.filter((doc) => doc.doc_type === "agenda").length, [docs]);
  const minutesDocCount = useMemo(() => docs.filter((doc) => doc.doc_type === "minutes").length, [docs]);

  const meetingStatusBadge = statusBadge(meeting.status);
  const postingDeadline = initialDeadline?.posting_deadline ?? null;
  const agendaPostedAt = meeting.agenda_posted_at;
  const noticePostedAt = meeting.notice_posted_at;
  const submissionDeadline = initialDeadline?.submission_deadline ?? null;
  const agendaOnTime =
    agendaPostedAt && postingDeadline
      ? new Date(agendaPostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;
  const noticeOnTime =
    noticePostedAt && postingDeadline
      ? new Date(noticePostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;
  const nowTs = new Date().getTime();
  const postingDeadlineTs = postingDeadline ? new Date(postingDeadline).getTime() : null;
  const deadlineStatus: TimelineStatus =
    postingDeadlineTs === null ? "info" : nowTs > postingDeadlineTs ? "overdue" : "pending";
  const noticeStatus: TimelineStatus = noticePostedAt
    ? noticeOnTime
      ? "on-time"
      : "late"
    : postingDeadlineTs && nowTs > postingDeadlineTs
      ? "overdue"
      : "pending";
  const agendaStatus: TimelineStatus = agendaPostedAt
    ? agendaOnTime
      ? "on-time"
      : "late"
    : postingDeadlineTs && nowTs > postingDeadlineTs
      ? "overdue"
      : "pending";
  const minutesStatus: TimelineStatus = meeting.minutes_posted_at ? "on-time" : "pending";
  const submissionOpen = meeting.status === "scheduled" && (initialDeadline ? initialDeadline.is_submission_open : true);
  const postingCountdown = formatCountdown(postingDeadline);
  const submissionCountdown = formatCountdown(submissionDeadline);
  const submissionStatus: TimelineStatus = initialDeadline
    ? initialDeadline.is_past_deadline
      ? "overdue"
      : initialDeadline.is_submission_open
        ? "pending"
        : "info"
    : "info";

  const publishTotal = 3;
  const publishComplete =
    (acceptedAgendaCount > 0 ? 1 : 0) + (agendaDocCount > 0 ? 1 : 0) + (minutesDocCount > 0 ? 1 : 0);
  const publishPercent = Math.round((publishComplete / publishTotal) * 100);
  const minutesNeedsAttention = meeting.status === "completed" && minutesStatus !== "on-time";
  const complianceNeedsAttention =
    deadlineStatus === "overdue" ||
    noticeStatus === "late" ||
    agendaStatus === "late" ||
    agendaStatus === "overdue" ||
    minutesNeedsAttention;

  const breadcrumbs = isAdmin
    ? [
        { href: "/admin/meetings", label: "Admin" },
        { href: "/meetings", label: "Meetings" },
      ]
    : [{ href: "/meetings", label: "Meetings" }];

  const taskPrefillUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("prefillTitle", `Follow-up: ${meeting.title}`);
    const startLabel = formatDateTime(meeting.starts_at, "TBD", officeTz);
    const endLabel = formatTime(meeting.ends_at, officeTz);
    const details = [
      `Meeting: ${meeting.title}`,
      `When: ${startLabel} - ${endLabel}`,
      meeting.location ? `Location: ${meeting.location}` : null,
      meeting.remote_url ? `Remote: ${meeting.remote_url}` : null,
      meeting.livestream_url ? `Livestream: ${meeting.livestream_url}` : null,
      `Meeting hub: /meetings/${meeting.id}`,
    ]
      .filter(Boolean)
      .join("\n");
    if (details) params.set("prefillDescription", details);
    if (meeting.committee_id) params.set("committeeId", meeting.committee_id);
    const meetingDate = new Date(meeting.starts_at);
    if (!Number.isNaN(meetingDate.getTime())) {
      const nowForPrefill = new Date();
      const dueDate = meetingDate.getTime() >= nowForPrefill.getTime() ? meetingDate : addDays(nowForPrefill, 7);
      params.set("prefillDue", formatDateInputValue(dueDate));
    }
    params.set("source", "meeting");
    params.set("meetingId", meeting.id);
    return `/tasks?${params.toString()}`;
  }, [meeting, officeTz]);

  const quickLinkClass =
    "inline-flex items-center rounded-md border border-foreground/10 bg-foreground/5 px-2 py-1 text-xs text-foreground/70 transition hover:bg-foreground/10";

  const submissionMeta = timelineStatusMeta(submissionStatus);
  const postingMeta = timelineStatusMeta(deadlineStatus);

  const sectionLinks = [
    { href: "#overview", label: "Meeting overview" },
    { href: "#compliance-timeline", label: "Compliance timeline" },
    { href: "#publish-checklist", label: "Publish checklist" },
    { href: "#agenda-items", label: "Agenda items" },
    { href: "#agenda-filters", label: "Filters & export" },
    { href: "#meeting-docs", label: "Meeting documents" },
  ];

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-2">
            {index > 0 ? <span className="text-foreground/40">/</span> : null}
            <Link className="hover:text-foreground hover:underline underline-offset-4" href={crumb.href}>
              {crumb.label}
            </Link>
          </span>
        ))}
        <span className="text-foreground/40">/</span>
        <span className="text-foreground/80">Meeting hub</span>
        <span className="text-foreground/40">/</span>
        <span className="text-foreground/80">{meeting.title}</span>
      </nav>

      {submissionOpen ? (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm">
          <div className="font-medium">Agenda submissions are open</div>
          <div className="mt-1 text-xs text-foreground/70">
            Submit items before the deadline so they can be reviewed and placed on the agenda.
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("agenda:open-form"));
                const target =
                  document.getElementById("new-agenda-item") ?? document.getElementById("agenda-items");
                target?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <IconPlus className="h-3.5 w-3.5" />
              Submit an agenda item
            </Button>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Compliance snapshot</div>
            <div className="text-xs text-foreground/60">
              Key deadlines and posting status for this meeting.
            </div>
          </div>
          {complianceNeedsAttention ? (
            <span className="rounded px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100">
              Needs attention
            </span>
          ) : (
            <span className="rounded px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100">
              On track
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <a
            href="#agenda-items"
            className="rounded-md border border-foreground/10 bg-background px-3 py-2 transition hover:border-foreground/30 hover:bg-foreground/5"
          >
            <div className="flex items-center gap-2 text-xs text-foreground/70">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${submissionMeta.pillClass}`}>
                {submissionMeta.icon}
              </span>
              <span className="uppercase tracking-wide">{submissionMeta.label}</span>
            </div>
            <div className="mt-1 text-sm font-medium">Submission deadline</div>
            <div className="text-sm">{formatDateTime(submissionDeadline, "Not available", officeTz)}</div>
            {submissionCountdown ? (
              <div className="mt-1 text-xs text-foreground/60">{submissionCountdown}</div>
            ) : null}
          </a>
          <a
            href="#meeting-docs"
            className="rounded-md border border-foreground/10 bg-background px-3 py-2 transition hover:border-foreground/30 hover:bg-foreground/5"
          >
            <div className="flex items-center gap-2 text-xs text-foreground/70">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${postingMeta.pillClass}`}>
                {postingMeta.icon}
              </span>
              <span className="uppercase tracking-wide">{postingMeta.label}</span>
            </div>
            <div className="mt-1 text-sm font-medium">Agenda posting deadline</div>
            <div className="text-sm">{formatDateTime(postingDeadline, "Not available", officeTz)}</div>
            {postingCountdown ? (
              <div className="mt-1 text-xs text-foreground/60">{postingCountdown}</div>
            ) : null}
          </a>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <section id="overview" className="rounded-lg border border-foreground/10 p-4 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xl font-semibold">{meeting.title}</div>
                  <span className={`rounded px-2 py-0.5 text-xs ${meetingStatusBadge.className}`}>
                    {meetingStatusBadge.label}
                  </span>
                </div>
                <div className="mt-1 text-sm text-foreground/70">
                  {formatMeetingType(meeting.meeting_type)} meeting
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm text-foreground/80">
              <div>
                <div className="text-xs text-foreground/70">Date & time</div>
                <div>
                  {formatDateTime(meeting.starts_at, "TBD", officeTz)} - {formatTime(meeting.ends_at, officeTz)}
                </div>
                <div className="text-xs text-foreground/60">
                  Times shown in {officeTz ?? "your local time"}.
                </div>
              </div>
              <div>
                <div className="text-xs text-foreground/70">Location</div>
                <div>{meeting.location ?? "TBD"}</div>
              </div>
              {meeting.remote_url ? (
                <div>
                  <div className="text-xs text-foreground/70">Remote</div>
                  <a className="underline underline-offset-2" href={meeting.remote_url} target="_blank" rel="noreferrer">
                    {meeting.remote_url}
                  </a>
                </div>
              ) : null}
              {meeting.livestream_url ? (
                <div>
                  <div className="text-xs text-foreground/70">Livestream</div>
                  <a className="underline underline-offset-2" href={meeting.livestream_url} target="_blank" rel="noreferrer">
                    {meeting.livestream_url}
                  </a>
                </div>
              ) : null}
              {meeting.description ? (
                <div>
                  <div className="text-xs text-foreground/70">Description</div>
                  <div>{meeting.description}</div>
                </div>
              ) : null}
              {meeting.public_comment_instructions ? (
                <div>
                  <div className="text-xs text-foreground/70">Public comment</div>
                  <div className="whitespace-pre-line">{meeting.public_comment_instructions}</div>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <MeetingActions
                meeting={{
                  id: meeting.id,
                  title: meeting.title,
                  starts_at: meeting.starts_at,
                  ends_at: meeting.ends_at,
                  location: meeting.location,
                  description: meeting.description,
                  remote_url: meeting.remote_url,
                  livestream_url: meeting.livestream_url,
                }}
                officeTz={officeTz}
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-foreground/10 p-4 lg:sticky lg:top-20">
            <div className="text-sm font-medium">Jump to</div>
            <div className="mt-2 grid gap-2 text-xs text-foreground/70">
              {sectionLinks.map((link) => (
                <a key={link.href} href={link.href} className="rounded px-2 py-1 hover:bg-foreground/5">
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div id="compliance-timeline" className="rounded-lg border border-foreground/10 p-4 scroll-mt-24">
            <div className="text-base font-semibold">Compliance timeline</div>
            <div className="mt-3 space-y-3">
              <TimelineRow
                title="Agenda posting deadline"
                value={formatDateTime(postingDeadline, "Not available", officeTz)}
                status={deadlineStatus}
                caption={
                  [initialDeadline?.is_special ? "Special meeting timeline applied" : null, postingCountdown]
                    .filter(Boolean)
                    .join(" • ") || null
                }
              />
              <TimelineRow
                title="Notice posted at"
                value={formatDateTime(noticePostedAt, "Not posted", officeTz)}
                status={noticeStatus}
                caption={
                  noticeOnTime !== null
                    ? noticeOnTime
                      ? "Notice posted before the deadline."
                      : "Notice posted after the deadline."
                    : null
                }
              />
              <TimelineRow
                title="Agenda posted at"
                value={formatDateTime(agendaPostedAt, "Not posted", officeTz)}
                status={agendaStatus}
                caption={
                  agendaOnTime !== null
                    ? agendaOnTime
                      ? "Agenda posted before the deadline."
                      : "Agenda posted after the deadline."
                    : null
                }
              />
              <TimelineRow
                title="Minutes posted at"
                value={formatDateTime(meeting.minutes_posted_at, "Not posted", officeTz)}
                status={minutesStatus}
                caption={meeting.minutes_posted_at ? "Minutes posted." : "Minutes not posted yet."}
              />
            </div>
          </div>

          <div id="publish-checklist" className="rounded-lg border border-foreground/10 p-4 scroll-mt-24">
            <div className="text-base font-semibold">Publish checklist</div>
            <div className="mt-2 text-xs text-foreground/60">
              {publishComplete} of {publishTotal} steps complete.
            </div>
            <div
              className="mt-2 h-2 w-full rounded bg-foreground/10"
              role="progressbar"
              aria-valuenow={publishPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${publishComplete} of ${publishTotal} steps complete`}
            >
              <div className="h-2 rounded bg-primary" style={{ width: `${publishPercent}%` }} />
            </div>
            <div className="mt-3 grid gap-2 text-sm">
              <a
                href="#agenda-items"
                className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-foreground/5"
              >
                <span>Accepted agenda items</span>
                <span className={`text-xs ${acceptedAgendaCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {acceptedAgendaCount > 0 ? `${acceptedAgendaCount} ready` : "No accepted items yet"}
                </span>
              </a>
              <a
                href="#meeting-docs"
                className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-foreground/5"
              >
                <span>Agenda document</span>
                <span className={`text-xs ${agendaDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {agendaDocCount > 0 ? "Uploaded" : "Missing upload"}
                </span>
              </a>
              <a
                href="#meeting-docs"
                className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-foreground/5"
              >
                <span>Minutes document</span>
                <span className={`text-xs ${minutesDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {minutesDocCount > 0 ? "Uploaded" : "Missing upload"}
                </span>
              </a>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span>Complete these steps in:</span>
              <a href="#agenda-items" className="underline underline-offset-2 hover:text-foreground">
                Agenda items
              </a>
              <a href="#meeting-docs" className="underline underline-offset-2 hover:text-foreground">
                Meeting documents
              </a>
            </div>
          </div>

          <div id="see-also" className="rounded-lg border border-foreground/10 p-4 scroll-mt-24">
            <div className="text-base font-semibold">See also</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={taskPrefillUrl} className={quickLinkClass}>
                Create task
              </Link>
              <Link href="/finance" className={quickLinkClass}>
                Finance dashboard
              </Link>
              <Link href="/docs" className={quickLinkClass}>
                Documents
              </Link>
            </div>
            <div className="mt-2 text-xs text-foreground/60">
              Track follow-ups and fiscal impact items in Tasks and Finance.
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div id="agenda-items" className="scroll-mt-24">
          <h2 className="mb-4 text-xl font-semibold">Agenda Items</h2>
          <AgendaItemsPanel
            meetingId={meeting.id}
            initialItems={initialItems}
            initialDeadline={initialDeadline}
            isAdmin={isAdmin}
            userId={userId}
            meetingTitle={meeting.title}
            meetingCommitteeId={meeting.committee_id}
            meetingStartsAt={meeting.starts_at}
            meetingType={meeting.meeting_type}
            officeTz={officeTz}
            meetingStatus={meeting.status}
            onItemsChange={setItems}
          />
        </div>
        <div id="meeting-docs" className="scroll-mt-24">
          <h2 className="mb-4 text-xl font-semibold">Meeting Documents</h2>
          <MeetingDocsPanel
            meetingId={meeting.id}
            committeeId={meeting.committee_id}
            canManageDocs={canManageDocs}
            initialDocs={initialDocs}
            acceptedAgendaCount={acceptedAgendaCount}
            meetingStatus={meeting.status}
            meetingTitle={meeting.title}
            agendaPostedAt={meeting.agenda_posted_at}
            minutesPostedAt={meeting.minutes_posted_at}
            onDocsChange={setDocs}
          />
        </div>
      </div>

      {showBackToTop ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-4 z-30 shadow-md sm:bottom-6 sm:right-6"
          title="Back to top"
          aria-label="Back to top"
        >
          <IconChevronUp className="h-3.5 w-3.5" />
          Back to top
        </Button>
      ) : null}
    </div>
  );
}
