"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type MeetingActionsProps = {
  meeting: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    description: string | null;
    remote_url: string | null;
    livestream_url: string | null;
  };
  officeTz?: string | null;
};

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

function buildIcs(meeting: MeetingActionsProps["meeting"]): string {
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

export function MeetingActions({ meeting, officeTz }: MeetingActionsProps) {
  const [status, setStatus] = useState("");

  function formatSummaryDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
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
  }

  function formatSummaryTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    if (!officeTz) return d.toLocaleTimeString();
    return new Intl.DateTimeFormat(undefined, {
      timeZone: officeTz,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(d);
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus("Copy failed. Your browser may block clipboard access.");
    }
  }

  function buildSummary() {
    const start = formatSummaryDate(meeting.starts_at);
    const end = formatSummaryTime(meeting.ends_at);
    const lines = [
      meeting.title,
      `${start} - ${end}`,
      meeting.location ? `Location: ${meeting.location}` : null,
      meeting.remote_url ? `Remote: ${meeting.remote_url}` : null,
      meeting.livestream_url ? `Livestream: ${meeting.livestream_url}` : null,
    ].filter(Boolean) as string[];
    return lines.join("\n");
  }

  function handleDownloadCalendar() {
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
    setStatus("Calendar file downloaded.");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copyText("Meeting link", window.location.href)}>
          Copy link
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copyText("Meeting summary", buildSummary())}>
          Copy summary
        </Button>
        {meeting.remote_url ? (
          <Button size="sm" variant="outline" onClick={() => void copyText("Remote link", meeting.remote_url!)}>
            Copy remote link
          </Button>
        ) : null}
        {meeting.livestream_url ? (
          <Button size="sm" variant="outline" onClick={() => void copyText("Livestream link", meeting.livestream_url!)}>
            Copy livestream link
          </Button>
        ) : null}
        <Button size="sm" onClick={handleDownloadCalendar}>
          Add to calendar
        </Button>
      </div>
      {status ? (
        <div className="text-xs text-foreground/60" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </div>
  );
}
