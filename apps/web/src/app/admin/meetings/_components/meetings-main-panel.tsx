"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";

type CommitteeRow = {
  id: string;
  name: string;
  committee_key: string;
};

type MeetingRow = {
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
  created_at: string;
  updated_at: string;
};

function formatMeetingTypeLabel(type: string) {
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

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export function MeetingsMainPanel({
  initialMeetings,
  initialCommittees,
  isReadOnly,
}: {
  initialMeetings: MeetingRow[];
  initialCommittees: CommitteeRow[];
  isReadOnly: boolean;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [committees, setCommittees] = useState(initialCommittees);
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const [submittingMeeting, setSubmittingMeeting] = useState(false);
  const [submittingCommittee, setSubmittingCommittee] = useState(false);
  const [activeCommitteeId, setActiveCommitteeId] = useState("");

  const [meetingType, setMeetingType] = useState("board");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingCommitteeId, setMeetingCommitteeId] = useState("");
  const [meetingStartsAt, setMeetingStartsAt] = useState("");
  const [meetingEndsAt, setMeetingEndsAt] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");

  const [committeeName, setCommitteeName] = useState("");
  const [committeeKey, setCommitteeKey] = useState("");

  const now = Date.now();
  const upcomingMeetings = useMemo(
    () =>
      [...meetings]
        .filter((meeting) => new Date(meeting.starts_at).getTime() >= now && meeting.status !== "cancelled")
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [meetings, now],
  );
  const existingMeetings = useMemo(
    () =>
      [...meetings]
        .filter((meeting) => new Date(meeting.starts_at).getTime() < now || meeting.status === "cancelled")
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [meetings, now],
  );

  async function refreshCommittees() {
    const { committees: nextCommittees } = await fetchJson<{ committees: CommitteeRow[] }>("/api/admin/committees");
    setCommittees(nextCommittees);
  }

  async function handleCreateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingMeeting(true);
    setFeedback(null);

    try {
      const startsAt = toIsoOrNull(meetingStartsAt);
      const endsAt = toIsoOrNull(meetingEndsAt);
      if (!startsAt || !endsAt) {
        throw new Error("Choose both a start and end time.");
      }

      const { meeting } = await fetchJson<{ meeting: MeetingRow }>("/api/admin/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meeting_type: meetingType,
          title: meetingTitle,
          committee_id: meetingType === "committee" ? meetingCommitteeId || undefined : undefined,
          starts_at: startsAt,
          ends_at: endsAt,
          location: meetingLocation || undefined,
        }),
      });

      setMeetings((current) => [meeting, ...current]);
      setMeetingTitle("");
      setMeetingCommitteeId("");
      setMeetingStartsAt("");
      setMeetingEndsAt("");
      setMeetingLocation("");
      setFeedback({ tone: "positive", message: "Meeting created. Open it from the queue to finish the details." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not create meeting." });
    } finally {
      setSubmittingMeeting(false);
    }
  }

  async function handleCreateCommittee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingCommittee(true);
    setFeedback(null);

    try {
      const { committee } = await fetchJson<{ committee: CommitteeRow }>("/api/admin/committees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: committeeName, committee_key: committeeKey }),
      });
      setCommittees((current) => [...current, committee].sort((a, b) => a.name.localeCompare(b.name)));
      setCommitteeName("");
      setCommitteeKey("");
      setFeedback({ tone: "positive", message: `${committee.name} is ready to use in meeting creation.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not create committee." });
    } finally {
      setSubmittingCommittee(false);
    }
  }

  async function deleteCommittee(id: string) {
    if (!window.confirm("Delete this committee?")) return;

    setActiveCommitteeId(id);
    setFeedback(null);

    try {
      await fetchJson(`/api/admin/committees/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshCommittees();
      setFeedback({ tone: "positive", message: "Committee removed." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not delete committee." });
    } finally {
      setActiveCommitteeId("");
    }
  }

  return (
    <div className="space-y-8">
      <AdminSectionNav
        activeId="queue"
        items={[
          { id: "queue", label: "Queue", href: "/admin/meetings" },
          { id: "create", label: "Create", href: "/admin/meetings#admin-meetings-create" },
          { id: "committees", label: "Committees", href: "/admin/meetings#admin-meetings-committees" },
          { id: "existing", label: "Existing", href: "/admin/meetings#admin-meetings-existing" },
        ]}
      />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}
      {isReadOnly ? (
        <AdminInlineNotice tone="warning">
          Read-only access is active. You can review the queue and open meetings, but creation and committee changes are disabled.
        </AdminInlineNotice>
      ) : null}

      <AdminSurface id="admin-meetings-create" title="Create a meeting" description="Keep the first step short. Full editing lives on the meeting page once the record exists.">
        <form className="grid gap-4 xl:grid-cols-[12rem_minmax(0,1.5fr)_14rem_minmax(0,1fr)_auto]" onSubmit={handleCreateMeeting}>
          <AdminField label="Type">
            <select value={meetingType} onChange={(event) => setMeetingType(event.target.value)}>
              <option value="board">Board</option>
              <option value="committee">Committee</option>
              <option value="icc">ICC</option>
              <option value="special">Special</option>
            </select>
          </AdminField>
          <AdminField label="Title">
            <input value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="Regular board meeting" />
          </AdminField>
          <AdminField label="Committee" hint={meetingType === "committee" ? "Required for committee meetings" : "Optional"}>
            <select value={meetingCommitteeId} onChange={(event) => setMeetingCommitteeId(event.target.value)} disabled={meetingType !== "committee"}>
              <option value="">Choose a committee</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Location">
            <input value={meetingLocation} onChange={(event) => setMeetingLocation(event.target.value)} placeholder="Student center board room" />
          </AdminField>
          <div className="flex items-end">
            <Button className="h-12 rounded-full px-5" type="submit" disabled={isReadOnly || submittingMeeting || meetingTitle.trim().length === 0}>
              {submittingMeeting ? "Creating..." : "Create"}
            </Button>
          </div>
          <AdminField label="Starts">
            <input type="datetime-local" value={meetingStartsAt} onChange={(event) => setMeetingStartsAt(event.target.value)} />
          </AdminField>
          <AdminField label="Ends">
            <input type="datetime-local" value={meetingEndsAt} onChange={(event) => setMeetingEndsAt(event.target.value)} />
          </AdminField>
        </form>
      </AdminSurface>

      <AdminSurface
        id="admin-meetings-upcoming"
        title="Upcoming queue"
        description="Scheduled meetings stay here until notice, agenda, and detail work are finished."
        action={<span className="text-sm text-foreground/55">{upcomingMeetings.length} upcoming</span>}
      >
        {upcomingMeetings.length === 0 ? (
          <AdminEmptyState title="No upcoming meetings" description="Create a meeting above when the next item needs to get on the calendar." />
        ) : (
          <div className="admin-data-list">
            {upcomingMeetings.map((meeting) => (
              <a key={meeting.id} href={`/meetings/${meeting.id}`} className="rounded-[1.4rem] border border-[var(--admin-border-soft)] bg-white/80 px-5 py-5 transition hover:-translate-y-px hover:border-[var(--admin-border-strong)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">{meeting.title}</h3>
                      <span className="admin-domain-badge">{formatMeetingTypeLabel(meeting.meeting_type)}</span>
                      {meeting.notice_posted_at ? null : <span className="admin-domain-badge">Notice needed</span>}
                      {meeting.agenda_posted_at ? null : <span className="admin-domain-badge">Agenda needed</span>}
                    </div>
                    <p className="text-sm leading-7 text-foreground/58">
                      {new Date(meeting.starts_at).toLocaleString()} to {new Date(meeting.ends_at).toLocaleString()}
                      {meeting.location ? ` · ${meeting.location}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary">Open meeting</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </AdminSurface>

      <AdminSurface
        id="admin-meetings-committees"
        title="Committees"
        description="Committee creation stays separate from meeting creation, so the queue stays easier to understand."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <form className="grid gap-4" onSubmit={handleCreateCommittee}>
            <AdminField label="Committee name">
              <input value={committeeName} onChange={(event) => setCommitteeName(event.target.value)} placeholder="Finance committee" />
            </AdminField>
            <AdminField label="Committee key" hint="letters, numbers, underscores, or hyphens">
              <input value={committeeKey} onChange={(event) => setCommitteeKey(event.target.value)} placeholder="finance" />
            </AdminField>
            <Button className="h-12 rounded-full px-5" type="submit" disabled={isReadOnly || submittingCommittee || committeeName.trim().length === 0 || committeeKey.trim().length === 0}>
              {submittingCommittee ? "Saving..." : "Add committee"}
            </Button>
          </form>

          {committees.length === 0 ? (
            <AdminEmptyState title="No committees yet" description="Create the first committee here, then attach it while creating meetings." />
          ) : (
            <div className="admin-data-list">
              {committees.map((committee) => (
                <div key={committee.id} className="rounded-[1.3rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-foreground">{committee.name}</div>
                      <div className="mt-1 text-sm text-foreground/58">{committee.committee_key}</div>
                    </div>
                    {!isReadOnly ? (
                      <Button
                        variant="ghost"
                        className="h-11 rounded-full px-4"
                        disabled={activeCommitteeId === committee.id}
                        onClick={() => deleteCommittee(committee.id)}
                      >
                        {activeCommitteeId === committee.id ? "Removing..." : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminSurface>

      <AdminSurface
        id="admin-meetings-existing"
        title="Existing meetings"
        description="Older or cancelled meetings stay here, and detail editing happens on the meeting pages instead of inline."
      >
        {existingMeetings.length === 0 ? (
          <AdminEmptyState title="No older meetings yet" description="Past or cancelled meetings will collect here automatically." />
        ) : (
          <div className="admin-data-list">
            {existingMeetings.map((meeting) => (
              <a key={meeting.id} href={`/meetings/${meeting.id}`} className="rounded-[1.3rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4 transition hover:-translate-y-px hover:border-[var(--admin-border-strong)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-foreground">{meeting.title}</div>
                    <div className="mt-1 text-sm text-foreground/58">
                      {formatMeetingTypeLabel(meeting.meeting_type)} · {meeting.status} · {new Date(meeting.starts_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-primary">Open meeting</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
