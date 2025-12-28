"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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

export function MeetingHubClient({
  meeting,
  initialItems,
  initialDeadline,
  initialDocs,
  officeTz,
  isAdmin,
  userId,
}: {
  meeting: Meeting;
  initialItems: AgendaItem[];
  initialDeadline: DeadlineInfo | null;
  initialDocs: DocRow[];
  officeTz: string | null;
  isAdmin: boolean;
  userId: string;
}) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);

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
  const agendaOnTime =
    agendaPostedAt && postingDeadline
      ? new Date(agendaPostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;
  const noticeOnTime =
    noticePostedAt && postingDeadline
      ? new Date(noticePostedAt).getTime() <= new Date(postingDeadline).getTime()
      : null;
  const submissionOpen = meeting.status === "scheduled" && (initialDeadline ? initialDeadline.is_submission_open : true);

  const breadcrumbs = isAdmin
    ? [
        { href: "/admin?tab=meetings", label: "Admin" },
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
    params.set("source", "meeting");
    params.set("meetingId", meeting.id);
    return `/tasks?${params.toString()}`;
  }, [meeting, officeTz]);

  const quickLinkClass =
    "inline-flex items-center rounded-md border border-foreground/10 bg-foreground/5 px-2 py-1 text-xs text-foreground/70 transition hover:bg-foreground/10";

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-2">
            {index > 0 ? <span className="text-foreground/40">/</span> : null}
            <Link className="hover:text-foreground" href={crumb.href}>
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
              onClick={() => document.getElementById("agenda-items")?.scrollIntoView({ behavior: "smooth" })}
            >
              Submit an agenda item
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold">{meeting.title}</div>
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
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="text-sm font-medium">Compliance timeline</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <div className="text-xs text-foreground/70">Agenda posting deadline</div>
                <div className="text-sm">{formatDateTime(postingDeadline, "Not available", officeTz)}</div>
                {initialDeadline?.is_special ? (
                  <div className="text-xs text-foreground/60">Special meeting timeline applied</div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-foreground/70">Notice posted at</div>
                <div className="text-sm">{formatDateTime(noticePostedAt, "Not posted", officeTz)}</div>
                {noticeOnTime !== null ? (
                  <div
                    className={`text-xs ${noticeOnTime ? "text-green-600" : "text-red-600"}`}
                    title={
                      noticeOnTime
                        ? "Notice posted before the agenda deadline."
                        : "Notice posted after the agenda deadline."
                    }
                  >
                    {noticeOnTime ? "On time" : "Late"}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-foreground/70">Agenda posted at</div>
                <div className="text-sm">{formatDateTime(agendaPostedAt, "Not posted", officeTz)}</div>
                {agendaOnTime !== null ? (
                  <div
                    className={`text-xs ${agendaOnTime ? "text-green-600" : "text-red-600"}`}
                    title={
                      agendaOnTime
                        ? "Agenda posted before the deadline."
                        : "Agenda posted after the deadline."
                    }
                  >
                    {agendaOnTime ? "On time" : "Late"}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-foreground/70">Minutes posted at</div>
                <div className="text-sm">{formatDateTime(meeting.minutes_posted_at, "Not posted", officeTz)}</div>
                <div
                  className={`text-xs ${meeting.minutes_posted_at ? "text-green-600" : "text-red-600"}`}
                  title={meeting.minutes_posted_at ? "Minutes posted." : "Minutes not posted yet."}
                >
                  {meeting.minutes_posted_at ? "Posted" : "Missing"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="text-sm font-medium">Publish checklist</div>
            <div className="mt-2 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Accepted agenda items</span>
                <span className={`text-xs ${acceptedAgendaCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {acceptedAgendaCount} {acceptedAgendaCount === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Agenda document</span>
                <span className={`text-xs ${agendaDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {agendaDocCount > 0 ? "Uploaded" : "Missing"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Minutes document</span>
                <span className={`text-xs ${minutesDocCount > 0 ? "text-green-600" : "text-foreground/60"}`}>
                  {minutesDocCount > 0 ? "Uploaded" : "Missing"}
                </span>
              </div>
            </div>
            <div className="mt-2 text-xs text-foreground/60">
              Use Agenda Items and Meeting Documents below to complete each step.
            </div>
          </div>

          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="text-sm font-medium">See also</div>
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
        <div id="agenda-items">
          <h2 className="mb-4 text-lg font-medium">Agenda Items</h2>
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
        <div>
          <h2 className="mb-4 text-lg font-medium">Meeting Documents</h2>
          <MeetingDocsPanel
            meetingId={meeting.id}
            committeeId={meeting.committee_id}
            isAdmin={isAdmin}
            initialDocs={initialDocs}
            acceptedAgendaCount={acceptedAgendaCount}
            meetingStatus={meeting.status}
            onDocsChange={setDocs}
          />
        </div>
      </div>
    </div>
  );
}
